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
