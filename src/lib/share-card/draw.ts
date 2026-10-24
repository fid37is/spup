// src/lib/share-card/draw.ts
//
// Draws the SHARE CARD - the picture that goes out to WhatsApp / Instagram / X / SMS when
// someone shares a post or a profile: the person's avatar and name, the post (or their bio) and
// the Spup mark, on a white card.
//
// It is drawn right here in the page, on a <canvas>, and handed to the phone's share sheet as a
// picture. That is deliberate. The other way to get a card into WhatsApp is to wait for WhatsApp
// to fetch the link and build a preview itself, and that is outside our control (it needs the
// platform's crawler to reach the page, in time, and to like the image). A picture we attach
// always shows up, looks the way we drew it, and works for any image format and any emoji the
// browser can show.
//
// Browser only (canvas, document.fonts) - import it lazily from the share handlers.

import { SPUP_LOGO_DATA_URI, SPUP_LOGO_SIZE } from '@/lib/og/logo-data'

export const CARD_W = 1200
export const CARD_H = 630

const BRAND = '#1A9E5F'
const INK = '#17181C'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'
const FONT_STACK = `'DM Sans','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_STACK}`

// Badge colours, as in components/ui/verified-badge.tsx.
const TIER_FILL: Record<string, string> = {
  standard: '#22C55E', pioneer: '#D4A017', creator: BRAND, organisation: '#D4A017', spup: '#D4A017',
}
const SEAL_PATH =
  'M22.9 12C22.9 13.4 21.13 14.27 20.59 15.56C20.06 16.85 20.7 18.72 19.71 19.71C18.72 20.7 16.85 20.06 15.56 20.59C14.27 21.13 13.4 22.9 12 22.9C10.6 22.9 9.73 21.13 8.44 20.59C7.15 20.06 5.28 20.7 4.29 19.71C3.3 18.72 3.94 16.85 3.41 15.56C2.87 14.27 1.1 13.4 1.1 12C1.1 10.6 2.87 9.73 3.41 8.44C3.94 7.15 3.3 5.28 4.29 4.29C5.28 3.3 7.15 3.94 8.44 3.41C9.73 2.87 10.6 1.1 12 1.1C13.4 1.1 14.27 2.87 15.56 3.41C16.85 3.94 18.72 3.3 19.71 4.29C20.7 5.28 20.06 7.15 20.59 8.44C21.13 9.73 22.9 10.6 22.9 12Z'

const ICON_HEART = 'M12 20.5s-8.5-5.2-8.5-11.1A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.5 2.8c0 5.9-8.5 11.1-8.5 11.1z'
const ICON_COMMENT = 'M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.5-4.6A8 8 0 1 1 20.5 11.5z'
const ICON_SHARE = 'M14 4l6.5 6.5L14 17v-4c-5 0-8 1.5-10 5 .8-5.5 4-9 10-9.5V4z'
const ICON_PEOPLE = 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1.5a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6'

// ── What goes on the card ──────────────────────────────────────────────────────────────────────

interface CardBase {
  displayName: string
  username: string
  verificationTier?: string | null
  avatarUrl?: string | null
}
export interface PostCardInput extends CardBase {
  kind: 'post'
  body: string | null
  createdAt: string
  /** A picture from the post (a video's poster frame counts). */
  photoUrl?: string | null
  mediaKind?: 'photo' | 'video' | null
}
export interface ProfileCardInput extends CardBase {
  kind: 'profile'
  bio: string | null
  /** A count, or a label that is already formatted ("12.8K"). */
  followers: number | string | null
}
export type ShareCardInput = PostCardInput | ProfileCardInput

/** Fetches a picture for the canvas. Returns null when it can't - the card is drawn without it. */
export type ImageLoader = (url: string, width: number) => Promise<CanvasImageSource | null>

/** Pictures come through our own /api/share-image so the canvas stays exportable (see that route). */
export const loadImageViaProxy: ImageLoader = async (url, width) => {
  try {
    const res = await fetch(`/api/share-image?url=${encodeURIComponent(url)}&w=${width}`, { credentials: 'same-origin' })
    if (!res.ok) return null
    const objectUrl = URL.createObjectURL(await res.blob())
    try {
      const img = new Image()
      img.src = objectUrl
      await img.decode()
      return img
    } finally {
      // The decoded image stays usable after the URL is released.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    }
  } catch {
    return null
  }
}

function loadDataUri(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

// ── Text helpers ───────────────────────────────────────────────────────────────────────────────

export function tidyText(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })
  } catch { return '' }
}

function formatCount(n: number): string {
  try { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) } catch { return String(n) }
}

/** Word-wraps `text` to `maxW` using the font currently set on `ctx`. Long words are broken. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (let word of para.split(' ')) {
      while (ctx.measureText(word).width > maxW) {
        let cut = word.length
        while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxW) cut--
        if (line) { out.push(line); line = '' }
        out.push(word.slice(0, cut))
        word = word.slice(cut)
      }
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width <= maxW) line = test
      else { if (line) out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

// Biggest size first. A text is set in the biggest size it fits in; if it fits in none, the
// smallest size is used and the text is cut with "…".
const TEXT_SIZES = [
  { size: 58, lineHeight: 74, maxLines: 3 },
  { size: 48, lineHeight: 61, maxLines: 4 },
  { size: 40, lineHeight: 50, maxLines: 5 },
]

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, lineCap: number) {
  const sizes = TEXT_SIZES.map(s => ({ ...s, maxLines: Math.min(s.maxLines, lineCap) }))
  for (const s of sizes) {
    ctx.font = font(400, s.size)
    const lines = wrap(ctx, text, maxW)
    if (lines.length <= s.maxLines) return { ...s, lines }
  }
  const s = sizes[sizes.length - 1]
  ctx.font = font(400, s.size)
  const lines = wrap(ctx, text, maxW).slice(0, s.maxLines)
  let last = lines[lines.length - 1].replace(/[\s,;:.\-–—]+$/, '')
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
  lines[lines.length - 1] = `${last.trimEnd()}…`
  return { ...s, lines }
}

// ── Drawing helpers ────────────────────────────────────────────────────────────────────────────

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function dims(src: CanvasImageSource): { w: number; h: number } {
  const s = src as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }
  return { w: s.naturalWidth || s.width || 1, h: s.naturalHeight || s.height || 1 }
}

/** Draws `img` filling the rounded box (like object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number, r: number) {
  const { w: iw, h: ih } = dims(img)
  const scale = Math.max(w / iw, h / ih)
  const sw = w / scale, sh = h / scale
  ctx.save()
  roundedRect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
  ctx.restore()
}

function strokeIcon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = MUTED
  ctx.lineWidth = 1.7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(path))
  ctx.restore()
}

function drawBadge(ctx: CanvasRenderingContext2D, tier: string, x: number, y: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.fillStyle = TIER_FILL[tier] ?? TIER_FILL.standard
  ctx.fill(new Path2D(SEAL_PATH))
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2.3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M7.3 12.3l3.4 3.4 6.1-6.9'))
  ctx.restore()
}

async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(font(700, 48)), document.fonts.load(font(400, 40))]),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ])
  } catch { /* the fallback fonts in FONT_STACK are fine */ }
}

// ── The card ───────────────────────────────────────────────────────────────────────────────────

export async function drawShareCard(
  input: ShareCardInput,
  opts: { loadImage?: ImageLoader; host?: string } = {},
): Promise<Blob> {
  const loadImage = opts.loadImage ?? loadImageViaProxy
  const host = opts.host ?? 'spup.live'

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  const [, avatar, photo, logo] = await Promise.all([
    ensureFonts(),
    input.avatarUrl ? loadImage(input.avatarUrl, 240) : Promise.resolve(null),
    input.kind === 'post' && input.photoUrl ? loadImage(input.photoUrl, 700) : Promise.resolve(null),
    loadDataUri(SPUP_LOGO_DATA_URI).catch(() => null),
  ])

  // Backdrop + white card
  ctx.fillStyle = '#EDEFF1'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const cx = 38, cy = 38, cw = 1124, ch = 554
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.14)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 22
  ctx.fillStyle = '#FFFFFF'
  roundedRect(ctx, cx, cy, cw, ch, 48)
  ctx.fill()
  ctx.restore()

  const left = cx + 56            // 94
  const right = cx + cw - 56      // 1106
  ctx.textBaseline = 'alphabetic'

  // Header: avatar, name (+ badge), handle line ... Spup mark
  const headerMid = cy + 40 + 62  // 140
  const avatarR = 58
  if (avatar) {
    drawCover(ctx, avatar, left, headerMid - avatarR, avatarR * 2, avatarR * 2, avatarR)
  } else {
    ctx.fillStyle = BRAND
    ctx.beginPath(); ctx.arc(left + avatarR, headerMid, avatarR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(700, 58)
    ctx.textAlign = 'center'
    ctx.fillText((input.displayName || input.username || '?').trim().charAt(0).toUpperCase(), left + avatarR, headerMid + 20)
    ctx.textAlign = 'left'
  }

  const textX = left + avatarR * 2 + 28   // 238
  const tier = input.verificationTier && input.verificationTier !== 'none' ? input.verificationTier : null
  // Room the Spup mark needs on the right (logo + gap + the word), plus breathing space.
  ctx.font = font(700, 50)
  const markW = SPUP_LOGO_SIZE.width * 0.46 + 12 + ctx.measureText('Spup').width + 36
  const nameMaxW = right - textX - markW - (tier ? 54 : 0)

  ctx.font = font(700, 48)
  ctx.fillStyle = INK
  const fullName = input.displayName || input.username
  let name = fullName
  if (ctx.measureText(name).width > nameMaxW) {
    while (name.length > 1 && ctx.measureText(`${name}…`).width > nameMaxW) name = name.slice(0, -1)
    name = `${name.trimEnd()}…`
  }
  ctx.fillText(name, textX, headerMid - 2)
  if (tier) drawBadge(ctx, tier, textX + ctx.measureText(name).width + 12, headerMid - 2 - 36, 42)

  ctx.font = font(400, 28)
  ctx.fillStyle = MUTED
  ctx.fillText(input.kind === 'post' ? `@${input.username} · shared via Spup` : `@${input.username}`, textX, headerMid + 40)

  // Spup mark, top right
  ctx.font = font(700, 50)
  const wordW = ctx.measureText('Spup').width
  ctx.fillStyle = BRAND
  ctx.fillText('Spup', right - wordW, headerMid + 17)
  if (logo) {
    const lh = SPUP_LOGO_SIZE.height * 0.46, lw = SPUP_LOGO_SIZE.width * 0.46
    ctx.drawImage(logo, right - wordW - 12 - lw, headerMid - lh / 2, lw, lh)
  }

  // Body: the post / the bio, and a photo when the post has one
  const bodyTop = cy + 40 + 124 + 10      // 212
  const dividerY = cy + ch - 30 - 78 - 2  // 482
  const bodyMid = (bodyTop + (dividerY - 6)) / 2
  const hasPhoto = !!photo
  const maxW = hasPhoto ? 646 : 1012

  let text: string
  if (input.kind === 'post') {
    text = tidyText(input.body) || (input.mediaKind === 'video' ? 'Shared a video' : input.mediaKind === 'photo' ? 'Shared a photo' : 'Shared a post')
  } else {
    text = tidyText(input.bio) || `Join ${input.displayName || input.username} on Spup`
  }
  // Next to a photo, or in any long text, leave air above and below the lines.
  const fit = fitText(ctx, text, maxW, hasPhoto ? 4 : 5)
  ctx.fillStyle = INK
  ctx.font = font(400, fit.size)
  const blockH = fit.lines.length * fit.lineHeight
  let ty = bodyMid - blockH / 2
  for (const line of fit.lines) {
    // alphabetic baseline sits ~78% of the way down a line box
    ctx.fillText(line, left, ty + fit.lineHeight * 0.74)
    ty += fit.lineHeight
  }
  if (photo) drawCover(ctx, photo, right - 330, bodyMid - 115, 330, 230, 28)

  // Divider + footer
  ctx.fillStyle = LINE
  ctx.fillRect(left, dividerY, right - left, 2)
  const footMid = dividerY + 2 + 39
  ctx.font = font(400, 30)
  ctx.fillStyle = MUTED
  ctx.textBaseline = 'middle'
  if (input.kind === 'post') {
    ctx.save()
    ctx.translate(left, footMid - 18); ctx.scale(36 / 24, 36 / 24)
    ctx.strokeStyle = MUTED; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.stroke(); ctx.stroke(new Path2D('M12 7v5l3 2'))
    ctx.restore()
    ctx.fillText(formatDate(input.createdAt), left + 50, footMid + 1)
    // The actions that live behind the link: share, comment, like (right to left)
    strokeIcon(ctx, ICON_SHARE, right - 40, footMid - 20, 40)
    strokeIcon(ctx, ICON_COMMENT, right - 40 - 84, footMid - 20, 40)
    strokeIcon(ctx, ICON_HEART, right - 40 - 168, footMid - 20, 40)
  } else {
    if (input.followers != null) {
      strokeIcon(ctx, ICON_PEOPLE, left, footMid - 18, 36)
      const label = typeof input.followers === 'number' ? formatCount(input.followers) : String(input.followers)
      ctx.fillText(`${label} follower${label === '1' ? '' : 's'}`, left + 50, footMid + 1)
    }
    ctx.font = font(700, 30)
    ctx.fillStyle = BRAND
    ctx.textAlign = 'right'
    ctx.fillText(`${host}/u/${input.username}`, right, footMid + 1)
    ctx.textAlign = 'left'
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('could not export the card'))), 'image/png')
  })
}
