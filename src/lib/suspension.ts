// src/lib/suspension.ts
//
// Suspension rules that are safe to import anywhere (server or browser). The
// check that reads and updates the database is in lib/suspension-server.ts.

/** Sent with every refusal so the UI knows to show the suspension toast. */
export const SUSPENDED_CODE = 'suspended' as const

/** True while a suspension is in force. A suspended account with no end date stays suspended. */
export function isSuspendedNow(
  status: string | null | undefined,
  suspendedUntil: string | null | undefined,
  now = Date.now(),
): boolean {
  if (status !== 'suspended') return false
  if (!suspendedUntil) return true
  const until = Date.parse(suspendedUntil)
  return Number.isNaN(until) ? true : until > now
}

// Lagos time, like the rest of the admin tools: the app's people are in Nigeria,
// and a toast has no way to know a visitor's own timezone.
export function formatSuspendedUntil(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }) + ' (WAT)'
}

/** The line shown in the toast, and in the notification sent when someone is suspended. */
export function suspendedMessage(suspendedUntil: string | null | undefined): string {
  return suspendedUntil
    ? `Your account is suspended until ${formatSuspendedUntil(suspendedUntil)}.`
    : 'Your account is suspended.'
}
