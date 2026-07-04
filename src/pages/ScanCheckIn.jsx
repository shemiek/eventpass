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
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => { localStorage.setItem('eventopass_gate', gate) }, [gate])

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
    const ticketCode = decodedText.trim().toUpperCase()

    const { data: reg, error } = await supabase
      .from('registrations').select('*').eq('event_id', id).eq('ticket_code', ticketCode).maybeSingle()

    if (error || !reg) {
      setResult({ status: 'invalid', msg: 'Ticket not found for this event.' })
    } else if (reg.checked_in) {
      setResult({ status: 'duplicate', regId: reg.id, name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Already checked in.' })
    } else {
      await doCheckIn(reg)
    }
    setTimeout(() => { busyRef.current = false; setResult(null) }, 2800)
  }

  async function doCheckIn(reg) {
    const { error: updErr } = await supabase.from('registrations')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq('id', reg.id)
    if (!updErr) {
      await supabase.from('check_events').insert({ registration_id: reg.id, direction: 'in', gate_name: gate || null, staff_email: user?.email })
      setResult({ status: 'ok', name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Checked in.' })
    } else {
      setResult({ status: 'invalid', msg: 'Could not update: ' + updErr.message })
    }
  }

  async function checkOutFromScan(regId, name) {
    const { error } = await supabase.from('registrations').update({ checked_in: false, checked_in_at: null }).eq('id', regId)
    if (!error) {
      await supabase.from('check_events').insert({ registration_id: regId, direction: 'out', gate_name: gate || null, staff_email: user?.email })
      setResult({ status: 'checkedout', name, msg: 'Checked out.' })
      setTimeout(() => setResult(null), 1500)
    }
  }

  async function manualCheckIn() {
    const code = document.getElementById('manualCode').value.trim().toUpperCase()
    if (!code) return
    const { data: reg } = await supabase.from('registrations').select('*').eq('event_id', id).eq('ticket_code', code).maybeSingle()
    if (!reg) { setResult({ status: 'invalid', msg: 'Ticket not found for this event.' }); return }
    if (reg.checked_in) { setResult({ status: 'duplicate', regId: reg.id, name: reg.attendee_data?.name, vip: reg.vip, notes: reg.notes, msg: 'Already checked in.' }); return }
    await doCheckIn(reg)
  }

  const bg =
    result?.status === 'ok' || result?.status === 'checkedout' ? 'bg-green-600' :
    result?.status === 'duplicate' ? 'bg-gold' :
    result ? 'bg-stub' : null

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Link to={`/events/${id}`} className="text-sm text-navy underline">&larr; Back to event</Link>
      <h1 className="font-display text-xl font-semibold text-ink mt-2 mb-3">Scan to check in</h1>

      <input
        value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Gate / entrance name (optional, e.g. Main Entrance)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
      />

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
          {result.status === 'duplicate' && (
            <button onClick={() => checkOutFromScan(result.regId, result.name)} className="mt-3 bg-white/90 text-ink text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-white">
              Check out instead
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-mist mt-4 text-center">Point the camera at the attendee's QR ticket. Scanning pauses briefly after each result.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mt-4">
        <p className="text-xs font-medium text-ink mb-2">No camera? Enter a ticket code manually:</p>
        <div className="flex gap-2">
          <input id="manualCode" placeholder="e.g. 7F3K9QAZ" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={manualCheckIn} className="bg-navy text-paper rounded-lg px-3 py-2 text-sm">Check in</button>
        </div>
      </div>
    </div>
  )
}
