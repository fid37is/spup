// src/app/api/share-image/route.ts
//
// Hands an avatar / post photo to the browser from OUR OWN address.
//
// The share card is drawn on a <canvas> in the page (lib/share-card/draw.ts). A canvas that has
// drawn an image from another site can't be turned into a picture unless that site sends CORS
// headers, and the image CDNs don't reliably do that. Fetching the file here, server side, and
// serving it from the same origin avoids the problem for every image format.
//
// Only our own image hosts can be fetched (the address comes from the browser, so it must never
// be able to point anywhere else), and only images, and only up to MAX_BYTES.

import { cloudinaryImage } from '@/lib/utils/cloudinary'

const ALLOWED_HOSTS = [/^cdn\.spup\.live$/, /^res\.cloudinary\.com$/, /\.supabase\.co$/, /^images\.unsplash\.com$/, /^picsum\.photos$/]
const MAX_BYTES = 6_000_000
const TIMEOUT_MS = 8000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('url')
  const width = Math.min(1600, Math.max(64, Number(searchParams.get('w')) || 800))
  if (!raw) return new Response('Missing url', { status: 400 })

  let target: URL
  try {
    target = new URL(cloudinaryImage(raw, width) || raw)
  } catch {
    return new Response('Bad url', { status: 400 })
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.some(re => re.test(target.hostname))) {
    return new Response('Host not allowed', { status: 403 })
  }

  try {
    const upstream = await fetch(target.href, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!upstream.ok) return new Response('Upstream error', { status: 502 })
    const type = upstream.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return new Response('Not an image', { status: 415 })
    const body = await upstream.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return new Response('Bad size', { status: 413 })
    return new Response(body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Fetch failed', { status: 504 })
  }
}
