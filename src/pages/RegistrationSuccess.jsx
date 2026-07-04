import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import TicketBadge from '../components/TicketBadge'

export default function RegistrationSuccess() {
  const { code } = useParams()
  const [registration, setRegistration] = useState(null)
  const [event, setEvent] = useState(null)
  const [tierName, setTierName] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [code])

  async function load() {
    const { data: regRows, error } = await supabase.rpc('get_registration_by_ticket', { p_ticket_code: code })
    const reg = regRows?.[0]
    if (error || !reg) { setNotFound(true); return }
    setRegistration(reg)
    const { data: ev } = await supabase.from('events').select('*').eq('id', reg.event_id).single()
    setEvent(ev)
    if (reg.ticket_type_id) {
      const { data: tt } = await supabase.from('ticket_types').select('name').eq('id', reg.ticket_type_id).single()
      setTierName(tt?.name || null)
    }
  }

  async function download() {
    const canvas = await renderBadgeCanvas()
    const link = document.createElement('a')
    link.download = `badge-${code}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  async function renderBadgeCanvas() {
    const html2canvas = (await import('html2canvas')).default
    const node = document.getElementById('ticket-badge')
    return html2canvas(node, { backgroundColor: '#F4F1EC', scale: 2 })
  }

  async function shareBadge() {
    const shareText = `My badge for ${event.title} — ${window.location.href}`
    try {
      const canvas = await renderBadgeCanvas()
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const file = new File([blob], `badge-${code}.png`, { type: 'image/png' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Native share sheet — includes WhatsApp, Messages, email, etc. This is the only
        // way to actually attach the badge image; wa.me links can only pre-fill text.
        await navigator.share({ files: [file], title: event.title, text: shareText })
        return
      }
    } catch (err) {
      // fall through to text-only fallback below (also handles user cancelling the share sheet)
    }
    // Fallback for browsers without file-sharing support (mostly desktop): share the link as text via WhatsApp.
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  if (notFound) return <p className="text-center mt-16 text-mist">Ticket not found.</p>
  if (!registration || !event) return <p className="text-center mt-16 text-mist">Loading…</p>

  if (registration.status === 'pending') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-xl font-semibold text-ink mb-2">{event.title}</h1>
        <div className="bg-gold/10 border border-gold/30 rounded-xl p-6 mt-4">
          <p className="font-medium text-ink mb-1">Registration pending approval</p>
          <p className="text-sm text-mist">The organizer needs to approve your registration before your badge becomes available. Check back on this page later — bookmark it or save the link.</p>
        </div>
      </div>
    )
  }

  if (registration.status === 'rejected') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-xl font-semibold text-ink mb-2">{event.title}</h1>
        <div className="bg-stub/10 border border-stub/30 rounded-xl p-6 mt-4">
          <p className="font-medium text-ink mb-1">Registration not approved</p>
          <p className="text-sm text-mist">Please contact the event organizer if you believe this is a mistake.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <p className="text-center text-sm text-mist mb-4">
        {registration.checked_in ? 'You are checked in. ' : "You're registered! "}Show this QR code at check-in.
      </p>
      <TicketBadge event={event} registration={registration} tierName={tierName} />
      <div className="text-center mt-5 flex gap-2 justify-center flex-wrap">
        <button onClick={download} className="bg-navy text-paper font-medium rounded-lg px-5 py-2.5 hover:bg-ink transition">Download badge</button>
        <button onClick={shareBadge} className="border border-green-300 text-green-700 font-medium rounded-lg px-5 py-2.5 hover:bg-green-50 transition">Share via WhatsApp</button>
      </div>
    </div>
  )
}
