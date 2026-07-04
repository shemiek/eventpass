import { useEffect, useMemo, useState, Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [regs, setRegs] = useState([])
  const [tiers, setTiers] = useState([])
  const [sessions, setSessions] = useState([])
  const [checkEvents, setCheckEvents] = useState([])
  const [sessionAttendance, setSessionAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedReg, setExpandedReg] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created_desc')

  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInEmail, setWalkInEmail] = useState('')
  const [walkInTier, setWalkInTier] = useState('')
  const [walkInVip, setWalkInVip] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`event-${id}-live`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_events' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  async function load() {
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
    setEvent(ev)
    const { data: r } = await supabase.from('registrations').select('*').eq('event_id', id).order('created_at', { ascending: false })
    setRegs(r || [])
    const { data: tt } = await supabase.from('ticket_types').select('*').eq('event_id', id).order('sort_order')
    setTiers(tt || [])
    const { data: ss } = await supabase.from('sessions').select('*').eq('event_id', id).order('sort_order')
    setSessions(ss || [])

    const regIds = (r || []).map(x => x.id)
    if (regIds.length) {
      const { data: ce } = await supabase.from('check_events').select('*').in('registration_id', regIds).order('at', { ascending: true })
      setCheckEvents(ce || [])
    } else {
      setCheckEvents([])
    }
    if ((ss || []).length) {
      const sessionIds = ss.map(s => s.id)
      const { data: sa } = await supabase.from('session_attendance').select('*').in('session_id', sessionIds)
      setSessionAttendance(sa || [])
    } else {
      setSessionAttendance([])
    }
    setLoading(false)
  }

  const tierName = (tid) => tiers.find(t => t.id === tid)?.name || ''
  const sessionTitles = (ids) => (ids || []).map(sid => sessions.find(s => s.id === sid)?.title).filter(Boolean).join(', ')

  const checkEventsByReg = useMemo(() => {
    const map = {}
    checkEvents.forEach(ev => { (map[ev.registration_id] = map[ev.registration_id] || []).push(ev) })
    return map
  }, [checkEvents])

  // Per-gate live occupancy: for each registration, find its latest check event.
  // If that event was an "in", they're currently inside, attributed to that gate.
  const occupancy = useMemo(() => {
    const byGate = {}
    let totalInside = 0
    regs.forEach(r => {
      const events = checkEventsByReg[r.id]
      if (!events || !events.length) return
      const last = events[events.length - 1]
      if (last.direction === 'in') {
        const gate = last.gate_name || 'Unspecified gate'
        byGate[gate] = (byGate[gate] || 0) + 1
        totalInside++
      }
    })
    return { byGate: Object.entries(byGate).sort((a,b) => b[1]-a[1]), totalInside }
  }, [regs, checkEventsByReg])

  const occupancyOverTime = useMemo(() => {
    let net = 0
    return checkEvents.map(ev => {
      net += ev.direction === 'in' ? 1 : -1
      return { time: new Date(ev.at).toLocaleString(), net: Math.max(net, 0) }
    })
  }, [checkEvents])

  function dwellStatsFor(regId) {
    const events = checkEventsByReg[regId] || []
    let totalMs = 0, reentries = 0, inCount = 0, openIn = null
    events.forEach(ev => {
      if (ev.direction === 'in') {
        inCount++
        openIn = new Date(ev.at)
      } else if (ev.direction === 'out' && openIn) {
        totalMs += new Date(ev.at) - openIn
        openIn = null
      }
    })
    if (openIn) totalMs += new Date() - openIn // still inside
    if (inCount > 1) reentries = inCount - 1
    return { totalMs, reentries, eventCount: events.length }
  }

  function formatDuration(ms) {
    if (!ms) return '0m'
    const mins = Math.round(ms / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins/60)}h ${mins%60}m`
  }

  const filteredRegs = useMemo(() => {
    let list = [...regs]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.attendee_data?.name || '').toLowerCase().includes(q) ||
        (r.attendee_data?.email || '').toLowerCase().includes(q) ||
        r.ticket_code.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(r => statusFilter === 'checked_in' ? r.checked_in : !r.checked_in)
    if (tierFilter !== 'all') list = list.filter(r => r.ticket_type_id === tierFilter)
    list.sort((a, b) => {
      if (sortBy === 'created_desc') return new Date(b.created_at) - new Date(a.created_at)
      if (sortBy === 'created_asc') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'name_asc') return (a.attendee_data?.name || '').localeCompare(b.attendee_data?.name || '')
      return 0
    })
    return list
  }, [regs, search, statusFilter, tierFilter, sortBy])

  async function checkOut(regId) {
    await supabase.from('registrations').update({ checked_in: false, checked_in_at: null }).eq('id', regId)
    await supabase.from('check_events').insert({ registration_id: regId, direction: 'out' })
    load()
  }

  async function submitWalkIn(e) {
    e.preventDefault()
    if (!walkInName.trim()) return
    const ticketCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
    const { data: reg, error } = await supabase.from('registrations').insert({
      event_id: id, ticket_code: ticketCode, ticket_type_id: walkInTier || null,
      vip: walkInVip, attendee_data: { name: walkInName, email: walkInEmail },
      checked_in: true, checked_in_at: new Date().toISOString()
    }).select().single()
    if (!error) {
      await supabase.from('check_events').insert({ registration_id: reg.id, direction: 'in', gate_name: 'Walk-in' })
      setShowWalkIn(false); setWalkInName(''); setWalkInEmail(''); setWalkInTier(''); setWalkInVip(false)
      load()
    }
  }

  async function handleCsvImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportBusy(true)
    setImportMsg(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        let success = 0, failed = 0
        for (const row of rows) {
          const name = row.name || row.Name || row.full_name
          const email = row.email || row.Email
          if (!name || !email) { failed++; continue }
          const ticketCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
          const { name: _n, Name: _N, email: _e, Email: _E, full_name: _fn, ...rest } = row
          const { error } = await supabase.from('registrations').insert({
            event_id: id, ticket_code: ticketCode, attendee_data: { name, email, ...rest }
          })
          if (error) failed++; else success++
        }
        setImportMsg(`Imported ${success} registration${success === 1 ? '' : 's'}${failed ? `, ${failed} skipped (missing name/email or error)` : ''}.`)
        setImportBusy(false)
        load()
      },
      error: (err) => { setImportMsg('Import failed: ' + err.message); setImportBusy(false) }
    })
  }

  function exportCsv() {
    if (!regs.length) return
    const keys = Array.from(new Set(regs.flatMap((r) => Object.keys(r.attendee_data || {}))))
    const header = ['ticket_code', 'ticket_type', 'vip', 'checked_in', 'checked_in_at', 'reentries', 'dwell_minutes', ...keys]
    const rows = regs.map((r) => {
      const d = dwellStatsFor(r.id)
      return [r.ticket_code, tierName(r.ticket_type_id), r.vip, r.checked_in, r.checked_in_at || '', d.reentries, Math.round(d.totalMs/60000), ...keys.map((k) => JSON.stringify(r.attendee_data?.[k] ?? ''))]
    })
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    downloadBlob(csv, `${event.slug}-registrations.csv`, 'text/csv')
  }

  function exportExcel() {
    if (!regs.length) return
    const keys = Array.from(new Set(regs.flatMap((r) => Object.keys(r.attendee_data || {}))))
    const rows = regs.map(r => {
      const d = dwellStatsFor(r.id)
      const row = { 'Ticket code': r.ticket_code, 'Ticket type': tierName(r.ticket_type_id), 'VIP': r.vip ? 'Yes' : 'No', 'Checked in': r.checked_in ? 'Yes' : 'No', 'Checked in at': r.checked_in_at || '', 'Re-entries': d.reentries, 'Dwell (minutes)': Math.round(d.totalMs/60000), 'Notes': r.notes || '' }
      keys.forEach(k => row[k] = r.attendee_data?.[k] ?? '')
      return row
    })
    const checkedIn = regs.filter(r => r.checked_in).length
    const summary = [
      { Metric: 'Total registered', Value: regs.length },
      { Metric: 'Currently checked in', Value: checkedIn },
      { Metric: 'Check-in rate', Value: (regs.length ? Math.round(checkedIn / regs.length * 100) : 0) + '%' },
      ...occupancy.byGate.map(([gate, count]) => ({ Metric: `Currently inside — ${gate}`, Value: count }))
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Registrations')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')
    XLSX.writeFile(wb, `${event.slug}-registrations.xlsx`)
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  }

  const registrationTrend = useMemo(() => {
    const byDay = {}
    regs.forEach(r => {
      const day = new Date(r.created_at).toLocaleDateString()
      byDay[day] = (byDay[day] || 0) + 1
    })
    let running = 0
    return Object.entries(byDay).sort((a,b) => new Date(a[0]) - new Date(b[0])).map(([day, count]) => {
      running += count
      return { day, total: running }
    })
  }, [regs])

  const tierBreakdown = useMemo(() => {
    const counts = {}
    regs.forEach(r => {
      const name = tierName(r.ticket_type_id) || 'General'
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }, [regs, tiers])

  function sessionAttendeeCount(sessionId) {
    return new Set(sessionAttendance.filter(sa => sa.session_id === sessionId).map(sa => sa.registration_id)).size
  }

  if (loading || !event) return <p className="text-center mt-16 text-mist">Loading…</p>

  const checkedIn = regs.filter((r) => r.checked_in).length
  const registerLink = `${window.location.origin}/e/${event.slug}`

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink">{event.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${event.status === 'draft' ? 'bg-gray-200 text-mist' : 'bg-green-100 text-green-700'}`}>
              {event.status === 'draft' ? 'Draft' : 'Published'}
            </span>
          </div>
          <p className="text-mist text-sm">{event.event_date ? new Date(event.event_date).toLocaleString() : 'Date TBD'} · {event.location}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/events/${id}/edit`} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">Edit / Team</Link>
          <Link to={`/events/${id}/scan`} className="text-sm bg-navy text-paper rounded-lg px-3 py-1.5 hover:bg-ink">Scan check-in/out</Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6">
        <Stat label="Registered" value={regs.length} />
        <Stat label="Currently inside" value={occupancy.totalInside} />
        <Stat label="Not yet inside" value={regs.length - occupancy.totalInside} />
      </div>

      {/* Live occupancy by gate */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-ink">Live occupancy by gate</p>
          <span className="flex items-center gap-1 text-xs text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> live</span>
        </div>
        {occupancy.byGate.length === 0 ? (
          <p className="text-sm text-mist">No one currently checked in.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {occupancy.byGate.map(([gate, count]) => (
              <div key={gate} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span>{gate}</span>
                <span className="font-display font-semibold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {regs.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-ink mb-2">Registrations over time</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={registrationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#1C2544" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-ink mb-2">Ticket tier breakdown</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={tierBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#F2A93B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {occupancyOverTime.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-ink mb-2">Occupancy over time (people inside)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={occupancyOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} hide />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="stepAfter" dataKey="net" stroke="#E4572E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-ink mb-3">Sessions</p>
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-mist">{s.starts_at ? new Date(s.starts_at).toLocaleString() : ''} · {sessionAttendeeCount(s.id)} attended{s.capacity ? ` / ${s.capacity} capacity` : ''}</p>
                </div>
                <Link to={`/events/${id}/sessions/${s.id}/scan`} className="text-xs bg-navy text-paper rounded-md px-3 py-1.5 hover:bg-ink">Scan</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mt-6">
        <p className="text-sm font-medium text-ink mb-2">Public registration link</p>
        <div className="flex gap-2">
          <input readOnly value={registerLink} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => navigator.clipboard.writeText(registerLink)} className="text-sm border border-gray-300 rounded-lg px-3 hover:bg-gray-50">Copy</button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3 flex-wrap gap-2">
        <h2 className="font-display font-semibold text-ink">Attendees ({filteredRegs.length}{filteredRegs.length !== regs.length ? ` of ${regs.length}` : ''})</h2>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={() => setShowWalkIn(true)} className="text-sm bg-gold text-ink font-medium rounded-lg px-3 py-1.5">+ Walk-in check-in</button>
          <label className="text-sm text-navy underline cursor-pointer">
            {importBusy ? 'Importing…' : 'Bulk import CSV'}
            <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" disabled={importBusy} />
          </label>
          <button onClick={exportCsv} className="text-sm text-navy underline">Export CSV</button>
          <button onClick={exportExcel} className="text-sm text-navy underline">Export Excel</button>
        </div>
      </div>
      {importMsg && <p className="text-sm text-mist mb-3">{importMsg}</p>}

      <div className="flex gap-2 flex-wrap mb-3">
        <input placeholder="Search name, email, ticket code…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="all">All statuses</option>
          <option value="checked_in">Checked in</option>
          <option value="registered">Registered only</option>
        </select>
        {tiers.length > 0 && (
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="all">All tiers</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="created_desc">Newest first</option>
          <option value="created_asc">Oldest first</option>
          <option value="name_asc">Name A–Z</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-mist">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Ticket</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Status</th>
              <th className="p-3">Dwell</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRegs.map((r) => {
              const d = dwellStatsFor(r.id)
              const isExpanded = expandedReg === r.id
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-gray-100">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {r.attendee_data?.name}
                        {r.vip && <span className="text-[10px] font-semibold bg-gold/20 text-amber-800 px-1.5 py-0.5 rounded-full">VIP</span>}
                      </div>
                      <p className="text-xs text-mist">{r.attendee_data?.email}</p>
                    </td>
                    <td className="p-3 font-mono">{r.ticket_code}</td>
                    <td className="p-3">{tierName(r.ticket_type_id) || '—'}</td>
                    <td className="p-3">
                      {r.checked_in ? <span className="text-green-700 font-medium">Inside</span> : <span className="text-mist">Not inside</span>}
                      {d.reentries > 0 && <span className="block text-[10px] text-mist">{d.reentries} re-entr{d.reentries===1?'y':'ies'}</span>}
                    </td>
                    <td className="p-3 text-xs">{formatDuration(d.totalMs)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {r.checked_in && (
                        <button onClick={() => checkOut(r.id)} className="text-xs text-stub border border-stub/30 rounded-md px-2 py-1 hover:bg-stub/5 mr-2">Check out</button>
                      )}
                      {d.eventCount > 0 && (
                        <button onClick={() => setExpandedReg(isExpanded ? null : r.id)} className="text-xs text-navy underline">
                          {isExpanded ? 'Hide' : 'History'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50 border-t border-gray-100">
                      <td colSpan={6} className="p-3">
                        <p className="text-xs font-medium text-ink mb-1">Check-in/out history</p>
                        <div className="space-y-1">
                          {(checkEventsByReg[r.id] || []).map(ev => (
                            <p key={ev.id} className="text-xs text-mist">
                              {ev.direction === 'in' ? '→ In' : '← Out'} at {ev.gate_name || 'unspecified gate'} — {new Date(ev.at).toLocaleString()}{ev.staff_email ? ` (by ${ev.staff_email})` : ''}
                            </p>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filteredRegs.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-mist">No matching registrations.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showWalkIn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full">
            <p className="font-display font-semibold text-ink mb-3">Walk-in check-in</p>
            <form onSubmit={submitWalkIn} className="space-y-3">
              <input required placeholder="Full name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input type="email" placeholder="Email (optional)" value={walkInEmail} onChange={(e) => setWalkInEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              {tiers.length > 0 && (
                <select value={walkInTier} onChange={(e) => setWalkInTier(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">No ticket tier</option>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={walkInVip} onChange={(e) => setWalkInVip(e.target.checked)} /> Mark as VIP</label>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowWalkIn(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300">Cancel</button>
                <button className="text-sm px-3 py-1.5 rounded-lg bg-navy text-paper">Check in now</button>
              </div>
            </form>
          </div>
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
