// src/lib/kyc/dojah.ts
import 'server-only'

// ============================================================
// Dojah (https://dojah.io) — pay-as-you-go identity provider.
//
// We call "Verify NIN/BVN with a selfie":
//   POST /api/v1/kyc/nin/verify   { nin, selfie_image, threshold? }
//   POST /api/v1/kyc/bvn/verify   { bvn, selfie_image, threshold? }
// One call = does the number exist + does the person holding the phone
// match the photo NIMC/banks have on file. A bare "does this NIN exist"
// lookup lets anyone verify with somebody else's number; the selfie
// match is what makes the badge mean something.
//
// Auth: the secret key is sent as-is in `Authorization` (NOT "Bearer"),
// plus the `AppId` header.
//
// Env:
//   DOJAH_APP_ID, DOJAH_SECRET_KEY    — from the Dojah dashboard
//   DOJAH_BASE_URL                    — https://api.dojah.io (live, default)
//                                       https://sandbox.dojah.io (free, test data)
//   DOJAH_SELFIE_THRESHOLD            — optional, 50–100. Unset = Dojah's
//                                       default of 90 (strict). Lower = more
//                                       genuine users pass, but higher
//                                       impersonation risk.
// ============================================================

export type KycKind = 'nin' | 'bvn'

export type ProviderResult =
  | { status: 'verified'; name: string }
  // The provider gave a real answer and it was "no" — this counts as a used attempt.
  | { status: 'rejected'; reason: string }
  // Our side / provider side failed — the attempt must be handed back.
  | { status: 'unavailable'; reason: string }

function fullName(parts: unknown[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(' ')
}

export async function verifyWithDojah(
  kind: KycKind,
  idNumber: string,
  selfieBase64: string,
): Promise<ProviderResult> {
  const appId = process.env.DOJAH_APP_ID
  const secret = process.env.DOJAH_SECRET_KEY
  if (!appId || !secret) {
    console.error('Dojah: DOJAH_APP_ID / DOJAH_SECRET_KEY are not set')
    return { status: 'unavailable', reason: 'not_configured' }
  }

  const base = process.env.DOJAH_BASE_URL || 'https://api.dojah.io'
  const body: Record<string, unknown> = {
    [kind]: idNumber,
    selfie_image: selfieBase64,
  }
  const threshold = Number(process.env.DOJAH_SELFIE_THRESHOLD)
  if (Number.isFinite(threshold) && threshold >= 50 && threshold <= 100) {
    body.threshold = threshold
  }

  let res: Response
  try {
    res = await fetch(`${base}/api/v1/kyc/${kind}/verify`, {
      method: 'POST',
      headers: {
        Authorization: secret,
        AppId: appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    console.error('Dojah request failed:', err)
    return { status: 'unavailable', reason: 'network' }
  }

  // 402 = OUR Dojah wallet is empty. Users must never pay for that, and you
  // need to hear about it — watch your logs / set a low-balance alert in Dojah.
  if (res.status === 402) {
    console.error('Dojah: insufficient wallet balance — top up the Dojah wallet NOW')
    return { status: 'unavailable', reason: 'provider_wallet_empty' }
  }
  if (res.status === 401) {
    console.error('Dojah: 401 — check DOJAH_SECRET_KEY / DOJAH_APP_ID (no "Bearer" prefix)')
    return { status: 'unavailable', reason: 'auth' }
  }
  // 424 = upstream (NIMC / bank) unavailable, 429 = rate limited, 5xx = Dojah down.
  if (res.status === 424 || res.status === 429 || res.status >= 500) {
    return { status: 'unavailable', reason: `upstream_${res.status}` }
  }
  if (res.status === 404) {
    return { status: 'rejected', reason: `We couldn't find that ${kind.toUpperCase()}. Check the number and try again.` }
  }
  if (res.status === 400) {
    return { status: 'rejected', reason: 'That selfie or number could not be read. Retake the selfie in good light and try again.' }
  }
  if (!res.ok) {
    console.error('Dojah unexpected status', res.status)
    return { status: 'unavailable', reason: `unexpected_${res.status}` }
  }

  let data: { entity?: Record<string, any> }
  try {
    data = await res.json()
  } catch {
    return { status: 'unavailable', reason: 'bad_json' }
  }

  const entity = data.entity
  if (!entity) {
    return { status: 'rejected', reason: `We couldn't find that ${kind.toUpperCase()}. Check the number and try again.` }
  }

  if (entity.selfie_verification?.match !== true) {
    return { status: 'rejected', reason: "Your selfie didn't match the photo on record. Retake it facing the camera in good light, no filters, no glasses or cap." }
  }

  const name = kind === 'nin'
    ? fullName([entity.firstname, entity.surname])
    : fullName([entity.first_name, entity.last_name])

  return { status: 'verified', name }
}
