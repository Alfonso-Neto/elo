import { createClient } from '@supabase/supabase-js'
import { validatePublicSupabaseConfig } from './runtime-config'

export const publicSupabaseConfig = validatePublicSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

export const supabase = publicSupabaseConfig.configured
  ? createClient(publicSupabaseConfig.url, publicSupabaseConfig.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: 'elo-auth',
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) throw new Error(publicSupabaseConfig.issue ?? 'Supabase não configurado.')
  return supabase
}
