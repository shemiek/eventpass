import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import TicketBadge from '../components/TicketBadge'

export default function RegistrationSuccess() {
  const { code } = useParams()
  const [registration, setRegistration] = useState(null)
  const [event, setEvent] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    load()
  }, [code])

  async function load() {
    const { data: reg, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('ticket_code', code)
      .single()
    if (error || !reg) { setNotFound(true); return }
    setRegistration(reg)
    const { data: ev } = await supabase.from('events').select('*').eq('id', reg.event_id).single()
    setEvent(ev)
  }

  async function download() {
    const html2canvas = (await import('html2canvas')).default
    const node = document.getElementById('ticket-badge')
    const canvas = await html2canvas(node, { backgroundColor: '#F4F1EC', scale: 2 })
    const link = document.createElement('a')
    link.download = `badge-${code}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  if (notFound) return <p className="text-center mt-16 text-mist">Ticket not found.</p>
  if (!registration || !event) return <p className="text-center mt-16 text-mist">Loading…</p>

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <p className="text-center text-sm text-mist mb-4">
        {registration.checked_in ? 'You are checked in. ' : "You're registered! "}
        Show this QR code at check-in.
      </p>
      <TicketBadge event={event} registration={registration} />
      <div className="text-center mt-5">
        <button
          onClick={download}
          className="bg-navy text-paper font-medium rounded-lg px-5 py-2.5 hover:bg-ink transition"
        >
          Download badge
        </button>
      </div>
    </div>
  )
}
