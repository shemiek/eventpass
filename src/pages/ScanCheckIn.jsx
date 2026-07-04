import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

export default function ScanCheckIn() {
  const { id } = useParams()
  const { user } = useAuth()
  const scannerRef = useRef(null)
  const [gate, setGate] = useState(() => localStorage.getItem('eventopass_gate') || '')
  const [mode, setMode] = useState(() => localStorage.getItem('eventopass_scan_mode') || 'in')
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const busyRef = useRef(false)
  const modeRef = useRef(mode)
  const gateRef = useRef(gate)

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => { localStorage.setItem('eventopass_gate', gate); gateRef.current = gate }, [gate])
  useEffect(() => { localStorage.setItem('eventopass_scan_mode', mode); modeRef.current = mode }, [mode])

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    Html5Qrcode.getCameras()
      .then((cams) => {
        if (!cams.length) return
        const backCam = cams.find((c) => /back|rear|environment/i.test(c.label)) || cams[cams.length - 1]
        return scanner.start(backCam.id, { fps: 10, qrbox: 240 }, onScanSuccess, () => {})
      })
      .then(() => setScanning(true))
      .catch((err) => setResult({ status: 'error', msg: 'Camera access denied: ' + err }))

    return () => { if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {}) }
  }, [id])

  async function onScanSuccess(decodedText) {
    if (busyRef.current) return
    busyRef.current = true
    await processTicket(decodedText.trim().toUpperCase())
    setTimeout(() => { busyRef.current = false; setResult(null) }, 2800)
  }

  async function processTicket(ticketCode) {
    const { data: reg, error } = await supabase
      .from('registrations').select('*').eq('event_id', id).eq('ticket_code', ticketCode).maybeSingle()
    if (error || !reg) {
      setResult({ status: 'invalid', msg: 'Ticket not found for this event.' })
      return
    }
    await processRegistration(reg)
  }

  async function processRegistration(reg) {
    if (reg.status && reg.status !== 'approved') {
      setResult({ status: 'invalid', name: reg.attendee_data?.name, msg: `Registration is ${reg.status} — not approved for check-in yet.` })
      return
    }
    if (modeRef.current === 'in') {
      if (reg.checked_in) {
        setResult({ status: 'duplicate', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Already checked in.' })
      } else {
        await doCheckIn(reg)
      }
    } else {
      if (!reg.checked_in) {
        setResult({ status: 'duplicate', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Not currently checked in.' })
      } else {
        await doCheckOut(reg)
      }
    }
  }

  async function doCheckIn(reg) {
    const { error: logErr } = await supabase.from('check_events').insert({ registration_id: reg.id, direction: 'in', gate_name: gateRef.current || null, staff_email: user?.email })
    if (logErr) {
      setResult({ status: 'duplicate', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Already checked in (duplicate scan blocked).' })
      return
    }
    const { error: updErr } = await supabase.from('registrations')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq('id', reg.id)
    if (!updErr) {
      setResult({ status: 'ok', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Checked in.' })
    } else {
      setResult({ status: 'invalid', msg: 'Could not update: ' + updErr.message })
    }
  }

  async function doCheckOut(reg) {
    const { error: logErr } = await supabase.from('check_events').insert({ registration_id: reg.id, direction: 'out', gate_name: gateRef.current || null, staff_email: user?.email })
    if (logErr) {
      setResult({ status: 'duplicate', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Already checked out (duplicate scan blocked).' })
      return
    }
    const { error: updErr } = await supabase.from('registrations')
      .update({ checked_in: false, checked_in_at: null }).eq('id', reg.id)
    if (!updErr) {
      setResult({ status: 'checkedout', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Checked out.' })
    } else {
      setResult({ status: 'invalid', msg: 'Could not update: ' + updErr.message })
    }
  }

  async function manualSubmit() {
    const code = document.getElementById('manualCode').value.trim().toUpperCase()
    if (code) await processTicket(code)
  }

  async function runSearch(q) {
    setSearch(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('registrations').select('*').eq('event_id', id)
    const lower = q.toLowerCase()
    const matches = (data || []).filter(r => {
      const vals = Object.values(r.attendee_data || {}).map(v => String(v).toLowerCase())
      return vals.some(v => v.includes(lower))
    }).slice(0, 8)
    setSearchResults(matches)
    setSearching(false)
  }

  async function selectSearchResult(reg) {
    setSearch('')
    setSearchResults([])
    await processRegistration(reg)
    setTimeout(() => setResult(null), 2800)
  }

  const bg =
    result?.status === 'ok' || result?.status === 'checkedout' ? 'bg-green-600' :
    result?.status === 'duplicate' ? 'bg-gold' :
    result ? 'bg-stub' : null

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Link to={`/events/${id}`} className="text-sm text-navy underline">&larr; Back to event</Link>
      <h1 className="font-display text-xl font-semibold text-ink mt-2 mb-3">Scan attendees</h1>

      <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-3">
        <button onClick={() => setMode('in')} className={`flex-1 py-2 text-sm font-medium ${mode === 'in' ? 'bg-navy text-paper' : 'bg-white text-mist'}`}>Check-in mode</button>
        <button onClick={() => setMode('out')} className={`flex-1 py-2 text-sm font-medium ${mode === 'out' ? 'bg-stub text-white' : 'bg-white text-mist'}`}>Check-out mode</button>
      </div>

      <input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Gate / entrance name (optional, e.g. Main Entrance)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />

      <div id="qr-reader" className="rounded-xl overflow-hidden bg-black" />

      {!scanning && !result && <p className="text-mist text-sm mt-3">Requesting camera access…</p>}

      {result && (
        <div className={`mt-4 rounded-xl text-white p-4 text-center ${bg}`}>
          <div className="flex items-center justify-center gap-2">
            <p className="font-display text-lg font-semibold">{result.name || '—'}</p>
            {result.vip && <span className="text-xs font-semibold bg-white/90 text-ink px-2 py-0.5 rounded-full">VIP</span>}
          </div>
          <p className="text-sm">{result.msg}</p>
          {result.notes && <p className="text-xs mt-1 opacity-90">Note: {result.notes}</p>}
        </div>
      )}

      <p className="text-xs text-mist mt-4 text-center">
        {mode === 'in' ? 'Scanning will check attendees in.' : 'Scanning will check attendees out.'} Switch modes above for the opposite flow.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mt-4">
        <p className="text-xs font-medium text-ink mb-2">No camera? Enter a ticket code manually:</p>
        <div className="flex gap-2">
          <input id="manualCode" placeholder="e.g. 7F3K9QAZ" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={manualSubmit} className={`rounded-lg px-3 py-2 text-sm text-white ${mode === 'in' ? 'bg-navy' : 'bg-stub'}`}>
            {mode === 'in' ? 'Check in' : 'Check out'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mt-3">
        <p className="text-xs font-medium text-ink mb-2">Or search by name / mobile number:</p>
        <input value={search} onChange={(e) => runSearch(e.target.value)} placeholder="Type a name or phone number…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        {searching && <p className="text-xs text-mist mt-2">Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map(r => (
              <button
                key={r.id}
                onClick={() => selectSearchResult(r)}
                className="w-full text-left flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-sm"
              >
                <span>
                  {r.attendee_data?.name} <span className="text-mist text-xs">— {r.attendee_data?.phone || r.attendee_data?.mobile || r.attendee_data?.email}</span>
                </span>
                <span className={`text-xs ${r.checked_in ? 'text-green-700' : 'text-mist'}`}>{r.checked_in ? 'Inside' : 'Not inside'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
