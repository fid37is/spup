// src/lib/suspension-server.ts
//
// The one place server code asks "is this person suspended right now?".
// Server-only: it can write to the database. The pure rules and wording are in
// lib/suspension.ts so the browser can use them too.

import { createAdminClient } from '@/lib/supabase/server'
import { SUSPENDED_CODE, isSuspendedNow, suspendedMessage } from '@/lib/suspension'

export interface SuspensionRefusal {
  error: string
  code: typeof SUSPENDED_CODE
  suspendedUntil: string | null
}

/**
 * Returns null when the person may act, or a refusal ({ error, code, suspendedUntil })
 * to hand straight back to the client, which shows `error` as a toast.
 *
 * Pass `status` (and `suspended_until`) if the caller already loaded them; otherwise
 * they are looked up by id. If the migration adding suspended_until has not been run
 * yet the lookup fails and this returns null, so nothing breaks - it just doesn't block. A suspension whose end date has passed is lifted here
 * (status goes back to 'active'), so nothing else has to clean up after it.
 */
export async function suspensionBlock(profile: {
  id: string
  status?: string | null
  suspended_until?: string | null
}): Promise<SuspensionRefusal | null> {
  // Fast path: callers that already loaded `status` and found an active account
  // cost nothing here (no query), which is nearly every call.
  if (profile.status && profile.status !== 'suspended') return null

  let status = profile.status
  let until = profile.suspended_until

  if (status === undefined || until === undefined) {
    const { data } = await createAdminClient()
      .from('users').select('status, suspended_until').eq('id', profile.id).maybeSingle()
    status = data?.status
    until = data?.suspended_until
  }

  if (status !== 'suspended') return null

  if (!isSuspendedNow(status, until)) {
    // The date has passed: back to normal.
    await createAdminClient()
      .from('users').update({ status: 'active', suspended_until: null })
      .eq('id', profile.id).eq('status', 'suspended')
    return null
  }

  return { error: suspendedMessage(until), code: SUSPENDED_CODE, suspendedUntil: until ?? null }
}
