// src/lib/storage/media-references.ts
//
// Which of these CDN addresses is something on Spup still using? Shared by the
// "discard an upload" action and the media sweep, so both agree on what is safe
// to delete. A file counts as in use when it belongs to:
//   - a post that is live, or one an admin removed (kept as evidence), or
//   - a chat message that has not been deleted.
// A post its own author deleted does NOT count - its files are meant to go.
//
// Throws on any database error: callers must treat that as "unknown, delete nothing".

import type { SupabaseClient } from '@supabase/supabase-js'

const CHUNK = 100

export async function findReferencedUrls(admin: SupabaseClient, urls: string[]): Promise<Set<string>> {
  const referenced = new Set<string>()

  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK)

    const [byUrl, byThumb, msgUrl, msgThumb] = await Promise.all([
      admin.from('post_media').select('url, thumbnail_url, post_id').in('url', chunk),
      admin.from('post_media').select('url, thumbnail_url, post_id').in('thumbnail_url', chunk),
      admin.from('messages').select('media_url, media_thumbnail_url').in('media_url', chunk),
      admin.from('messages').select('media_url, media_thumbnail_url').in('media_thumbnail_url', chunk),
    ])
    for (const r of [byUrl, byThumb, msgUrl, msgThumb]) if (r.error) throw new Error(`reference lookup failed: ${r.error.message}`)

    for (const m of [...(msgUrl.data ?? []), ...(msgThumb.data ?? [])]) {
      if (m.media_url) referenced.add(m.media_url)
      if (m.media_thumbnail_url) referenced.add(m.media_thumbnail_url)
    }

    const mediaRows = [...(byUrl.data ?? []), ...(byThumb.data ?? [])]
    if (mediaRows.length === 0) continue

    const postIds = [...new Set(mediaRows.map(r => r.post_id as string))]
    const { data: posts, error: postsError } = await admin.from('posts').select('id, deleted_at').in('id', postIds)
    if (postsError) throw new Error(`post lookup failed: ${postsError.message}`)

    const deletedIds = (posts ?? []).filter(p => p.deleted_at).map(p => p.id as string)
    const adminRemoved = new Set<string>()
    if (deletedIds.length) {
      const { data: audit, error: auditError } = await admin
        .from('admin_audit_log').select('target_id').eq('action', 'delete_post').in('target_id', deletedIds)
      if (auditError) throw new Error(`audit lookup failed: ${auditError.message}`)
      for (const a of audit ?? []) adminRemoved.add(a.target_id as string)
    }

    const keep = new Set((posts ?? []).filter(p => !p.deleted_at || adminRemoved.has(p.id as string)).map(p => p.id as string))
    for (const r of mediaRows) {
      if (!keep.has(r.post_id as string)) continue
      if (r.url) referenced.add(r.url)
      if (r.thumbnail_url) referenced.add(r.thumbnail_url)
    }
  }
  return referenced
}
