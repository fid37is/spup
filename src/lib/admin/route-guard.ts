// src/lib/admin/route-guard.ts
// Auth guard for the admin export endpoints.
//
// Exports contain bulk personal data, so they are admin-only - moderators can
// see the admin panel but not export from it (same rule as the waitlist
// invite actions in lib/actions/admin.ts). The buttons are always rendered;
// this guard is the enforcement point, and a denial surfaces inline in the button.

import { requireAdmin } from '@/lib/actions/admin'

/**
 * For route handlers. Returns `{ ok: false, response }` (a ready-to-return
 * 401/403 JSON response) or `{ ok: true, profile }`.
 *
 * proxy.ts deliberately skips /api/* for its role checks, so every export
 * endpoint must call this itself - it is the only gate.
 */
export async function guardAdminRequest() {
  const { error, admin, profile } = await requireAdmin(false)

  if (error || !admin || !profile) {
    const unauthenticated = error === 'Not authenticated'
    return {
      ok: false as const,
      response: Response.json(
        { error: unauthenticated ? 'Your session has expired - please sign in again.' : 'Only admins can export data.' },
        { status: unauthenticated ? 401 : 403 },
      ),
    }
  }

  return { ok: true as const, profile }
}