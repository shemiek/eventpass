import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'

export default function ScanCheckIn() {
  const { id } = useParams()
  const scannerRef = useRef(null)
  const [result, setResult] = useState(null) // { status: 'ok'|'duplicate'|'invalid', name }
  const [scanning, setScanning] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    Html5Qrcode.getCameras()
      .then((cams) => {
        if (!cams.length) return
        const backCam = cams.find((c) => /back|rear|environment/i.test(c.label)) || cams[cams.length - 1]
        return scanner.start(
          backCam.id,
          { fps: 10, qrbox: 240 },
          onScanSuccess,
          () => {}
        )
      })
      .then(() => setScanning(true))
      .catch((err) => setResult({ status: 'error', msg: 'Camera access denied: ' + err }))

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [id])

  async function onScanSuccess(decodedText) {
    if (busyRef.current) return
    busyRef.current = true

    const ticketCode = decodedText.trim().toUpperCase()

    const { data: reg, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('event_id', id)
      .eq('ticket_code', ticketCode)
      .maybeSingle()

    if (error || !reg) {
      setResult({ status: 'invalid', msg: 'Ticket not found for this event.' })
    } else if (reg.checked_in) {
      setResult({ status: 'duplicate', regId: reg.id, name: reg.attendee_data?.name, msg: 'Already checked in.' })
    } else {
      const { error: updErr } = await supabase
        .from('registrations')
        .update({ checked_in: true, checked_in_at: new Date().toISOString() })
        .eq('id', reg.id)
      if (updErr) {
        setResult({ status: 'invalid', msg: 'Could not update: ' + updErr.message })
      } else {
        setResult({ status: 'ok', name: reg.attendee_data?.name, msg: 'Checked in.' })
      }
    }

    setTimeout(() => { busyRef.current = false; setResult(null) }, 2500)
  }

  async function checkOutFromScan(regId, name) {
    const { error } = await supabase
      .from('registrations')
      .update({ checked_in: false, checked_in_at: null })
      .eq('id', regId)
    if (!error) {
      setResult({ status: 'checkedout', name, msg: 'Checked out.' })
      setTimeout(() => setResult(null), 1500)
    }
  }

  const bg =
    result?.status === 'ok' || result?.status === 'checkedout' ? 'bg-green-600' :
    result?.status === 'duplicate' ? 'bg-gold' :
    result ? 'bg-stub' : null

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Link to={`/events/${id}`} className="text-sm text-navy underline">&larr; Back to event</Link>
      <h1 className="font-display text-xl font-semibold text-ink mt-2 mb-4">Scan to check in</h1>

      <div id="qr-reader" className="rounded-xl overflow-hidden bg-black" />

      {!scanning && !result && <p className="text-mist text-sm mt-3">Requesting camera access…</p>}

      {result && (
        <div className={`mt-4 rounded-xl text-white p-4 text-center ${bg}`}>
          <p className="font-display text-lg font-semibold">{result.name || '—'}</p>
          <p className="text-sm">{result.msg}</p>
          {result.status === 'duplicate' && (
            <button
              onClick={() => checkOutFromScan(result.regId, result.name)}
              className="mt-3 bg-white/90 text-ink text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-white"
            >
              Check out instead
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-mist mt-4 text-center">
        Point the camera at the attendee's QR ticket. Scanning pauses briefly after each result.
      </p>
    </div>
  )
}
