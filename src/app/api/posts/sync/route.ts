import { NextRequest, NextResponse } from 'next/server'
import { createPostAction } from '@/lib/actions'

/**
 * Used only by the offline post queue (see src/lib/offline-post-queue.ts
 * and public/sw.js's retryFailedPosts). A service worker can't invoke a
 * "use server" action directly, so this plain REST route exists purely as
 * a bridge - it uploads any attached media, then calls the exact same
 * createPostAction the normal composer uses, so validation, limits, and
 * counters behave identically either way.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const body = formData.get('body') as string | null
    const isSelling = formData.get('isSelling') === 'true'
    const files = formData.getAll('media').filter((f): f is File => f instanceof File)

    const media: Record<string, unknown>[] = []

    for (const file of files) {
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('type', file.type.startsWith('video') ? 'video' : 'image')

      const uploadRes = await fetch(new URL('/api/upload', request.url), {
        method: 'POST',
        body: uploadForm,
        headers: { cookie: request.headers.get('cookie') || '' },
      })
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok || !uploadData?.success) {
        return NextResponse.json({ error: uploadData?.error || 'Media upload failed while syncing' }, { status: 502 })
      }
      media.push(uploadData.media)
    }

    const result = await createPostAction({
      body: body?.trim() || undefined,
      is_selling: isSelling || undefined,
      media: media.length ? media : undefined,
    } as Parameters<typeof createPostAction>[0])

    if ('error' in result) {
      // A word-rule block is a permanent "no": tell the queue so it drops the
      // post instead of re-sending it (and re-flagging it) on every app open.
      //
      // Answered with 200 and NO `error` field on purpose: app builds already in
      // people's hands treat any error as "retry later" and keep the post queued
      // forever, but treat a clean 200 as "done" and drop it. Updated builds read
      // `code` and drop it as rejected. So this stops the retry loop on every
      // client without waiting for each device to load the new JavaScript.
      const blocked = (result as { code?: string }).code === 'content_blocked'
      if (blocked) {
        return NextResponse.json({ success: false, code: 'content_blocked', message: result.error })
      }
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, postId: result.postId })
  } catch (err) {
    console.error('Offline post sync failed:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}