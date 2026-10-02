// src/lib/push/fcm.ts
//
// Sends native (Android/iOS) push notifications through the Firebase Cloud
// Messaging HTTP v1 API.
//
// Deliberately uses plain fetch + WebCrypto instead of the firebase-admin
// package: firebase-admin depends on Node-only APIs and generally does not
// run on Cloudflare Workers (which this project targets via OpenNext).
// This file has no dependencies and runs on both Workers and Node 18+.
//
// Needs one env var:
//   FIREBASE_SERVICE_ACCOUNT_KEY = the service-account JSON (Firebase console >
//   Project settings > Service accounts > Generate new private key), either
//   pasted as-is or base64-encoded (handy for hosts that mangle multi-line
//   values). NEVER commit it or expose it to the client.

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

/**
 * Android notification channel used for every push. It is created on the
 * phone with HIGH importance (see use-push-notifications.ts) - that is what
 * makes notifications slide down as a banner instead of landing silently in
 * the shade. Keep this id in sync with the hook.
 */
export const ANDROID_CHANNEL_ID = 'spup_default'

const enc = new TextEncoder()

let account: ServiceAccount | null = null
let keyPromise: Promise<CryptoKey> | null = null
let cachedToken: { value: string; expiresAt: number } | null = null

function getAccount(): ServiceAccount {
  if (account) return account

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
  if (!raw) {
    throw new Error('FCM is not configured - missing FIREBASE_SERVICE_ACCOUNT_KEY env var')
  }

  const json = raw.startsWith('{') ? raw : atob(raw) // plain JSON or base64 of it
  const parsed = JSON.parse(json) as Partial<ServiceAccount>
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id / client_email / private_key')
  }

  account = {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    // Some hosts store the key with literal "\n" sequences; normalise them.
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  }
  return account
}

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getSigningKey(pem: string): Promise<CryptoKey> {
  if (!keyPromise) {
    const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
    const bin = atob(b64)
    const der = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
    keyPromise = crypto.subtle.importKey(
      'pkcs8',
      der as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    keyPromise.catch(() => { keyPromise = null }) // allow a retry after a bad key
  }
  return keyPromise
}

/** OAuth2 access token for the FCM scope. Cached until ~5 minutes before expiry. */
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - 300 > now) return cachedToken.value

  const sa = getAccount()
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`

  const key = await getSigningKey(sa.private_key)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned) as BufferSource)
  const assertion = `${unsigned}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`FCM auth failed (${res.status}): ${await res.text()}`)

  const json = await res.json() as { access_token: string; expires_in?: number }
  cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) }
  return cachedToken.value
}

export interface FcmMessage {
  title: string
  body: string
  /** FCM requires every data value to be a string. */
  data: Record<string, string>
}

/**
 * Returns 'stale' if the device token is dead and its row should be deleted,
 * 'ok' otherwise (including transient failures - a network blip or a
 * misconfiguration must never delete a valid device).
 */
export async function sendFcm(deviceToken: string, message: FcmMessage): Promise<'ok' | 'stale'> {
  try {
    const sa = getAccount()
    const accessToken = await getAccessToken()

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: ANDROID_CHANNEL_ID,
              notification_priority: 'PRIORITY_HIGH',
              default_sound: true,
              default_vibrate_timings: true,
            },
          },
        },
      }),
    })

    if (res.ok) return 'ok'

    const text = await res.text()
    // UNREGISTERED / bad token = the app was uninstalled or the token rotated.
    if (res.status === 404 || /UNREGISTERED/.test(text) || (res.status === 400 && /registration token/i.test(text))) {
      return 'stale'
    }
    if (res.status === 401) cachedToken = null // force a fresh access token next time
    console.error(`FCM send failed (${res.status}):`, text)
    return 'ok'
  } catch (err) {
    console.error('FCM push send failed:', err instanceof Error ? err.message : err)
    return 'ok'
  }
}
