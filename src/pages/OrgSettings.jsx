import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

export default function OrgSettings() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState([]) // [{id, name, myRole, members: [...]}]
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name)')
      .eq('user_id', user.id)

    const orgList = []
    for (const m of memberships || []) {
      if (!m.organizations) continue
      const { data: members } = await supabase.from('organization_members').select('*').eq('org_id', m.organizations.id)
      orgList.push({ id: m.organizations.id, name: m.organizations.name, myRole: m.role, members: members || [] })
    }
    setOrgs(orgList)
    setLoading(false)
  }

  async function renameOrg(orgId, newName) {
    await supabase.from('organizations').update({ name: newName }).eq('id', orgId)
    load()
  }

  async function inviteAdmin(orgId, email) {
    if (!email.trim()) return
    const cleanEmail = email.trim().toLowerCase()
    // If they already have an account, link it now; otherwise user_id stays
    // null and gets linked automatically the moment they sign up with this email.
    const { data: existingUserId } = await supabase.rpc('find_user_id_by_email', { p_email: cleanEmail })
    const { error } = await supabase.from('organization_members').insert({
      org_id: orgId, user_id: existingUserId || null, email: cleanEmail, role: 'admin'
    })
    load()
    return error
  }

  async function removeMember(orgId, memberId) {
    await supabase.from('organization_members').delete().eq('id', memberId)
    load()
  }

  if (loading) return <p className="text-center mt-16 text-mist">Loading…</p>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink mb-1">Organization settings</h1>
      <p className="text-sm text-mist mb-6">Org admins have full access to every event under the organization — not just ones they personally created.</p>

      {orgs.map(org => (
        <OrgCard key={org.id} org={org} onRename={renameOrg} onInvite={inviteAdmin} onRemove={removeMember} currentUserId={user.id} />
      ))}
    </div>
  )
}

function OrgCard({ org, onRename, onInvite, onRemove, currentUserId }) {
  const [name, setName] = useState(org.name)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState(null)
  const isAdmin = org.myRole === 'admin'

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError(null)
    const error = await onInvite(org.id, inviteEmail)
    if (error) setInviteError(error.message.includes('duplicate') ? 'That email is already a member.' : error.message)
    else setInviteEmail('')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <input
          value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin}
          onBlur={() => isAdmin && name !== org.name && onRename(org.id, name)}
          className="font-display font-semibold text-lg border-none bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1 -mx-1 disabled:text-ink"
        />
        {!isAdmin && <span className="text-xs text-mist">(member)</span>}
      </div>

      <p className="text-xs font-medium text-mist mb-2 uppercase tracking-wide">Admins</p>
      <div className="space-y-1 mb-4">
        {org.members.map(m => (
          <div key={m.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
            <span>{m.email}{m.user_id === currentUserId && <span className="text-xs text-mist"> (you)</span>}</span>
            {isAdmin && m.user_id !== currentUserId && (
              <button onClick={() => onRemove(org.id, m.id)} className="text-xs text-stub hover:underline">Remove</button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <form onSubmit={handleInvite} className="flex gap-2">
          <input type="email" required placeholder="Invite a co-admin by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button className="text-sm bg-navy text-paper rounded-lg px-3 py-2">Invite</button>
        </form>
      )}
      {inviteError && <p className="text-xs text-stub mt-1">{inviteError}</p>}
    </div>
  )
}
