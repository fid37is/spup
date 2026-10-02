// src/lib/utils/cloudinary.ts
//
// Feed images were being delivered exactly as stored: up to 1200px wide, in
// whatever format the phone produced. On a slow connection that is a lot of
// bytes for a photo shown ~400px wide. Cloudinary can resize and re-encode at
// delivery time just by adding a transformation to the URL:
//   f_auto  - WebP/AVIF where the browser supports it (much smaller than JPEG)
//   q_auto  - picks a quality level that looks the same at a smaller size
//   w_N,c_limit - never wider than N pixels, never upscaled
//
// If a transformed URL ever fails to load (e.g. the Cloudinary account has
// "strict transformations" switched on), fallbackToOriginal swaps the image
// back to the untouched URL, so a settings problem can't blank out the feed.
//
// URLs that aren't Cloudinary image URLs (Google avatars, local previews,
// videos, already-transformed URLs) come back unchanged.

import type { SyntheticEvent } from 'react'

export function cloudinaryImage(url: string | null | undefined, width: number): string {
  if (!url) return ''
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url
  if (/\/image\/upload\/[^/]*(f_auto|q_auto)/.test(url)) return url
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${width},c_limit/`)
}

/** onError handler: retry once with the original (untransformed) URL. */
export function fallbackToOriginal(original: string) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.dataset.fellBack === '1') return
    img.dataset.fellBack = '1'
    img.src = original
  }
}

/**
 * The still frame shown in a <video> before it has loaded (its `poster`).
 * Uses the stored thumbnail when there is one, otherwise asks Cloudinary for
 * the video's first frame. Without a poster, Android's WebView paints its own
 * default placeholder (a grey box with a play button) stretched over the
 * whole video - desktop browsers just show the first frame, which is why it
 * only looked broken in the app.
 */
export function videoPoster(videoUrl: string, thumbnailUrl?: string | null, width = 720): string | undefined {
  if (thumbnailUrl) return thumbnailUrl
  if (!videoUrl.includes('res.cloudinary.com') || !videoUrl.includes('/video/upload/')) return undefined
  return videoUrl
    .replace('/video/upload/', `/video/upload/so_0,f_jpg,q_auto,w_${width},c_limit/`)
    .replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg')
}
