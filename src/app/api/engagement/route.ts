import { NextRequest, NextResponse } from 'next/server'
import { toggleLikeAction, toggleFollowAction } from '@/lib/actions'

/**
 * Delivery endpoint for likes and follows (see src/lib/engagement-sync.ts).
 *
 * Server actions can't be given a timeout, can't be cancelled, and run one at
 * a time - on a weak connection one hung request would block every tap behind
 * it. A plain fetch to this route has a real timeout, runs in parallel, and can
 * finish while the page is closing. It calls the same actions the buttons used
 * before, so validation, counters and notifications are unchanged.
 *
 * The body carries the state wanted (desired: true/false), so replaying the
 * same request any number of times leaves the same result.
 *
 * Status codes drive the client's retry logic:
 *   200 confirmed | 400/401/403/404 definite "no" (client stops and undoes the tap)
 *   429 + code 'follow_paused'  following is paused for a few hours (spam limit);
 *                               a definite "no" too, with the message to show
 *   5xx           worth retrying
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  let body: { kind?: unknown; id?: unknown; desired?: unknown } | null = null
  try { body = await request.json() } catch { /* handled below */ }

  const kind = body?.kind
  const id = body?.id
  const desired = body?.desired
  if ((kind !== 'like' && kind !== 'follow') || typeof id !== 'string' || !UUID.test(id) || typeof desired !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })
  }

  try {
    const result = kind === 'like'
      ? await toggleLikeAction(id, desired)
      : await toggleFollowAction(id, desired)

    if ('error' in result) {
      // toggleFollowAction's return type doesn't carry a pausedUntil field -
      // only code, so that's all there is to forward. engagement-sync.ts
      // already falls back to its own default pause window when this is
      // absent (see pausedMessage / setFollowPausedUntil there), so leaving
      // it out here is safe rather than fabricating a value.
      if ('code' in result && result.code === 'follow_paused') {
        return NextResponse.json(
          { ok: false, error: result.error, code: 'follow_paused' },
          { status: 429 },
        )
      }
      if ((result as { code?: string }).code === 'suspended') {
        return NextResponse.json({ ok: false, error: (result as { error?: string }).error, code: 'suspended' }, { status: 403 })
      }
      if ('code' in result && result.code === 'follow_blocked') {
        return NextResponse.json({ ok: false, error: result.error, code: 'follow_blocked' }, { status: 403 })
      }
      const msg = String(result.error)
      const status =
        msg === 'Not authenticated' ? 401 :
        /cannot follow yourself/i.test(msg) ? 400 :
        /permission denied/i.test(msg) ? 403 :
        500
      return NextResponse.json({ ok: false, error: msg }, { status })
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('engagement route failed:', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}