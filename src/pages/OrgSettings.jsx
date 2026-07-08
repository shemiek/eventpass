import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

export default function OrgSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name, status, primary_owner_id)')
      .eq('user_id', user.id)

    const orgList = []
    for (const m of memberships || []) {
      if (!m.organizations) continue
      const { data: members } = await supabase.from('organization_members').select('*').eq('org_id', m.organizations.id)
      const { data: auditLog } = await supabase.from('audit_log').select('*').eq('org_id', m.organizations.id).order('created_at', { ascending: false }).limit(20)
      orgList.push({ ...m.organizations, myRole: m.role, members: members || [], auditLog: auditLog || [] })
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
    const { data: existingUserId } = await supabase.rpc('find_user_id_by_email', { p_email: cleanEmail })
    const { error } = await supabase.from('organization_members').insert({
      org_id: orgId, user_id: existingUserId || null, email: cleanEmail, role: 'admin'
    })
    load()
    return error
  }

  async function removeMember(orgId, memberId) {
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId)
    if (error) alert(error.message) // trigger-raised errors (last admin / primary owner) surface here
    load()
  }

  async function transferOwnership(orgId, newOwnerEmail) {
    const { error } = await supabase.rpc('transfer_org_ownership', { p_org_id: orgId, p_new_owner_email: newOwnerEmail })
    if (error) { alert(error.message); return }
    load()
  }

  async function deleteOrganization(orgId) {
    const { error } = await supabase.rpc('delete_organization', { p_org_id: orgId })
    if (error) { alert('Could not delete organization: ' + error.message); return }
    navigate('/dashboard')
  }

  if (loading) return <p className="text-center mt-16 text-mist">Loading…</p>

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink mb-1">Organization settings</h1>
      <p className="text-sm text-mist mb-6">Org admins have full access to every event under the organization — not just ones they personally created.</p>

      {orgs.map(org => (
        <OrgCard
          key={org.id} org={org} currentUserId={user.id}
          onRename={renameOrg} onInvite={inviteAdmin} onRemove={removeMember}
          onTransfer={transferOwnership} onDelete={deleteOrganization}
        />
      ))}
    </div>
  )
}

function OrgCard({ org, onRename, onInvite, onRemove, onTransfer, onDelete, currentUserId }) {
  const [name, setName] = useState(org.name)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState(null)
  const [transferTo, setTransferTo] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const isAdmin = org.myRole === 'admin'
  const isPrimaryOwner = org.primary_owner_id === currentUserId
  const adminMembers = org.members.filter(m => m.role === 'admin')

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError(null)
    const error = await onInvite(org.id, inviteEmail)
    if (error) setInviteError(error.message.includes('duplicate') ? 'That email is already a member.' : error.message)
    else setInviteEmail('')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      {org.status === 'suspended' && (
        <div className="bg-stub/10 border border-stub/30 rounded-lg p-3 mb-3 text-sm text-stub">
          This organization has been suspended by a platform admin. Events can't be created or edited until it's reactivated.
        </div>
      )}

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
        {org.members.map(m => {
          const isThisPrimary = m.user_id === org.primary_owner_id
          const isLastAdmin = adminMembers.length === 1 && m.role === 'admin'
          return (
            <div key={m.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span>
                {m.email}
                {m.user_id === currentUserId && <span className="text-xs text-mist"> (you)</span>}
                {isThisPrimary && <span className="text-xs ml-1.5 bg-gold/20 text-amber-800 px-1.5 py-0.5 rounded-full">Primary owner</span>}
              </span>
              {isAdmin && !isThisPrimary && !isLastAdmin && (
                <button onClick={() => onRemove(org.id, m.id)} className="text-xs text-stub hover:underline">Remove</button>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <form onSubmit={handleInvite} className="flex gap-2 mb-4">
          <input type="email" required placeholder="Invite a co-admin by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button className="text-sm bg-navy text-paper rounded-lg px-3 py-2">Invite</button>
        </form>
      )}
      {inviteError && <p className="text-xs text-stub -mt-3 mb-3">{inviteError}</p>}

      {isPrimaryOwner && adminMembers.length > 1 && (
        <div className="border-t border-gray-100 pt-3 mt-3">
          <p className="text-xs font-medium text-ink mb-2">Transfer primary ownership</p>
          <div className="flex gap-2">
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Choose an admin…</option>
              {adminMembers.filter(m => m.user_id !== currentUserId).map(m => (
                <option key={m.id} value={m.email}>{m.email}</option>
              ))}
            </select>
            <button
              disabled={!transferTo}
              onClick={() => { if (confirm(`Transfer primary ownership to ${transferTo}? You'll remain an admin, but they'll be the only one who can delete this organization or transfer ownership again.`)) onTransfer(org.id, transferTo) }}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 disabled:opacity-40"
            >
              Transfer
            </button>
          </div>
        </div>
      )}

      {org.auditLog.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-3">
          <p className="text-xs font-medium text-ink mb-2">Recent activity</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {org.auditLog.map(a => (
              <p key={a.id} className="text-xs text-mist">
                <span className="font-medium text-ink/70">{a.actor_email}</span> — {describeAction(a)} <span className="text-mist/70">({new Date(a.created_at).toLocaleString()})</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {isPrimaryOwner && (
        <div className="border-t border-gray-100 pt-3 mt-3">
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)} className="text-xs text-stub hover:underline">Delete this organization</button>
          ) : (
            <div className="bg-stub/5 border border-stub/20 rounded-lg p-3">
              <p className="text-xs text-ink mb-2">This permanently deletes the organization and every event under it, including all registrations. Type <strong>DELETE</strong> to confirm.</p>
              <div className="flex gap-2">
                <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                <button
                  disabled={deleteConfirmText !== 'DELETE'}
                  onClick={() => onDelete(org.id)}
                  className="text-xs bg-stub text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
                >
                  Confirm delete
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirmText('') }} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function describeAction(a) {
  switch (a.action) {
    case 'member_invited': return `invited ${a.details.email} as ${a.details.role}`
    case 'member_removed': return `removed ${a.details.email}`
    case 'role_changed': return `changed ${a.details.email}'s role from ${a.details.old_role} to ${a.details.new_role}`
    case 'ownership_transferred': return `transferred primary ownership to ${a.details.to_email}`
    case 'org_status_changed': return `changed org status to ${a.details.new_status}`
    case 'event_deleted': return `deleted event "${a.details.title}"`
    case 'attendee_email_sent': return `emailed ${a.details.sent} attendee(s)${a.details.failed ? ` (${a.details.failed} failed)` : ''} — "${a.details.subject}"`
    case 'organization_deleted': return `deleted the organization "${a.details.name}"`
    case 'user_deactivated': return `deactivated a user account`
    case 'user_reactivated': return `reactivated a user account`
    default: return a.action
  }
}
