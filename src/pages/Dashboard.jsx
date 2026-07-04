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
    // RLS ensures this only returns events the user owns or is staff on
    const { data, error } = await supabase
      .from('events')
      .select('id, title, slug, event_date, banner_url, owner_id, status')
      .order('created_at', { ascending: false })
    if (!error) setEvents(data)
    setLoading(false)
  }

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
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold text-ink">{ev.title}</p>
                {ev.status === 'draft' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-mist font-medium">Draft</span>
                )}
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
