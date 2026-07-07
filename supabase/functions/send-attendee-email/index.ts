// Supabase Edge Function: send-attendee-email
//
// Sends an email to one or more attendees (instructions, badge link, etc.)
// via Resend, and records exactly one audit log entry for the action.
//
// This has to be a server-side function, not client code, because:
// 1. Sending email requires the Resend API secret key, which must never be
//    shipped in frontend JavaScript.
// 2. Writing to audit_log requires bypassing RLS (the table has no client
//    INSERT policy at all, by design — see schema_v8.sql) via the service
//    role key, which also must never reach the browser.
//
// Deploy with the Supabase CLI (see README for the exact commands) and set
// two secrets first: RESEND_API_KEY and (already provided automatically by
// Supabase) SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Client scoped to the CALLER's own JWT — used only to verify they
    // actually have manager/owner access to this event, via the same RLS
    // that protects everything else. If they don't, these queries return
    // nothing and we bail out below.
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    const body = await req.json()
    const { eventId, registrationIds, subject, message, includeBadgeLink, siteUrl } = body
    if (!eventId || !Array.isArray(registrationIds) || !registrationIds.length || !subject || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders })
    }

    // Confirm the caller can actually manage this event (RLS-scoped query —
    // returns null for anyone who isn't owner/org-admin/event-manager).
    const { data: event, error: eventErr } = await callerClient.from('events').select('id, title').eq('id', eventId).single()
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found or not accessible' }), { status: 403, headers: corsHeaders })
    }

    // Registrations, also fetched with the caller's own permissions (RLS
    // already restricts this to team members of the event).
    const { data: registrations, error: regErr } = await callerClient
      .from('registrations').select('id, ticket_code, attendee_data').eq('event_id', eventId).in('id', registrationIds)
    if (regErr || !registrations || !registrations.length) {
      return new Response(JSON.stringify({ error: 'No matching registrations found' }), { status: 404, headers: corsHeaders })
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email is not configured yet — RESEND_API_KEY secret is missing. See README.' }), { status: 500, headers: corsHeaders })
    }

    let sent = 0, failed = 0
    for (const reg of registrations) {
      const to = reg.attendee_data?.email
      if (!to) { failed++; continue }

      const badgeLine = includeBadgeLink && siteUrl
        ? `<p><a href="${siteUrl}/ticket/${reg.ticket_code}">View your badge and ticket</a></p>`
        : ''

      const html = `<div style="font-family:sans-serif;line-height:1.5;">
        <p>Hi ${escapeHtml(reg.attendee_data?.name || '')},</p>
        <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
        ${badgeLine}
        <p style="color:#8C93AC;font-size:12px;margin-top:24px;">Regarding: ${escapeHtml(event.title)}</p>
      </div>`

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'EventoPass <onboarding@resend.dev>', // replace with your verified sending domain once you have one
          to,
          subject,
          html
        })
      })
      if (resp.ok) sent++; else failed++
    }

    // Service-role client — the only place in this whole app that uses this
    // key — purely to write the one audit log entry, bypassing RLS since
    // audit_log intentionally has no client-facing INSERT policy.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: eventOrg } = await adminClient.from('events').select('org_id').eq('id', eventId).single()
    await adminClient.rpc('log_audit', {
      p_org_id: eventOrg?.org_id ?? null,
      p_action: 'attendee_email_sent',
      p_details: { event_id: eventId, subject, sent, failed, actor_email: user.email }
    })

    return new Response(JSON.stringify({ sent, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
}
