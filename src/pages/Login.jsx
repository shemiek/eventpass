import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setStatus({ type: 'ok', msg: 'Account created. You can sign in now.' })
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/dashboard')
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        {mode === 'signup' ? 'Create your organizer account' : 'Sign in'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm font-medium text-ink">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-navy outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink">Password</label>
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-navy outline-none"
          />
        </div>

        {status && (
          <p className={`text-sm ${status.type === 'error' ? 'text-stub' : 'text-green-700'}`}>{status.msg}</p>
        )}

        <button
          disabled={busy}
          className="w-full bg-navy text-paper font-medium rounded-lg py-2.5 hover:bg-ink transition-colors disabled:opacity-50"
        >
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        className="text-sm text-navy underline mt-4"
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : "New here? Create an organizer account"}
      </button>
    </div>
  )
}
