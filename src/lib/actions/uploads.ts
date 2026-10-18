'use server'

/**
 * uploads.ts - clean-up for files that were uploaded but never became part of a post.
 *
 * Photos and videos upload the moment they are picked, while the person is still
 * typing. If they remove one before posting (or throw away a saved draft), the file
 * would otherwise sit on bunny.net forever, so the composer calls this to remove it.
 */

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireUploader } from '@/lib/storage/require-uploader'
import { deleteFromBunny, storagePathFromUrl, publicUrl } from '@/lib/storage/bunny'
import { findReferencedUrls } from '@/lib/storage/media-references'

export async function discardUploadsAction(items: { url?: string | null; thumbnail_url?: string | null }[]) {
  try {
    const who = await requireUploader()
    if ('response' in who) return { deleted: 0 }

    // Only files inside this person's own post folder, whatever the browser sends.
    const ownFolder = `para/${who.profile.id}/posts/`
    const paths = [...new Set(
      (Array.isArray(items) ? items.slice(0, 20) : [])
        .flatMap(i => [i?.url, i?.thumbnail_url])
        .map(u => storagePathFromUrl(typeof u === 'string' ? u : null))
        .filter((x): x is string => !!x && x.startsWith(ownFolder))
    )]
    if (paths.length === 0) return { deleted: 0 }

    // Never remove a file something still uses (a post, a chat message).
    const inUse = await findReferencedUrls(createAdminClient(), paths.map(publicUrl))
    const doomed = paths.filter(p => !inUse.has(publicUrl(p)))
    if (doomed.length) after(async () => { await Promise.allSettled(doomed.map(p => deleteFromBunny(p))) })
    return { deleted: doomed.length }
  } catch (err) {
    console.error('discardUploadsAction failed:', err)
    return { deleted: 0 }
  }
}
