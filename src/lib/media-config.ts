// src/lib/media-config.ts
//
// Where uploaded photos and videos live now: bunny.net storage, served through the
// pull zone at cdn.spup.live. Safe to import from both browser and server code.
//
// Old posts may still point at Cloudinary until the migration SQL has been run, so
// the helpers below recognise both.

/** Public base URL of the media CDN (no trailing slash). */
export const MEDIA_CDN_URL = (process.env.NEXT_PUBLIC_MEDIA_CDN_URL || 'https://cdn.spup.live').replace(/\/+$/, '')

/** True for a file served from our own media CDN. */
export function isCdnUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(MEDIA_CDN_URL + '/')
}

/** True for a file still served from Cloudinary (not migrated yet). */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  return !!url && url.includes('res.cloudinary.com')
}

/** Folder inside the storage zone that holds one account's files: para/<profileId>/<posts|profile>/ */
export function accountFolder(profileId: string, area: 'posts' | 'profile'): string {
  return `para/${profileId}/${area}`
}
