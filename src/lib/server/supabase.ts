import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  return value
}

function getServerKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

export function getServerSupabaseClient() {
  const key = getServerKey()
  if (!key) throw new Error('Supabase server key is not configured')
  return createClient<Database>(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
