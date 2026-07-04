import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function TeamManager({ eventId, team, setTeam }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('scanner')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function invite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('team_members')
      .insert({ event_id: eventId, email: email.trim().toLowerCase(), role })
      .select()
      .single()
    if (err) {
      setError(err.message.includes('duplicate') ? 'That email is already on the team.' : err.message)
    } else {
      setTeam([...team, data])
      setEmail('')
    }
    setBusy(false)
  }

  async function updateRole(id, newRole) {
    await supabase.from('team_members').update({ role: newRole }).eq('id', id)
    setTeam(team.map(t => t.id === id ? { ...t, role: newRole } : t))
  }

  async function remove(id) {
    await supabase.from('team_members').delete().eq('id', id)
    setTeam(team.filter(t => t.id !== id))
  }

  return (
    <div>
      <p className="text-xs text-mist mb-3">
        <strong>Manager</strong> can edit the event, manage the team, and export data. <strong>Scanner</strong> can only check attendees in/out.
        Invited people gain access the moment they sign up with this exact email — no separate account creation needed.
      </p>

      <form onSubmit={invite} className="flex gap-2 mb-4 flex-wrap">
        <input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="scanner">Scanner</option>
          <option value="manager">Manager</option>
        </select>
        <button disabled={busy} className="bg-navy text-paper rounded-lg px-4 py-2 text-sm font-medium hover:bg-ink disabled:opacity-50">Invite</button>
      </form>
      {error && <p className="text-sm text-stub mb-3">{error}</p>}

      <div className="space-y-2">
        {team.length === 0 && <p className="text-sm text-mist">No team members yet — you're the only one with access.</p>}
        {team.map(t => (
          <div key={t.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-sm">{t.email}</span>
            <div className="flex items-center gap-2">
              <select value={t.role} onChange={(e) => updateRole(t.id, e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-xs">
                <option value="scanner">Scanner</option>
                <option value="manager">Manager</option>
              </select>
              <button onClick={() => remove(t.id)} className="text-stub text-xs hover:underline">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
