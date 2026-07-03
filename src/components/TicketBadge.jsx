import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function TicketBadge({ event, registration, forDownload = false }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, registration.ticket_code, {
        width: 132,
        margin: 0,
        color: { dark: '#12172B', light: '#00000000' }
      })
    }
  }, [registration.ticket_code])

  const name = registration.attendee_data?.name || 'Guest'

  return (
    <div
      id="ticket-badge"
      className="bg-white rounded-2xl overflow-hidden shadow-lg max-w-sm mx-auto ticket-edge"
    >
      <div
        className="h-24 bg-navy bg-cover bg-center flex items-end p-4"
        style={event.banner_url ? { backgroundImage: `url(${event.banner_url})` } : {}}
      >
        <div className="bg-navy/70 backdrop-blur px-3 py-1 rounded-md">
          <p className="text-paper font-display font-semibold text-sm leading-tight">{event.title}</p>
        </div>
      </div>

      <div className="p-5">
        <p className="text-xs uppercase tracking-wide text-mist font-mono">Attendee</p>
        <p className="font-display text-xl font-semibold text-ink mb-4">{name}</p>

        {event.event_date && (
          <p className="text-sm text-ink/70">{new Date(event.event_date).toLocaleString()}</p>
        )}
        {event.location && <p className="text-sm text-ink/70 mb-4">{event.location}</p>}
      </div>

      <div className="perforation" />

      <div className="p-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-mist font-mono">Ticket code</p>
          <p className="font-mono text-lg tracking-widest text-ink">{registration.ticket_code}</p>
        </div>
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
