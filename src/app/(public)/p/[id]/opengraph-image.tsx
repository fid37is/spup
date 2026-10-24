// src/app/(public)/p/[id]/opengraph-image.tsx
//
// The picture people see when a post link is shared outside Spup (WhatsApp, X, Telegram,
// Facebook, iMessage, LinkedIn, Slack ...): a card with the author, their avatar and the post.
// Next serves it at /p/<id>/opengraph-image and the post page points its og:image / twitter:image
// at it (see generateMetadata in ./page.tsx). Tapping the preview opens /p/<id>.
//
// It only ever draws what a logged-out visitor can already read on the public page: getPublicPost
// already refuses private, deleted and suspended accounts.
//
// Drawing is attempted in three steps, so a bad image can't leave a shared link with no preview:
//   1. everything (avatar, photo, emoji),
//   2. without any WebP image (the renderer may not read them) and without emoji,
//   3. text only.
// If even that fails, the visitor is sent to the default Spup preview.

import { ImageResponse } from 'next/og'
import { getPublicPost } from '@/lib/public-data'
import { PostShareCard, CARD_SIZE, type ShareCardData } from '@/lib/og/post-card'
import { fetchImage, type FetchedImage } from '@/lib/og/fetch-image'
import { loadOgFonts } from '@/lib/og/fonts'

export const alt = 'A post on Spup'
export const size = CARD_SIZE
export const contentType = 'image/png'
// The post text can be edited, so don't keep the image forever; an hour is plenty for a preview.
export const revalidate = 3600

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

// Emoji have no glyphs in the embedded font. The renderer can draw them from Twemoji, but that
// is a network fetch, so step 1 allows it and the later steps take the emoji out instead.
const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu

async function render(data: ShareCardData, emoji: boolean): Promise<ArrayBuffer> {
  const res = new ImageResponse(PostShareCard(data), {
    ...CARD_SIZE,
    fonts: loadOgFonts(),
    emoji: emoji ? 'twemoji' : undefined,
  })
  // ImageResponse draws lazily: reading the body is what surfaces a failure.
  return res.arrayBuffer()
}

const PNG_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  // Whatever goes wrong, a shared link gets the default Spup preview rather than an error page.
  try {
    return await drawPostCard((await params).id)
  } catch (err) {
    console.error('[share-card] unexpected failure', err)
    return Response.redirect(`${BASE_URL}/og/default.png`, 302)
  }
}

async function drawPostCard(id: string): Promise<Response> {
  const post = await getPublicPost(id)
  if (!post) return Response.redirect(`${BASE_URL}/og/default.png`, 302)

  const photo = post.media.find(m => m.media_type !== 'video')
  const [avatar, photoImg]: [FetchedImage | null, FetchedImage | null] = await Promise.all([
    fetchImage(post.author.avatar_url, 240),
    fetchImage(photo?.url ?? null, 700),
  ])

  const base: ShareCardData = {
    displayName: post.author.display_name,
    username: post.author.username,
    verificationTier: post.author.verification_tier,
    body: post.body,
    createdAt: post.created_at,
    mediaKind: post.media.length === 0 ? null : post.media.every(m => m.media_type === 'video') ? 'video' : 'photo',
    avatarSrc: avatar?.dataUri ?? null,
    photoSrc: photoImg?.dataUri ?? null,
  }

  const steps: Array<[ShareCardData, boolean]> = [
    [base, true],
    [
      {
        ...base,
        body: base.body ? base.body.replace(EMOJI_RE, '').replace(/ {2,}/g, ' ').trim() : base.body,
        avatarSrc: avatar && avatar.type !== 'webp' ? base.avatarSrc : null,
        photoSrc: photoImg && photoImg.type !== 'webp' ? base.photoSrc : null,
      },
      false,
    ],
    [
      { ...base, body: base.body ? base.body.replace(EMOJI_RE, '').trim() : base.body, avatarSrc: null, photoSrc: null },
      false,
    ],
  ]

  for (const [data, emoji] of steps) {
    try {
      return new Response(await render(data, emoji), { headers: PNG_HEADERS })
    } catch (err) {
      console.error('[share-card] render step failed', { id, emoji, err })
    }
  }
  return Response.redirect(`${BASE_URL}/og/default.png`, 302)
}
