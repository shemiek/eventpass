import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'
import FormFieldBuilder from '../components/FormFieldBuilder'

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
  const [staffEmails, setStaffEmails] = useState('')
  const [fields, setFields] = useState([])
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
    setStaffEmails((data.staff_emails || []).join(', '))
    setFields(data.form_schema || [])
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

      const staffList = staffEmails.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

      const payload = {
        title,
        description,
        event_date: eventDate ? new Date(eventDate).toISOString() : null,
        location,
        banner_url: finalBannerUrl,
        staff_emails: staffList,
        form_schema: fields
      }

      if (isEdit) {
        const { error: updErr } = await supabase.from('events').update(payload).eq('id', id)
        if (updErr) throw updErr
        navigate(`/events/${id}`)
      } else {
        const { data, error: insErr } = await supabase
          .from('events')
          .insert({ ...payload, owner_id: user.id, slug: slugify(title) })
          .select()
          .single()
        if (insErr) throw insErr
        navigate(`/events/${data.id}`)
      }
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
        <div>
          <label className="text-sm font-medium text-ink">Event title</label>
          <input
            required value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Description</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink">Date & time</label>
            <input
              type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Location</label>
            <input
              value={location} onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Event banner</label>
          {bannerUrl && <img src={bannerUrl} alt="" className="mt-2 h-32 rounded-lg object-cover" />}
          <input
            type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files[0])}
            className="mt-2 block text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Check-in staff emails</label>
          <input
            value={staffEmails} onChange={(e) => setStaffEmails(e.target.value)}
            placeholder="staff1@example.com, staff2@example.com"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          />
          <p className="text-xs text-mist mt-1">
            These people need an EventPass account with this email to scan attendees at the door.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-2">Custom registration fields</label>
          <FormFieldBuilder fields={fields} setFields={setFields} />
        </div>

        {error && <p className="text-sm text-stub">{error}</p>}

        <button
          disabled={busy}
          className="bg-navy text-paper font-medium rounded-lg px-5 py-2.5 hover:bg-ink transition-colors disabled:opacity-50"
        >
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
        </button>
      </form>
    </div>
  )
}
