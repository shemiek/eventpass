import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function AdminPortal() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [events, setEvents] = useState([])
  const [orgs, setOrgs] = useState([])
  const [regCounts, setRegCounts] = useState({})
  const [tab, setTab] = useState('signups')

  useEffect(() => { checkAccess() }, [])

  async function checkAccess() {
    const { data, error } = await supabase.rpc('is_platform_admin')
    if (error || !data) { setIsAdmin(false); setChecking(false); return }
    setIsAdmin(true)
    setChecking(false)
    load()
  }

  async function load() {
    const { data: p } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setProfiles(p || [])

    const { data: ev } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    setEvents(ev || [])

    const { data: orgData } = await supabase.from('organizations').select('*').order('created_at', { ascending: false })
    setOrgs(orgData || [])

    if (ev && ev.length) {
      const counts = {}
      for (const e of ev) {
        const { data: c } = await supabase.rpc('get_event_registration_count', { p_event_id: e.id })
        counts[e.id] = c || 0
      }
      setRegCounts(counts)
    }
  }

  async function toggleOrgStatus(orgId, currentStatus) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended'
    const { error } = await supabase.from('organizations').update({ status: newStatus }).eq('id', orgId)
    if (error) alert('Could not update status: ' + error.message)
    load()
  }

  function eventCountFor(orgId) {
    return events.filter(e => e.org_id === orgId).length
  }

  function ownerEmailFor(ownerId) {
    return profiles.find(p => p.id === ownerId)?.email
  }

  function organizerFor(ownerId) {
    return profiles.find(p => p.id === ownerId)
  }

  if (checking) return <p className="text-center mt-16 text-mist">Checking access…</p>

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 px-4 text-center">
        <p className="font-display font-semibold text-ink mb-1">Admin access only</p>
        <p className="text-sm text-mist mb-4">This account isn't on the platform admin list.</p>
        <Link to="/dashboard" className="text-sm bg-navy text-paper rounded-lg px-4 py-2">Back to dashboard</Link>
      </div>
    )
  }

  const totalRegs = Object.values(regCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink mb-1">Admin portal</h1>
      <p className="text-sm text-mist mb-6">Platform-wide view across every organizer and event — not scoped to any single tenant.</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Organizers" value={profiles.length} />
        <Stat label="Events" value={events.length} />
        <Stat label="Total registrations" value={totalRegs} />
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <button onClick={() => setTab('signups')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'signups' ? 'border-navy text-navy' : 'border-transparent text-mist'}`}>Sign-ups</button>
        <button onClick={() => setTab('orgs')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'orgs' ? 'border-navy text-navy' : 'border-transparent text-mist'}`}>Organizations</button>
        <button onClick={() => setTab('events')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'events' ? 'border-navy text-navy' : 'border-transparent text-mist'}`}>Events</button>
      </div>

      {tab === 'orgs' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-mist">
              <tr>
                <th className="p-3">Organization</th>
                <th className="p-3">Primary owner</th>
                <th className="p-3">Events</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="p-3">{o.name}</td>
                  <td className="p-3 text-xs text-mist">{ownerEmailFor(o.primary_owner_id) || '—'}</td>
                  <td className="p-3">{eventCountFor(o.id)}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === 'suspended' ? 'bg-stub/10 text-stub' : 'bg-green-100 text-green-700'}`}>{o.status}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggleOrgStatus(o.id, o.status)}
                      className={`text-xs rounded-md px-2 py-1 border ${o.status === 'suspended' ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-stub/30 text-stub hover:bg-stub/5'}`}
                    >
                      {o.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-mist">No organizations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'signups' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-mist">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Organization</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="p-3">{p.full_name || '—'}</td>
                  <td className="p-3">{p.email}</td>
                  <td className="p-3">{p.organization || '—'}</td>
                  <td className="p-3">{p.phone || '—'}</td>
                  <td className="p-3 text-xs text-mist">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-mist">No sign-ups yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'events' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-mist">
              <tr>
                <th className="p-3">Event</th>
                <th className="p-3">Organizer</th>
                <th className="p-3">Status</th>
                <th className="p-3">Registrations</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => {
                const org = organizerFor(ev.owner_id)
                return (
                  <tr key={ev.id} className="border-t border-gray-100">
                    <td className="p-3">{ev.title}</td>
                    <td className="p-3">{org?.full_name || org?.email || '—'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.status === 'draft' ? 'bg-gray-200 text-mist' : 'bg-green-100 text-green-700'}`}>{ev.status}</span>
                    </td>
                    <td className="p-3">{regCounts[ev.id] ?? '—'}</td>
                    <td className="p-3 text-xs text-mist">{new Date(ev.created_at).toLocaleString()}</td>
                  </tr>
                )
              })}
              {events.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-mist">No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-mist uppercase tracking-wide">{label}</p>
    </div>
  )
}
