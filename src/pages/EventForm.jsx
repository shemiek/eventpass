import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'
import FormFieldBuilder from '../components/FormFieldBuilder'
import TicketTierBuilder from '../components/TicketTierBuilder'
import SessionBuilder from '../components/SessionBuilder'
import TeamManager from '../components/TeamManager'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)
}

export default function EventForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerUrl, setBannerUrl] = useState('')
  const [status, setStatus] = useState('published')
  const [capacity, setCapacity] = useState('')
  const [badgeAccent, setBadgeAccent] = useState('#1C2544')
  const [badgeFooter, setBadgeFooter] = useState('')
  const [fields, setFields] = useState([])
  const [tiers, setTiers] = useState([])
  const [sessions, setSessions] = useState([])
  const [team, setTeam] = useState([]) // only usable once event exists (has an id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isEdit) load()
  }, [id])

  async function load() {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single()
    if (error) { setError(error.message); return }
    setTitle(data.title)
    setDescription(data.description || '')
    setEventDate(data.event_date ? data.event_date.slice(0, 16) : '')
    setLocation(data.location || '')
    setBannerUrl(data.banner_url || '')
    setStatus(data.status || 'published')
    setCapacity(data.capacity ?? '')
    setBadgeAccent(data.badge_accent || '#1C2544')
    setBadgeFooter(data.badge_footer_text || '')
    setFields(data.form_schema || [])

    const { data: tt } = await supabase.from('ticket_types').select('*').eq('event_id', id).order('sort_order')
    setTiers((tt || []).map(t => ({ id: t.id, name: t.name, capacity: t.capacity ?? '', price: t.price ?? '' })))

    const { data: ss } = await supabase.from('sessions').select('*').eq('event_id', id).order('sort_order')
    setSessions((ss || []).map(s => ({ id: s.id, title: s.title, starts_at: s.starts_at?.slice(0,16) || '', capacity: s.capacity ?? '' })))

    const { data: tm } = await supabase.from('team_members').select('*').eq('event_id', id)
    setTeam(tm || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let finalBannerUrl = bannerUrl
      if (bannerFile) {
        const path = `${user.id}/${Date.now()}-${bannerFile.name}`
        const { error: upErr } = await supabase.storage.from('banners').upload(path, bannerFile, { upsert: true })
        if (upErr) throw upErr
        finalBannerUrl = supabase.storage.from('banners').getPublicUrl(path).data.publicUrl
      }

      const payload = {
        title,
        description,
        event_date: eventDate ? new Date(eventDate).toISOString() : null,
        location,
        banner_url: finalBannerUrl,
        status,
        capacity: capacity === '' ? null : parseInt(capacity, 10),
        badge_accent: badgeAccent,
        badge_footer_text: badgeFooter,
        form_schema: fields
      }

      let eventId = id
      if (isEdit) {
        const { error: updErr } = await supabase.from('events').update(payload).eq('id', id)
        if (updErr) throw updErr
      } else {
        const { data, error: insErr } = await supabase
          .from('events')
          .insert({ ...payload, owner_id: user.id, slug: slugify(title) })
          .select()
          .single()
        if (insErr) throw insErr
        eventId = data.id
      }

      // Sync ticket tiers: delete removed, upsert the rest
      const { data: existingTiers } = await supabase.from('ticket_types').select('id').eq('event_id', eventId)
      const keepTierIds = tiers.filter(t => t.id).map(t => t.id)
      const removedTiers = (existingTiers || []).filter(t => !keepTierIds.includes(t.id)).map(t => t.id)
      if (removedTiers.length) await supabase.from('ticket_types').delete().in('id', removedTiers)
      for (const [i, t] of tiers.entries()) {
        if (!t.name.trim()) continue
        const row = { event_id: eventId, name: t.name, capacity: t.capacity === '' ? null : parseInt(t.capacity,10), price: t.price === '' ? null : parseFloat(t.price), sort_order: i }
        if (t.id) await supabase.from('ticket_types').update(row).eq('id', t.id)
        else await supabase.from('ticket_types').insert(row)
      }

      // Sync sessions
      const { data: existingSessions } = await supabase.from('sessions').select('id').eq('event_id', eventId)
      const keepSessionIds = sessions.filter(s => s.id).map(s => s.id)
      const removedSessions = (existingSessions || []).filter(s => !keepSessionIds.includes(s.id)).map(s => s.id)
      if (removedSessions.length) await supabase.from('sessions').delete().in('id', removedSessions)
      for (const [i, s] of sessions.entries()) {
        if (!s.title.trim()) continue
        const row = { event_id: eventId, title: s.title, starts_at: s.starts_at ? new Date(s.starts_at).toISOString() : null, capacity: s.capacity === '' ? null : parseInt(s.capacity,10), sort_order: i }
        if (s.id) await supabase.from('sessions').update(row).eq('id', s.id)
        else await supabase.from('sessions').insert(row)
      }

      navigate(`/events/${eventId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        {isEdit ? 'Edit event' : 'Create event'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
          <div>
            <p className="text-sm font-medium text-ink">Status</p>
            <p className="text-xs text-mist">Draft events are hidden from the public registration link.</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Event title</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink">Date & time</label>
            <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Overall capacity <span className="font-normal text-mist">(blank = unlimited)</span></label>
          <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 300" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Event banner</label>
          {bannerUrl && <img src={bannerUrl} alt="" className="mt-2 h-32 rounded-lg object-cover" />}
          <input type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files[0])} className="mt-2 block text-sm" />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-sm font-medium text-ink mb-2">Badge customization</p>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs text-mist w-24">Accent color</label>
            <input type="color" value={badgeAccent} onChange={(e) => setBadgeAccent(e.target.value)} className="w-10 h-8 rounded border border-gray-300" />
            <span className="text-xs font-mono text-mist">{badgeAccent}</span>
          </div>
          <label className="text-xs text-mist">Badge footer text <span className="text-mist/70">(e.g. "Non-transferable" or sponsor line)</span></label>
          <input value={badgeFooter} onChange={(e) => setBadgeFooter(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-2">Ticket tiers <span className="font-normal text-mist">(optional — leave empty for a single free ticket type)</span></label>
          <TicketTierBuilder tiers={tiers} setTiers={setTiers} />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-2">Sessions / agenda <span className="font-normal text-mist">(optional — attendees pick sessions to attend)</span></label>
          <SessionBuilder sessions={sessions} setSessions={setSessions} />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-2">Custom registration fields</label>
          <FormFieldBuilder fields={fields} setFields={setFields} />
        </div>

        {error && <p className="text-sm text-stub">{error}</p>}

        <button disabled={busy} className="bg-navy text-paper font-medium rounded-lg px-5 py-2.5 hover:bg-ink transition-colors disabled:opacity-50">
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
        </button>
      </form>

      {isEdit && (
        <div className="mt-10 pt-8 border-t border-gray-200">
          <label className="text-sm font-medium text-ink block mb-2">Team & roles</label>
          <TeamManager eventId={id} team={team} setTeam={setTeam} />
        </div>
      )}
    </div>
  )
}
