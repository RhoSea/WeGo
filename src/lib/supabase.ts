import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env has not been filled in yet; the app shows setup help instead. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// PKCE puts the auth code in the query string, so it never collides with the
// hash-based routes that GitHub Pages needs.
export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

/** Absolute app root, e.g. https://user.github.io/wego/ — used for magic links. */
export function appBaseUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

export function inviteUrl(token: string): string {
  return `${appBaseUrl()}#/join/${encodeURIComponent(token)}`
}
