// src/lib/link-safety/web-risk.ts
//
// Layer 2b: Google Web Risk (the Lookup API) for real-time malware / phishing / unwanted
// software checks. Needs GOOGLE_WEB_RISK_API_KEY. Without a key this layer is simply skipped.
// If the key is set but Google can't be reached, the caller fails open (see engine.ts).

import { WEB_RISK_TIMEOUT_MS } from './config'

export type WebRiskResult =
  | { status: 'clean' }
  | { status: 'threat'; types: string[] }
  | { status: 'unavailable' }      // key set, but the call failed or timed out
  | { status: 'disabled' }         // no key configured

export function webRiskEnabled(): boolean {
  return !!process.env.GOOGLE_WEB_RISK_API_KEY
}

export async function checkWebRisk(url: string): Promise<WebRiskResult> {
  const key = process.env.GOOGLE_WEB_RISK_API_KEY
  if (!key) return { status: 'disabled' }

  const params = new URLSearchParams({ uri: url, key })
  for (const t of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) params.append('threatTypes', t)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), WEB_RISK_TIMEOUT_MS)
  try {
    const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${params}`, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) {
      console.error('[link-safety] Web Risk returned', res.status)
      return { status: 'unavailable' }
    }
    const json = (await res.json()) as { threat?: { threatTypes?: string[] } }
    const types = json.threat?.threatTypes ?? []
    return types.length > 0 ? { status: 'threat', types } : { status: 'clean' }
  } catch (err) {
    console.error('[link-safety] Web Risk call failed:', (err as Error)?.name ?? err)
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
