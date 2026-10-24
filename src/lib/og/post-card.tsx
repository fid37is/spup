// src/lib/og/post-card.tsx
//
// The "share card": what WhatsApp / X / Telegram / iMessage / Facebook show when a post link is
// pasted into them - a card with the author's avatar, the post, and the Spup mark. Tapping the
// preview opens the link, i.e. the post on Spup.
//
// This file is only the picture. It is drawn by next/og (satori), which understands a SMALL part
// of CSS: flexbox only (every <div> with more than one child must be display:flex), no CSS
// variables, no grid, inline SVG for icons. Keep it that way. It imports nothing from Next so it
// can also be rendered in a plain browser to preview it.

import type { CSSProperties, ReactElement } from 'react'
import { SPUP_LOGO_DATA_URI, SPUP_LOGO_SIZE } from './logo-data'

export const CARD_SIZE = { width: 1200, height: 630 }

const BRAND = '#1A9E5F'
const INK = '#17181C'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'
const FONT = 'Liberation Sans'

export interface ShareCardData {
  displayName: string
  username: string
  /** BVN-verified / creator / pioneer / organisation / spup - see components/ui/verified-badge.tsx */
  verificationTier: string | null
  body: string | null
  createdAt: string
  /** What to say when the post has no text (photo/video only). */
  mediaKind: 'photo' | 'video' | null
  /** Already fetched and turned into data URIs (see fetch-image.ts); null = leave out. */
  avatarSrc: string | null
  photoSrc: string | null
}

// Badge colours, as in components/ui/verified-badge.tsx (satori has no CSS variables).
const TIER_FILL: Record<string, string> = {
  standard: '#22C55E', pioneer: '#D4A017', creator: BRAND, organisation: '#D4A017', spup: '#D4A017',
}
const SEAL_PATH =
  'M22.9 12C22.9 13.4 21.13 14.27 20.59 15.56C20.06 16.85 20.7 18.72 19.71 19.71C18.72 20.7 16.85 20.06 15.56 20.59C14.27 21.13 13.4 22.9 12 22.9C10.6 22.9 9.73 21.13 8.44 20.59C7.15 20.06 5.28 20.7 4.29 19.71C3.3 18.72 3.94 16.85 3.41 15.56C2.87 14.27 1.1 13.4 1.1 12C1.1 10.6 2.87 9.73 3.41 8.44C3.94 7.15 3.3 5.28 4.29 4.29C5.28 3.3 7.15 3.94 8.44 3.41C9.73 2.87 10.6 1.1 12 1.1C13.4 1.1 14.27 2.87 15.56 3.41C16.85 3.94 18.72 3.3 19.71 4.29C20.7 5.28 20.06 7.15 20.59 8.44C21.13 9.73 22.9 10.6 22.9 12Z'

/** The post text, tidied for a picture: no stray blank lines. Length is handled by fitText(). */
export function cardText(body: string | null, mediaKind: ShareCardData['mediaKind']): string {
  const t = (body ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
  if (!t) return mediaKind === 'video' ? 'Shared a video' : mediaKind === 'photo' ? 'Shared a photo' : 'Shared a post'
  return t
}

// The text area is 1012px wide (646px next to a photo). Sizes run big -> small; a post is set in
// the biggest one it fits in, and if it fits in none it is shortened with "…" at the smallest.
// Line counts are ESTIMATED from an average glyph width (0.5em, with a safety margin), and the
// box is exactly `lines` tall, so a wrong guess at worst hides a last half-empty line - it never
// draws a line cut in half against the divider.
const TEXT_SIZES = [
  { fontSize: 58, lineHeight: 74, lines: 3 },
  { fontSize: 48, lineHeight: 61, lines: 4 },
  { fontSize: 40, lineHeight: 50, lines: 5 },
]

function estimateLines(text: string, fontSize: number, width: number): number {
  const perLine = Math.max(8, Math.floor((width / (fontSize * 0.5)) * 0.9))
  return text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0)
}

export function fitText(text: string, hasPhoto: boolean) {
  const width = hasPhoto ? 646 : 1012
  for (const size of TEXT_SIZES) {
    const used = estimateLines(text, size.fontSize, width)
    if (used <= size.lines) return { text, ...size, used }
  }
  const smallest = TEXT_SIZES[TEXT_SIZES.length - 1]
  let t = text
  while (t.length > 12 && estimateLines(t + '…', smallest.fontSize, width) > smallest.lines) {
    t = t.slice(0, Math.max(12, t.length - Math.ceil(t.length * 0.08)))
  }
  t = t.replace(/\s+\S*$/, '').replace(/[\s,;:.\-–—]+$/, '')   // end on a whole word
  return { text: t + '…', ...smallest, used: smallest.lines }
}

/** Date, not "2h ago": a preview image is cached by the platforms for days, so a relative time would be wrong. */
export function cardDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })
  } catch { return '' }
}

function Icon({ children, size = 40 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export function PostShareCard(d: ShareCardData): ReactElement {
  const hasPhoto = !!d.photoSrc
  const { text, fontSize, lineHeight, lines, used } = fitText(cardText(d.body, d.mediaKind), hasPhoto)
  const initial = (d.displayName || d.username || '?').trim().charAt(0).toUpperCase()
  const tierFill = d.verificationTier ? TIER_FILL[d.verificationTier] : undefined

  // satori understands lineClamp (ellipsis on the last line); a browser preview ignores it.
  const lineClamp = { lineClamp: lines } as CSSProperties

  return (
    <div style={{ width: CARD_SIZE.width, height: CARD_SIZE.height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDEFF1', fontFamily: FONT }}>
      <div style={{
        width: 1124, height: 554, display: 'flex', flexDirection: 'column',
        background: '#FFFFFF', borderRadius: 48, padding: '40px 56px 30px',
        boxShadow: '0 22px 50px rgba(0,0,0,0.14)',
      }}>
        {/* Header: avatar + name on the left, the Spup mark on the right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 124 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {d.avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarSrc} width={116} height={116} alt="" style={{ width: 116, height: 116, borderRadius: 58, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 116, height: 116, borderRadius: 58, background: BRAND, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 58, fontWeight: 700 }}>
                {initial}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 700, color: INK, maxWidth: 560, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.displayName}
                </div>
                {tierFill && (
                  <svg width={42} height={42} viewBox="0 0 24 24" style={{ marginLeft: 12 }}>
                    <path d={SEAL_PATH} fill={tierFill} />
                    <path d="M7.3 12.3l3.4 3.4 6.1-6.9" fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ display: 'block', fontSize: 28, color: MUTED, marginTop: 4 }}>
                {`@${d.username} · shared via Spup`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SPUP_LOGO_DATA_URI} width={SPUP_LOGO_SIZE.width * 0.46} height={SPUP_LOGO_SIZE.height * 0.46} alt="" />
            <div style={{ fontSize: 50, fontWeight: 700, color: BRAND, marginLeft: 12 }}>Spup</div>
          </div>
        </div>

        {/* The post */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', flex: 1, height: Math.min(lines, used) * lineHeight, overflow: 'hidden', paddingRight: hasPhoto ? 36 : 0 }}>
            <div style={{ display: 'block', width: '100%', fontSize, lineHeight: `${lineHeight}px`, color: INK, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis', ...lineClamp }}>
              {text}
            </div>
          </div>
          {hasPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.photoSrc!} width={330} height={250} alt="" style={{ width: 330, height: 250, borderRadius: 28, objectFit: 'cover' }} />
          )}
        </div>

        <div style={{ display: 'flex', height: 2, background: LINE }} />

        {/* Footer: when, and the actions that live behind the link */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 78 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Icon size={36}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
            <div style={{ fontSize: 30, color: MUTED, marginLeft: 14 }}>{cardDate(d.createdAt)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Icon><path d="M12 20.5s-8.5-5.2-8.5-11.1A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.5 2.8c0 5.9-8.5 11.1-8.5 11.1z" /></Icon>
            <div style={{ display: 'flex', marginLeft: 44 }}>
              <Icon><path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.5-4.6A8 8 0 1 1 20.5 11.5z" /></Icon>
            </div>
            <div style={{ display: 'flex', marginLeft: 44 }}>
              <Icon><path d="M14 4l6.5 6.5L14 17v-4c-5 0-8 1.5-10 5 .8-5.5 4-9 10-9.5V4z" /></Icon>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
