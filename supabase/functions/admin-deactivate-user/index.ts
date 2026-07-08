// Supabase Edge Function: admin-deactivate-user
//
// Platform-wide account deactivation — distinct from "Remove" in Organization
// Settings or event team management, which only revoke access to ONE org or
// event. This disables the person's login entirely, everywhere, and can only
// be done by a platform admin. It has to be a server-side function because
// actually banning a login requires the Supabase Auth Admin API, which
// requires the service role key — never something that can be shipped to
// the browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

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
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders })
    }

    // Confirm the caller is actually a platform admin using their own RLS-scoped call.
    const { data: isAdmin } = await callerClient.rpc('is_platform_admin')
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Platform admin access required' }), { status: 403, headers: corsHeaders })
    }

    const { targetUserId, deactivate } = await req.json()
    if (!targetUserId || typeof deactivate !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Missing targetUserId or deactivate flag' }), { status: 400, headers: corsHeaders })
    }
    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: "You can't deactivate your own account" }), { status: 400, headers: corsHeaders })
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // ban_duration accepts a duration string; Supabase treats a very long
    // duration as effectively permanent. 'none' lifts an existing ban.
    const { error: banErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: deactivate ? '876000h' : 'none' // ~100 years, or lift the ban
    })
    if (banErr) {
      return new Response(JSON.stringify({ error: banErr.message }), { status: 500, headers: corsHeaders })
    }

    await adminClient.from('profiles').update({ is_deactivated: deactivate }).eq('id', targetUserId)
    await adminClient.rpc('log_audit', {
      p_org_id: null,
      p_action: deactivate ? 'user_deactivated' : 'user_reactivated',
      p_details: { target_user_id: targetUserId, actor_email: user.email }
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
