import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processLinks } from '@/lib/link-safety/service'

// One-off catch-up for posts and replies written BEFORE link safety existed: their links are
// checked and rewritten to short links exactly like new ones (a link that turns out unsafe becomes a
// blocked short link, a link that can't be verified becomes plain text). Nobody gets a strike for old
// content. Each call handles up to 15 posts; call it repeatedly until `remaining` is 0:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://spup.live/api/cron/link-backfill
// Requires CRON_SECRET in env. Safe to repeat - a post is only ever processed once.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH = 15

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  try {
    const { data: posts, error } = await admin
      .from('posts')
      .select('id, user_id, body, post_type')
      .is('links_scanned_at', null)
      .is('deleted_at', null)
      .or('body.ilike.%http://%,body.ilike.%https://%,body.ilike.%www.%')
      .order('created_at', { ascending: false })
      .limit(BATCH)
    if (error) throw error

    let rewritten = 0
    for (const post of posts ?? []) {
      const kind = post.post_type === 'reply' ? 'reply' : post.post_type === 'quote' ? 'quote' : 'post'
      const out = await processLinks(post.body ?? '', { userId: post.user_id, context: kind, silent: true }, { keepBlocked: true })
      const update: Record<string, unknown> = { links_scanned_at: new Date().toISOString() }
      if (out.text !== post.body) { update.body = out.text; rewritten++ }
      const { error: upError } = await admin.from('posts').update(update).eq('id', post.id)
      if (upError) console.error('link-backfill update failed:', post.id, upError.message)
    }

    const { count } = await admin
      .from('posts').select('id', { count: 'exact', head: true })
      .is('links_scanned_at', null).is('deleted_at', null)
      .or('body.ilike.%http://%,body.ilike.%https://%,body.ilike.%www.%')
    return NextResponse.json({ processed: posts?.length ?? 0, rewritten, remaining: count ?? 0 })
  } catch (e) {
    console.error('link-backfill failed:', e)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
