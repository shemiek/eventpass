import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

export default function SessionScan() {
  const { id, sessionId } = useParams()
  const { user } = useAuth()
  const [session, setSession] = useState(null)
  const scannerRef = useRef(null)
  const [result, setResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => setSession(data))
  }, [sessionId])

  useEffect(() => {
    const scanner = new Html5Qrcode('session-qr-reader')
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
  }, [sessionId])

  async function onScanSuccess(decodedText) {
    if (busyRef.current) return
    busyRef.current = true
    const ticketCode = decodedText.trim().toUpperCase()

    const { data: reg } = await supabase.from('registrations').select('*').eq('event_id', id).eq('ticket_code', ticketCode).maybeSingle()
    if (!reg) {
      setResult({ status: 'invalid', msg: 'Ticket not found for this event.' })
    } else if (!(reg.session_ids || []).includes(sessionId)) {
      setResult({ status: 'duplicate', name: reg.attendee_data?.name, msg: "Didn't register for this session — logging anyway." })
      await logAttendance(reg.id)
    } else {
      const { data: existing } = await supabase.from('session_attendance').select('id').eq('session_id', sessionId).eq('registration_id', reg.id).maybeSingle()
      if (existing) {
        setResult({ status: 'duplicate', name: reg.attendee_data?.name, msg: 'Already marked present for this session.' })
      } else {
        await logAttendance(reg.id)
        setResult({ status: 'ok', name: reg.attendee_data?.name, msg: 'Marked present.' })
      }
    }
    setTimeout(() => { busyRef.current = false; setResult(null) }, 2500)
  }

  async function logAttendance(registrationId) {
    await supabase.from('session_attendance').insert({ session_id: sessionId, registration_id: registrationId, staff_email: user?.email })
  }

  const bg = result?.status === 'ok' ? 'bg-green-600' : result?.status === 'duplicate' ? 'bg-gold' : result ? 'bg-stub' : null

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <Link to={`/events/${id}`} className="text-sm text-navy underline">&larr; Back to event</Link>
      <h1 className="font-display text-xl font-semibold text-ink mt-2 mb-1">Session attendance</h1>
      <p className="text-sm text-mist mb-3">{session?.title || 'Loading session…'}</p>

      <div id="session-qr-reader" className="rounded-xl overflow-hidden bg-black" />

      {!scanning && !result && <p className="text-mist text-sm mt-3">Requesting camera access…</p>}

      {result && (
        <div className={`mt-4 rounded-xl text-white p-4 text-center ${bg}`}>
          <p className="font-display text-lg font-semibold">{result.name || '—'}</p>
          <p className="text-sm">{result.msg}</p>
        </div>
      )}

      <p className="text-xs text-mist mt-4 text-center">
        This logs attendance for this specific session only — it doesn't affect overall event check-in.
      </p>
    </div>
  )
}
