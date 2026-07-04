import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configError =
  !url || !anonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. If you are the site owner: add both environment variables in your hosting provider (e.g. Vercel Project Settings → Environment Variables) and redeploy — Vite bakes these in at build time, so a redeploy is required after adding or changing them.'
    : null

// Use harmless placeholder values when misconfigured so createClient() doesn't
// throw and blank the whole app before App.jsx gets a chance to show a real error screen.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key')
