// src/lib/supabase/index.ts
//
// IMPORTANT — import rules:
//
//   Server components, server actions, API routes, middleware:
//     import { createClient } from '@/lib/supabase/server'
//     import { createAdminClient } from '@/lib/supabase/server'
//
//   Client components ('use client'):
//     import { createBrowserClient } from '@/lib/supabase/client'
//
// This barrel file is intentionally left minimal.
// It must NOT re-export anything from ./server because that module
// imports `cookies` from `next/headers` — a server-only API.
// Importing it in a client component bundle causes the
// "Client Component Browser" crash you just saw.
//
// If you need a shared type, export it from ./types only:
export type { ServerClient } from './types'