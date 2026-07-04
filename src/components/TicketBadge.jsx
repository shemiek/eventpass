import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function TicketBadge({ event, registration, tierName }) {
  const canvasRef = useRef(null)
  const accent = event.badge_accent || '#1C2544'

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, registration.ticket_code, {
        width: 132, margin: 0, color: { dark: '#12172B', light: '#00000000' }
      })
    }
  }, [registration.ticket_code])

  const name = registration.attendee_data?.name || 'Guest'

  return (
    <div id="ticket-badge" className="bg-white rounded-2xl overflow-hidden shadow-lg max-w-sm mx-auto ticket-edge">
      <div className="h-24 bg-cover bg-center flex items-end p-4" style={{ backgroundColor: accent, ...(event.banner_url ? { backgroundImage: `url(${event.banner_url})` } : {}) }}>
        <div className="px-3 py-1 rounded-md" style={{ backgroundColor: `${accent}CC`, backdropFilter: 'blur(4px)' }}>
          <p className="text-paper font-display font-semibold text-sm leading-tight">{event.title}</p>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wide text-mist font-mono">Attendee</p>
          {registration.vip && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F2A93B33', color: '#946200' }}>VIP</span>}
        </div>
        <p className="font-display text-xl font-semibold text-ink mb-2">{name}</p>
        {tierName && <p className="text-sm font-medium mb-2" style={{ color: accent }}>{tierName}</p>}

        {event.event_date && <p className="text-sm text-ink/70">{new Date(event.event_date).toLocaleString()}</p>}
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

      {event.badge_footer_text && (
        <div className="px-5 pb-4 text-center text-xs text-mist">{event.badge_footer_text}</div>
      )}
    </div>
  )
}
