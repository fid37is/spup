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
