// src/lib/og/fetch-image.ts
//
// Downloads an avatar / post photo and hands it to the share card as a data URI.
//
// Done by hand (instead of letting the image renderer fetch the URL) so that:
//   - only our own image hosts are ever contacted (the URL comes from the database),
//   - a slow or missing image can never stall or break the card - it just comes back null and
//     the card draws without it (initial letter for an avatar, no photo for a post),
//   - the file type is checked: the renderer reads PNG / JPEG / GIF reliably. WebP - which the
//     app re-encodes most uploads to - is returned too, flagged, so the caller can try it and
//     drop it if the renderer rejects it.

import { cloudinaryImage } from '@/lib/utils/cloudinary'

const ALLOWED_HOSTS = [/^cdn\.spup\.live$/, /^res\.cloudinary\.com$/, /\.supabase\.co$/, /^images\.unsplash\.com$/, /^picsum\.photos$/]
const MAX_BYTES = 2_500_000
const TIMEOUT_MS = 4000

export interface FetchedImage { dataUri: string; type: 'png' | 'jpeg' | 'gif' | 'webp' }

function sniff(b: Uint8Array): FetchedImage['type'] | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

/** `width` asks the CDN for a smaller copy - a 116px avatar should not download 1200px. */
export async function fetchImage(url: string | null | undefined, width: number): Promise<FetchedImage | null> {
  if (!url) return null
  try {
    const sized = cloudinaryImage(url, width) || url
    const u = new URL(sized)
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.some(re => re.test(u.hostname))) return null

    const res = await fetch(u.href, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Prefer formats the renderer reads; the CDN may still answer with WebP.
      headers: { Accept: 'image/png,image/jpeg,image/gif;q=0.9,image/*;q=0.5' },
    })
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') || 0)
    if (len > MAX_BYTES) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null
    const type = sniff(bytes)
    if (!type) return null
    return { dataUri: `data:image/${type};base64,${toBase64(bytes)}`, type }
  } catch {
    return null
  }
}
