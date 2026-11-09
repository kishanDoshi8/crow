import { createClient, type Session } from '@supabase/supabase-js'
import type { Database } from '@/shared/lib/supabase.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and fill in your values.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnon)

// The session saved on this device, as the auth client stored it. Used when
// the app opens offline with an expired access token: the client can't
// refresh it, so it reports no session, but the person is still signed in
// and their saved data should show. The client refreshes it once online.
export function readSavedSession(): Session | null {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<Session>
    if (!saved.access_token || !saved.refresh_token || !saved.user?.id) return null
    return saved as Session
  } catch {
    return null
  }
}
