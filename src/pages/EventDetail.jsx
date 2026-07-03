import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`registrations-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  async function load() {
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
    setEvent(ev)
    const { data: r } = await supabase
      .from('registrations')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
    setRegs(r || [])
    setLoading(false)
  }

  function exportCsv() {
    if (!regs.length) return
    const keys = Array.from(new Set(regs.flatMap((r) => Object.keys(r.attendee_data || {}))))
    const header = ['ticket_code', 'checked_in', 'checked_in_at', ...keys]
    const rows = regs.map((r) => [
      r.ticket_code,
      r.checked_in,
      r.checked_in_at || '',
      ...keys.map((k) => JSON.stringify(r.attendee_data?.[k] ?? ''))
    ])
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${event.slug}-registrations.csv`
    link.click()
  }

  if (loading || !event) return <p className="text-center mt-16 text-mist">Loading…</p>

  const checkedIn = regs.filter((r) => r.checked_in).length
  const registerLink = `${window.location.origin}/e/${event.slug}`

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{event.title}</h1>
          <p className="text-mist text-sm">
            {event.event_date ? new Date(event.event_date).toLocaleString() : 'Date TBD'} · {event.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/events/${id}/edit`} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Edit
          </Link>
          <Link to={`/events/${id}/scan`} className="text-sm bg-navy text-paper rounded-lg px-3 py-1.5 hover:bg-ink">
            Scan check-in
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6">
        <Stat label="Registered" value={regs.length} />
        <Stat label="Checked in" value={checkedIn} />
        <Stat label="Remaining" value={regs.length - checkedIn} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-6">
        <p className="text-sm font-medium text-ink mb-2">Public registration link</p>
        <div className="flex gap-2">
          <input readOnly value={registerLink} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button
            onClick={() => navigator.clipboard.writeText(registerLink)}
            className="text-sm border border-gray-300 rounded-lg px-3 hover:bg-gray-50"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-display font-semibold text-ink">Attendees ({regs.length})</h2>
        <button onClick={exportCsv} className="text-sm text-navy underline">Export CSV</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-mist">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Ticket</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="p-3">{r.attendee_data?.name}</td>
                <td className="p-3">{r.attendee_data?.email}</td>
                <td className="p-3 font-mono">{r.ticket_code}</td>
                <td className="p-3">
                  {r.checked_in ? (
                    <span className="text-green-700 font-medium">Checked in</span>
                  ) : (
                    <span className="text-mist">Registered</span>
                  )}
                </td>
              </tr>
            ))}
            {regs.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-mist">No registrations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
