// src/app/api/upload/route.ts
//
// Form-based upload (multipart). Used by the profile picture / banner uploader,
// onboarding, wallet order proofs and the offline-post sync. Stores the file in
// bunny.net storage and answers in the same shape as before, so none of those callers
// had to change. (Post and chat uploads from the composer use /api/upload/bunny.)

import { NextRequest, NextResponse } from 'next/server'
import { requireUploader } from '@/lib/storage/require-uploader'
import { storeMedia, type StoreKind } from '@/lib/storage/store-media'
import { StorageError } from '@/lib/storage/bunny'
import { ALLOWED_VIDEO_TYPES } from '@/lib/media-limits'

export async function POST(request: NextRequest) {
  try {
    const who = await requireUploader()
    if ('response' in who) return who.response

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mediaType = formData.get('type') as string | null  // 'image' | 'video' | 'avatar' | 'banner'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!mediaType) return NextResponse.json({ error: 'Media type required' }, { status: 400 })

    const kind: StoreKind = mediaType === 'avatar' || mediaType === 'banner'
      ? mediaType
      : ALLOWED_VIDEO_TYPES.includes(file.type) ? 'video' : 'image'

    const media = await storeMedia({
      profileId: who.profile.id, kind, mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      hint: { width: formData.get('width'), height: formData.get('height'), duration: formData.get('duration') },
    })

    // post_media DB insert happens in createPostAction once the post row exists.
    return NextResponse.json({ success: true, media })
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

// Disallow GET - media endpoint is write-only
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
