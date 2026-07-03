import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DynamicFormRenderer from '../components/DynamicFormRenderer'

export default function PublicRegister() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    load()
  }, [slug])

  async function load() {
    const { data, error } = await supabase.from('events').select('*').eq('slug', slug).single()
    if (error || !data) { setNotFound(true); return }
    setEvent(data)
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

  if (notFound) return <p className="text-center mt-16 text-mist">Event not found.</p>
  if (!event) return <p className="text-center mt-16 text-mist">Loading…</p>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-16">
      {event.banner_url && (
        <img src={event.banner_url} alt="" className="w-full h-44 object-cover rounded-xl mb-5" />
      )}
      <h1 className="font-display text-2xl font-semibold text-ink">{event.title}</h1>
      {event.event_date && (
        <p className="text-mist text-sm mt-1">{new Date(event.event_date).toLocaleString()}</p>
      )}
      {event.location && <p className="text-mist text-sm">{event.location}</p>}
      {event.description && <p className="text-ink/80 text-sm mt-3">{event.description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        <div>
          <label className="text-sm font-medium text-ink">Full name *</label>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink">Email *</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <DynamicFormRenderer fields={event.form_schema || []} values={values} setValues={setValues} />

        {error && <p className="text-sm text-stub">{error}</p>}

        <button
          disabled={busy}
          className="w-full bg-gold text-ink font-semibold rounded-lg py-2.5 hover:brightness-95 transition disabled:opacity-50"
        >
          {busy ? 'Registering…' : 'Register'}
        </button>
      </form>
    </div>
  )
}
