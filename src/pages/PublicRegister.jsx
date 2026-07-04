import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DynamicFormRenderer from '../components/DynamicFormRenderer'

export default function PublicRegister() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [tiers, setTiers] = useState([])
  const [sessions, setSessions] = useState([])
  const [regCount, setRegCount] = useState(0)
  const [tierCounts, setTierCounts] = useState({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [tierId, setTierId] = useState('')
  const [selectedSessions, setSelectedSessions] = useState([])
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [slug])

  async function load() {
    const { data, error } = await supabase.from('events').select('*').eq('slug', slug).single()
    if (error || !data) { setNotFound(true); return }
    setEvent(data)

    const { data: tt } = await supabase.from('ticket_types').select('*').eq('event_id', data.id).order('sort_order')
    setTiers(tt || [])
    const { data: ss } = await supabase.from('sessions').select('*').eq('event_id', data.id).order('sort_order')
    setSessions(ss || [])

    const { count } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', data.id)
    setRegCount(count || 0)

    if (tt && tt.length) {
      const counts = {}
      for (const t of tt) {
        const { count: c } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', data.id).eq('ticket_type_id', t.id)
        counts[t.id] = c || 0
      }
      setTierCounts(counts)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ticketCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
      const { error: insErr } = await supabase.from('registrations').insert({
        event_id: event.id,
        ticket_code: ticketCode,
        ticket_type_id: tierId || null,
        session_ids: selectedSessions,
        attendee_data: { name, email, ...values }
      })
      if (insErr) throw insErr
      navigate(`/ticket/${ticketCode}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function toggleSession(id) {
    setSelectedSessions(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  if (notFound) return <p className="text-center mt-16 text-mist">Event not found.</p>
  if (!event) return <p className="text-center mt-16 text-mist">Loading…</p>

  if (event.status === 'draft') {
    return <p className="text-center mt-16 text-mist">This event isn't open for registration yet. Check back soon.</p>
  }

  const isFull = event.capacity != null && regCount >= event.capacity
  if (isFull) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-xl font-semibold text-ink mb-2">{event.title}</h1>
        <p className="text-mist">Registration is full. Please check with the organizer about a waitlist.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-16">
      {event.banner_url && <img src={event.banner_url} alt="" className="w-full h-44 object-cover rounded-xl mb-5" />}
      <h1 className="font-display text-2xl font-semibold text-ink">{event.title}</h1>
      {event.event_date && <p className="text-mist text-sm mt-1">{new Date(event.event_date).toLocaleString()}</p>}
      {event.location && <p className="text-mist text-sm">{event.location}</p>}
      {event.description && <p className="text-ink/80 text-sm mt-3">{event.description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        <div>
          <label className="text-sm font-medium text-ink">Full name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="text-sm font-medium text-ink">Email *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        {tiers.length > 0 && (
          <div>
            <label className="text-sm font-medium text-ink">Ticket type *</label>
            <div className="mt-1 space-y-2">
              {tiers.map(t => {
                const taken = tierCounts[t.id] ?? 0
                const soldOut = t.capacity != null && taken >= t.capacity
                return (
                  <label key={t.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm ${soldOut ? 'opacity-50 border-gray-200' : 'border-gray-300 cursor-pointer'}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="tier" required disabled={soldOut} checked={tierId === t.id} onChange={() => setTierId(t.id)} />
                      {t.name} {t.price != null && <span className="text-mist">— ${Number(t.price).toFixed(2)}</span>}
                    </span>
                    <span className="text-xs text-mist">{soldOut ? 'Sold out' : t.capacity != null ? `${t.capacity - taken} left` : ''}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {sessions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-ink">Sessions you'll attend</label>
            <div className="mt-1 space-y-2">
              {sessions.map(s => (
                <label key={s.id} className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedSessions.includes(s.id)} onChange={() => toggleSession(s.id)} />
                  {s.title} {s.starts_at && <span className="text-mist">— {new Date(s.starts_at).toLocaleString()}</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        <DynamicFormRenderer fields={event.form_schema || []} values={values} setValues={setValues} />

        {error && <p className="text-sm text-stub">{error}</p>}

        <button disabled={busy} className="w-full bg-gold text-ink font-semibold rounded-lg py-2.5 hover:brightness-95 transition disabled:opacity-50">
          {busy ? 'Registering…' : 'Register'}
        </button>
      </form>
    </div>
  )
}
