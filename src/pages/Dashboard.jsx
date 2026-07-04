import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

export default function Dashboard() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    load()
  }, [user])

  async function load() {
    setLoading(true)
    const fields = 'id, title, slug, event_date, banner_url, owner_id, status'

    // Events I own
    const { data: owned } = await supabase.from('events').select(fields).eq('owner_id', user.id)

    // Events I've been added to as manager/scanner
    const { data: memberships } = await supabase
      .from('team_members')
      .select(`role, events (${fields})`)
      .eq('email', (user.email || '').toLowerCase())

    const assigned = (memberships || [])
      .map(m => m.events ? { ...m.events, myRole: m.role } : null)
      .filter(Boolean)

    const byId = {}
    ;(owned || []).forEach(e => byId[e.id] = { ...e, myRole: 'owner' })
    assigned.forEach(e => { if (!byId[e.id]) byId[e.id] = e })

    const merged = Object.values(byId).sort((a, b) => new Date(b.event_date || 0) - new Date(a.event_date || 0))
    setEvents(merged)
    setLoading(false)
  }

  const roleLabel = { owner: 'Owner', manager: 'Manager', scanner: 'Scanner' }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Your events</h1>
        <Link
          to="/events/new"
          className="bg-gold text-ink font-medium rounded-lg px-4 py-2 hover:brightness-95 transition"
        >
          + New event
        </Link>
      </div>

      {loading && <p className="text-mist">Loading…</p>}

      {!loading && events.length === 0 && (
        <div className="border border-dashed border-mist/50 rounded-xl p-10 text-center text-mist">
          No events yet. Create your first event to get a registration link, custom form, and QR check-in.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {events.map((ev) => (
          <Link
            key={ev.id}
            to={`/events/${ev.id}`}
            className="block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div
              className="h-28 bg-navy bg-cover bg-center"
              style={ev.banner_url ? { backgroundImage: `url(${ev.banner_url})` } : {}}
            />
            <div className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display font-semibold text-ink">{ev.title}</p>
                {ev.status === 'draft' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-mist font-medium">Draft</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-navy/10 text-navy font-medium">{roleLabel[ev.myRole] || 'Team'}</span>
              </div>
              <p className="text-sm text-mist mt-1">
                {ev.event_date ? new Date(ev.event_date).toLocaleString() : 'Date TBD'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
