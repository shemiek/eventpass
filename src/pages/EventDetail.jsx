import { useEffect, useMemo, useState, Fragment } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'
import TicketBadge from '../components/TicketBadge'

const DEFAULT_WIDGETS = { stats: true, occupancy: true, trend: true, tierBreakdown: true, occupancyOverTime: true, sessions: true }

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [orgSuspended, setOrgSuspended] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState('attendees')

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
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailIncludeBadge, setEmailIncludeBadge] = useState(true)
  const [emailScope, setEmailScope] = useState('filtered') // 'filtered' | 'all'
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState(null)
  const [badgeModalReg, setBadgeModalReg] = useState(null)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [dupDate, setDupDate] = useState('')
  const [dupCopyAttendees, setDupCopyAttendees] = useState(true)
  const [dupBusy, setDupBusy] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInEmail, setWalkInEmail] = useState('')
  const [walkInTier, setWalkInTier] = useState('')
  const [walkInVip, setWalkInVip] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const [widgets, setWidgets] = useState(() => {
    try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem(`eventopass_dash_widgets_${id}`) || '{}') } }
    catch { return DEFAULT_WIDGETS }
  })
  useEffect(() => { localStorage.setItem(`eventopass_dash_widgets_${id}`, JSON.stringify(widgets)) }, [widgets, id])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`event-${id}-live`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_events' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  useEffect(() => {
    if (!event || !user) return
    if (event.owner_id === user.id) {
      setMyRole('owner')
      return
    }
    async function resolveRole() {
      if (event.org_id) {
        const { data: isOrgAdmin } = await supabase.rpc('is_org_admin', { p_org_id: event.org_id })
        if (isOrgAdmin) { setMyRole('owner'); return }
      }
      const { data: tm } = await supabase.from('team_members').select('role').eq('event_id', id).eq('email', (user.email || '').toLowerCase()).maybeSingle()
      setMyRole(tm?.role || null)
    }
    resolveRole()
  }, [event, user, id])

  async function load() {
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
    setEvent(ev)
    if (ev?.org_id) {
      const { data: org } = await supabase.from('organizations').select('status').eq('id', ev.org_id).maybeSingle()
      setOrgSuspended(org?.status === 'suspended')
    }

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
  const canManage = myRole === 'owner' || myRole === 'manager'

  const checkEventsByReg = useMemo(() => {
    const map = {}
    checkEvents.forEach(ev => { (map[ev.registration_id] = map[ev.registration_id] || []).push(ev) })
    return map
  }, [checkEvents])

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
      if (ev.direction === 'in') { inCount++; openIn = new Date(ev.at) }
      else if (ev.direction === 'out' && openIn) { totalMs += new Date(ev.at) - openIn; openIn = null }
    })
    if (openIn) totalMs += new Date() - openIn
    if (inCount > 1) reentries = inCount - 1
    return { totalMs, reentries, eventCount: events.length }
  }

  function formatDuration(ms) {
    if (!ms) return '0m'
    const mins = Math.round(ms / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins/60)}h ${mins%60}m`
  }

  const pendingCount = regs.filter(r => r.status === 'pending').length

  const filteredRegs = useMemo(() => {
    let list = [...regs]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        const vals = Object.values(r.attendee_data || {}).map(v => String(v).toLowerCase())
        return vals.some(v => v.includes(q)) || r.ticket_code.toLowerCase().includes(q)
      })
    }
    if (statusFilter === 'checked_in') list = list.filter(r => r.checked_in)
    else if (statusFilter === 'not_inside') list = list.filter(r => !r.checked_in && r.status === 'approved')
    else if (statusFilter === 'pending') list = list.filter(r => r.status === 'pending')
    else if (statusFilter === 'rejected') list = list.filter(r => r.status === 'rejected')
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
    const { error: logErr } = await supabase.from('check_events').insert({ registration_id: regId, direction: 'out', staff_email: user?.email })
    if (logErr) return // already checked out (or a concurrent check-out just happened) — trigger blocked the duplicate, nothing more to do
    await supabase.from('registrations').update({ checked_in: false, checked_in_at: null }).eq('id', regId)
    load()
  }

  async function approveReg(regId) {
    await supabase.from('registrations').update({ status: 'approved' }).eq('id', regId)
    load()
  }
  async function rejectReg(regId) {
    await supabase.from('registrations').update({ status: 'rejected' }).eq('id', regId)
    load()
  }

  async function duplicateEvent() {
    setDupBusy(true)
    try {
      const newSlug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 5)
      const { data: newEvent, error: insErr } = await supabase.from('events').insert({
        title: event.title,
        description: event.description,
        location: event.location,
        banner_url: event.banner_url,
        badge_accent: event.badge_accent,
        badge_footer_text: event.badge_footer_text,
        ticket_label: event.ticket_label,
        ticket_required: event.ticket_required,
        show_map: event.show_map,
        form_schema: event.form_schema,
        capacity: event.capacity,
        requires_approval: event.requires_approval,
        status: 'draft',
        event_date: dupDate ? new Date(dupDate).toISOString() : null,
        owner_id: user.id,
        org_id: event.org_id,
        slug: newSlug
      }).select().single()
      if (insErr) throw insErr

      // Copy ticket tiers, keeping a map of old tier id -> new tier id so
      // copied registrations can be re-pointed at the right new tier.
      const tierIdMap = {}
      for (const t of tiers) {
        const { data: newTier } = await supabase.from('ticket_types').insert({
          event_id: newEvent.id, name: t.name, capacity: t.capacity, price: t.price, sort_order: 0
        }).select().single()
        if (newTier) tierIdMap[t.id] = newTier.id
      }

      if (dupCopyAttendees) {
        for (const r of regs) {
          await supabase.from('registrations').insert({
            event_id: newEvent.id,
            ticket_code: crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
            ticket_type_id: r.ticket_type_id ? (tierIdMap[r.ticket_type_id] || null) : null,
            vip: r.vip,
            notes: r.notes,
            status: r.status === 'rejected' ? 'rejected' : (event.requires_approval ? 'pending' : 'approved'),
            attendee_data: r.attendee_data
            // checked_in / checked_in_at / session_ids intentionally left at
            // their defaults — this is a fresh occurrence with no check-in
            // history of its own yet.
          })
        }
      }

      navigate(`/events/${newEvent.id}`)
    } catch (err) {
      alert('Could not duplicate event: ' + err.message)
    } finally {
      setDupBusy(false)
    }
  }

  async function deleteEvent() {
    setDeleting(true)
    const { error } = await supabase.from('events').delete().eq('id', id)
    setDeleting(false)
    if (!error) navigate('/dashboard')
    else alert('Could not delete event: ' + error.message)
  }

  async function submitWalkIn(e) {
    e.preventDefault()
    if (!walkInName.trim()) return
    const ticketCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
    const { data: reg, error } = await supabase.from('registrations').insert({
      event_id: id, ticket_code: ticketCode, ticket_type_id: walkInTier || null,
      vip: walkInVip, status: 'approved', attendee_data: { name: walkInName, email: walkInEmail },
      checked_in: true, checked_in_at: new Date().toISOString()
    }).select().single()
    if (!error) {
      await supabase.from('check_events').insert({ registration_id: reg.id, direction: 'in', gate_name: 'Walk-in', staff_email: user?.email })
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
      header: true, skipEmptyLines: true,
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
            event_id: id, ticket_code: ticketCode, status: 'approved', attendee_data: { name, email, ...rest }
          })
          if (error) failed++; else success++
        }
        setImportMsg(`Imported ${success} registration${success === 1 ? '' : 's'}${failed ? `, ${failed} skipped` : ''}.`)
        setImportBusy(false)
        load()
      },
      error: (err) => { setImportMsg('Import failed: ' + err.message); setImportBusy(false) }
    })
  }

  function exportCsv() {
    if (!regs.length) return
    const keys = Array.from(new Set(regs.flatMap((r) => Object.keys(r.attendee_data || {}))))
    const header = ['ticket_code', 'status', 'ticket_type', 'vip', 'checked_in', 'checked_in_at', 'reentries', 'dwell_minutes', ...keys]
    const rows = regs.map((r) => {
      const d = dwellStatsFor(r.id)
      return [r.ticket_code, r.status, tierName(r.ticket_type_id), r.vip, r.checked_in, r.checked_in_at || '', d.reentries, Math.round(d.totalMs/60000), ...keys.map((k) => JSON.stringify(r.attendee_data?.[k] ?? ''))]
    })
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    downloadBlob(csv, `${event.slug}-registrations.csv`, 'text/csv')
  }

  function exportExcel() {
    if (!regs.length) return
    const keys = Array.from(new Set(regs.flatMap((r) => Object.keys(r.attendee_data || {}))))
    const rows = regs.map(r => {
      const d = dwellStatsFor(r.id)
      const row = { 'Ticket code': r.ticket_code, 'Status': r.status, 'Ticket type': tierName(r.ticket_type_id), 'VIP': r.vip ? 'Yes' : 'No', 'Checked in': r.checked_in ? 'Yes' : 'No', 'Checked in at': r.checked_in_at || '', 'Re-entries': d.reentries, 'Dwell (minutes)': Math.round(d.totalMs/60000), 'Notes': r.notes || '' }
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

  function exportCheckEventsLog() {
    if (!checkEvents.length) { alert('No check-in/out events recorded yet.'); return }
    const header = ['name', 'email', 'ticket_code', 'direction', 'gate', 'staff_email', 'at']
    const rows = checkEvents.map(ev => {
      const reg = regs.find(r => r.id === ev.registration_id)
      return [
        reg?.attendee_data?.name || '', reg?.attendee_data?.email || '', reg?.ticket_code || '',
        ev.direction, ev.gate_name || '', ev.staff_email || '', ev.at
      ].map(v => JSON.stringify(v ?? ''))
    })
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
    downloadBlob(csv, `${event.slug}-checkin-log.csv`, 'text/csv')
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
    regs.forEach(r => { const day = new Date(r.created_at).toLocaleDateString(); byDay[day] = (byDay[day] || 0) + 1 })
    let running = 0
    return Object.entries(byDay).sort((a,b) => new Date(a[0]) - new Date(b[0])).map(([day, count]) => { running += count; return { day, total: running } })
  }, [regs])

  const tierBreakdown = useMemo(() => {
    const counts = {}
    regs.forEach(r => { const name = tierName(r.ticket_type_id) || 'General'; counts[name] = (counts[name] || 0) + 1 })
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }, [regs, tiers])

  async function sendEmail() {
    setEmailSending(true)
    setEmailResult(null)
    const targetRegs = emailScope === 'all' ? regs : filteredRegs
    const registrationIds = targetRegs.filter(r => r.status === 'approved').map(r => r.id)
    if (!registrationIds.length) {
      setEmailResult({ error: 'No approved attendees in the selected scope to email.' })
      setEmailSending(false)
      return
    }
    const { data, error } = await supabase.functions.invoke('send-attendee-email', {
      body: {
        eventId: id,
        registrationIds,
        subject: emailSubject,
        message: emailBody,
        includeBadgeLink: emailIncludeBadge,
        siteUrl: window.location.origin
      }
    })
    setEmailSending(false)
    if (error) { setEmailResult({ error: error.message }); return }
    setEmailResult({ sent: data.sent, failed: data.failed })
  }

  function sessionAttendeeCount(sessionId) {
    return new Set(sessionAttendance.filter(sa => sa.session_id === sessionId).map(sa => sa.registration_id)).size
  }

  async function exportDashboardCsv() {
    const checkedIn = regs.filter(r => r.checked_in).length
    const rows = [
      ['Metric', 'Value'],
      ['Total registered', regs.length],
      ['Currently inside', occupancy.totalInside],
      ['Checked in (ever)', checkedIn],
      ...occupancy.byGate.map(([gate, count]) => [`Currently inside — ${gate}`, count]),
      ...tierBreakdown.map(t => [`Tier — ${t.name}`, t.count])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    downloadBlob(csv, `${event.slug}-dashboard.csv`, 'text/csv')
  }

  async function exportDashboardPdf() {
    const html2canvas = (await import('html2canvas')).default
    const node = document.getElementById('dashboard-panel')
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#F4F1EC' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = 210, pageHeight = 297
    const imgWidth = pageWidth
    const imgHeight = canvas.height * imgWidth / canvas.width
    let heightLeft = imgHeight, position = 0
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    pdf.save(`${event.slug}-dashboard.pdf`)
  }

  if (loading || !event) return <p className="text-center mt-16 text-mist">Loading…</p>

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
          {canManage && <Link to={`/events/${id}/edit`} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">Edit / Team</Link>}
          {canManage && <button onClick={() => setShowDuplicate(true)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">Duplicate event</button>}
          <Link to={`/events/${id}/scan`} className="text-sm bg-navy text-paper rounded-lg px-3 py-1.5 hover:bg-ink">Scan check-in/out</Link>
          {myRole === 'owner' && <button onClick={() => setShowDelete(true)} className="text-sm border border-stub/40 text-stub rounded-lg px-3 py-1.5 hover:bg-stub/5">Delete event</button>}
        </div>
      </div>

      {showDuplicate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full">
            <p className="font-display font-semibold text-ink mb-1">Duplicate "{event.title}"</p>
            <p className="text-xs text-mist mb-3">Creates a new event with the same form, ticket tiers, and badge design — perfect for a recurring meeting or series. The new event is created as a draft so you can review it before opening registration.</p>
            <label className="text-xs text-mist">Date & time of the next occurrence</label>
            <input type="datetime-local" value={dupDate} onChange={(e) => setDupDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 mb-3" />
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={dupCopyAttendees} onChange={(e) => setDupCopyAttendees(e.target.checked)} />
              Copy the {regs.length} attendee{regs.length === 1 ? '' : 's'} from this event too (fresh check-in status, new ticket codes)
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDuplicate(false)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300">Cancel</button>
              <button disabled={dupBusy} onClick={duplicateEvent} className="text-sm px-3 py-1.5 rounded-lg bg-navy text-paper disabled:opacity-50">
                {dupBusy ? 'Creating…' : 'Create duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full">
            <p className="font-display font-semibold text-stub mb-2">Delete "{event.title}"?</p>
            <p className="text-sm text-ink/80 mb-3">
              This permanently deletes the event and <strong>all {regs.length} registration{regs.length === 1 ? '' : 's'}</strong>, every check-in/check-out record, ticket tiers, sessions, and team access. This cannot be undone.
            </p>
            <label className="text-xs text-mist block mb-1">Type <strong>DELETE</strong> to confirm</label>
            <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowDelete(false); setDeleteConfirmText('') }} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300">Cancel</button>
              <button disabled={deleteConfirmText !== 'DELETE' || deleting} onClick={deleteEvent} className="text-sm px-3 py-1.5 rounded-lg bg-stub text-white disabled:opacity-40">
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 mt-6 border-b border-gray-200">
        <button onClick={() => setActiveTab('attendees')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'attendees' ? 'border-navy text-navy' : 'border-transparent text-mist'}`}>
          Attendees {pendingCount > 0 && <span className="ml-1 bg-gold text-ink text-xs px-1.5 py-0.5 rounded-full">{pendingCount} pending</span>}
        </button>
        <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'dashboard' ? 'border-navy text-navy' : 'border-transparent text-mist'}`}>
          Dashboard
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div id="dashboard-panel" className="pt-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex gap-3 flex-wrap text-xs text-mist">
              {Object.keys(DEFAULT_WIDGETS).map(w => (
                <label key={w} className="flex items-center gap-1">
                  <input type="checkbox" checked={widgets[w]} onChange={(e) => setWidgets({ ...widgets, [w]: e.target.checked })} /> {w}
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={exportDashboardCsv} className="text-sm text-navy underline">Export CSV</button>
              <button onClick={exportDashboardPdf} className="text-sm text-navy underline">Export PDF</button>
            </div>
          </div>

          {widgets.stats && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Registered" value={regs.length} />
              <Stat label="Currently inside" value={occupancy.totalInside} />
              <Stat label="Not yet inside" value={regs.length - occupancy.totalInside} />
            </div>
          )}

          {widgets.occupancy && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-ink">Live occupancy by gate</p>
                <span className="flex items-center gap-1 text-xs text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> live</span>
              </div>
              {occupancy.byGate.length === 0 ? <p className="text-sm text-mist">No one currently checked in.</p> : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {occupancy.byGate.map(([gate, count]) => (
                    <div key={gate} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span>{gate}</span><span className="font-display font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(widgets.trend || widgets.tierBreakdown) && regs.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {widgets.trend && (
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
              )}
              {widgets.tierBreakdown && (
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
              )}
            </div>
          )}

          {widgets.occupancyOverTime && occupancyOverTime.length > 0 && (
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

          {widgets.sessions && sessions.length > 0 && (
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
        </div>
      )}

      {activeTab === 'attendees' && (
        <div className="pt-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-ink mb-2">Public registration link</p>
            <div className="flex gap-2 flex-wrap">
              <input readOnly value={registerLink} className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => navigator.clipboard.writeText(registerLink)} className="text-sm border border-gray-300 rounded-lg px-3 hover:bg-gray-50">Copy</button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`You're invited to ${event.title}! Register here: ${registerLink}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm border border-green-300 text-green-700 rounded-lg px-3 py-2 hover:bg-green-50 flex items-center gap-1.5"
              >
                Share via WhatsApp
              </a>
            </div>
          </div>

          {pendingCount > 0 && canManage && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl p-4 mt-4">
              <p className="text-sm font-medium text-ink mb-2">{pendingCount} registration{pendingCount === 1 ? '' : 's'} awaiting approval</p>
              <div className="space-y-2">
                {regs.filter(r => r.status === 'pending').map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                    <span>{r.attendee_data?.name} <span className="text-mist text-xs">— {r.attendee_data?.email}</span></span>
                    <div className="flex gap-2">
                      <button onClick={() => approveReg(r.id)} className="text-xs bg-green-600 text-white rounded-md px-2 py-1">Approve</button>
                      <button onClick={() => rejectReg(r.id)} className="text-xs bg-stub text-white rounded-md px-2 py-1">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-2">
            <h2 className="font-display font-semibold text-ink">Attendees ({filteredRegs.length}{filteredRegs.length !== regs.length ? ` of ${regs.length}` : ''})</h2>
            <div className="flex gap-3 items-center flex-wrap">
              <button onClick={() => setShowWalkIn(true)} className="text-sm bg-gold text-ink font-medium rounded-lg px-3 py-1.5">+ Walk-in check-in</button>
              {canManage && <button onClick={() => setShowEmailModal(true)} className="text-sm border border-navy text-navy rounded-lg px-3 py-1.5">Email attendees</button>}
              <label className="text-sm text-navy underline cursor-pointer">
                {importBusy ? 'Importing…' : 'Bulk import CSV'}
                <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" disabled={importBusy} />
              </label>
              <button onClick={exportCsv} className="text-sm text-navy underline">Export CSV</button>
              <button onClick={exportExcel} className="text-sm text-navy underline">Export Excel</button>
              <button onClick={exportCheckEventsLog} className="text-sm text-navy underline">Export check-in/out log</button>
            </div>
          </div>
          {importMsg && <p className="text-sm text-mist mb-3">{importMsg}</p>}

          <div className="flex gap-2 flex-wrap mb-3">
            <input placeholder="Search name, email, mobile, ticket code…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="all">All statuses</option>
              <option value="checked_in">Checked in</option>
              <option value="not_inside">Approved, not inside</option>
              <option value="pending">Pending approval</option>
              <option value="rejected">Rejected</option>
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
                          {r.status === 'pending' && <span className="text-gold-700 font-medium">Pending</span>}
                          {r.status === 'rejected' && <span className="text-stub font-medium">Rejected</span>}
                          {r.status === 'approved' && (r.checked_in ? <span className="text-green-700 font-medium">Inside</span> : <span className="text-mist">Not inside</span>)}
                          {d.reentries > 0 && <span className="block text-[10px] text-mist">{d.reentries} re-entr{d.reentries===1?'y':'ies'}</span>}
                        </td>
                        <td className="p-3 text-xs">{formatDuration(d.totalMs)}</td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {r.status === 'pending' && canManage && (
                            <>
                              <button onClick={() => approveReg(r.id)} className="text-xs text-green-700 border border-green-300 rounded-md px-2 py-1 hover:bg-green-50 mr-1">Approve</button>
                              <button onClick={() => rejectReg(r.id)} className="text-xs text-stub border border-stub/30 rounded-md px-2 py-1 hover:bg-stub/5 mr-2">Reject</button>
                            </>
                          )}
                          {r.checked_in && <button onClick={() => checkOut(r.id)} className="text-xs text-stub border border-stub/30 rounded-md px-2 py-1 hover:bg-stub/5 mr-2">Check out</button>}
                          {d.eventCount > 0 && <button onClick={() => setExpandedReg(isExpanded ? null : r.id)} className="text-xs text-navy underline mr-2">{isExpanded ? 'Hide' : 'History'}</button>}
                          {r.status === 'approved' && <button onClick={() => setBadgeModalReg(r)} className="text-xs text-navy underline">Badge</button>}
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
                {filteredRegs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-mist">No matching registrations.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="bg-white rounded-xl p-5 max-w-md w-full">
            <p className="font-display font-semibold text-ink mb-3">Email attendees</p>
            <label className="text-xs text-mist">Send to</label>
            <select value={emailScope} onChange={(e) => setEmailScope(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3">
              <option value="filtered">Currently filtered attendees ({filteredRegs.filter(r => r.status === 'approved').length} approved)</option>
              <option value="all">All approved attendees ({regs.filter(r => r.status === 'approved').length})</option>
            </select>
            <label className="text-xs text-mist">Subject</label>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="e.g. Important info for tomorrow" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
            <label className="text-xs text-mist">Message</label>
            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={5} placeholder="Instructions, updates, reminders…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={emailIncludeBadge} onChange={(e) => setEmailIncludeBadge(e.target.checked)} /> Include a link to view their badge
            </label>
            {emailResult?.error && <p className="text-sm text-stub mb-3">{emailResult.error}</p>}
            {emailResult?.sent != null && <p className="text-sm text-green-700 mb-3">Sent to {emailResult.sent}{emailResult.failed ? `, ${emailResult.failed} failed` : ''}.</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowEmailModal(false); setEmailResult(null) }} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300">Close</button>
              <button
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                onClick={sendEmail}
                className="text-sm px-3 py-1.5 rounded-lg bg-navy text-paper disabled:opacity-40"
              >
                {emailSending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {badgeModalReg && (
        <BadgeModal
          event={event}
          registration={badgeModalReg}
          tierName={tierName(badgeModalReg.ticket_type_id)}
          onClose={() => setBadgeModalReg(null)}
          onEmail={async () => {
            await supabase.functions.invoke('send-attendee-email', {
              body: {
                eventId: id,
                registrationIds: [badgeModalReg.id],
                subject: `Your badge for ${event.title}`,
                message: 'Here is your badge for the event.',
                includeBadgeLink: true,
                siteUrl: window.location.origin
              }
            })
            alert('Badge email sent (or attempted — check the org audit log for the result).')
          }}
        />
      )}

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

function BadgeModal({ event, registration, tierName, onClose, onEmail }) {
  const [busy, setBusy] = useState(false)

  async function renderCanvas() {
    const html2canvas = (await import('html2canvas')).default
    const node = document.getElementById('ticket-badge')
    return html2canvas(node, { backgroundColor: '#F4F1EC', scale: 2 })
  }

  async function download() {
    setBusy(true)
    const canvas = await renderCanvas()
    const link = document.createElement('a')
    link.download = `badge-${registration.ticket_code}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setBusy(false)
  }

  async function share() {
    setBusy(true)
    const shareText = `Badge for ${registration.attendee_data?.name} — ${event.title}`
    try {
      const canvas = await renderCanvas()
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const file = new File([blob], `badge-${registration.ticket_code}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: event.title, text: shareText })
        setBusy(false)
        return
      }
    } catch (err) { /* fall through to link-only share below */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' — ' + window.location.origin + '/ticket/' + registration.ticket_code)}`, '_blank')
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30">
      <div className="bg-white rounded-xl p-5 max-w-sm w-full">
        <TicketBadge event={event} registration={registration} tierName={tierName} />
        <div className="flex gap-2 justify-center flex-wrap mt-4">
          <button disabled={busy} onClick={download} className="text-sm bg-navy text-paper rounded-lg px-3 py-1.5 disabled:opacity-50">Download</button>
          <button disabled={busy} onClick={share} className="text-sm border border-green-300 text-green-700 rounded-lg px-3 py-1.5 disabled:opacity-50">Share via WhatsApp</button>
          <button disabled={busy} onClick={onEmail} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-50">Email to attendee</button>
        </div>
        <div className="text-center mt-3">
          <button onClick={onClose} className="text-xs text-mist underline">Close</button>
        </div>
      </div>
    </div>
  )
}
