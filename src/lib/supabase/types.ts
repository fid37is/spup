// Re-export a helper so callers get the typed supabase client
// without importing from two different places.
export type { SupabaseClient } from '@supabase/supabase-js'

// Convenience: the resolved return type of our server client factory.
// Use this when passing the client as a parameter so each module doesn't
// have to await its own instance.
import type { createClient as createServerClient } from './server'
export type ServerClient = Awaited<ReturnType<typeof createServerClient>>
