// src/app/api/upload/bunny/route.ts
//
// Browser uploads (post photos and videos, chat attachments, video posters). The file
// is sent as the raw request body, so the browser can report real upload progress
// (see src/lib/upload-media.ts), and this route writes it to bunny.net storage.
//
// Why not straight from the phone to Bunny, as it went to Cloudinary? Bunny Storage
// only accepts requests carrying the zone password, which must never reach a browser.
// Files are small (10MB photos, 25MB videos), so passing them through here is cheap.
//
// Query:  kind = image | video | avatar | banner | poster
//         w, h, d = width, height, duration (seconds) - videos only, read by the browser
// Header: Content-Type = the file's type

import { NextRequest, NextResponse } from 'next/server'
import { requireUploader } from '@/lib/storage/require-uploader'
import { storeMedia, MAX_POSTER_BYTES, type StoreKind } from '@/lib/storage/store-media'
import { StorageError } from '@/lib/storage/bunny'
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_IMAGE_LABEL, MAX_VIDEO_LABEL } from '@/lib/media-limits'

const KINDS: StoreKind[] = ['image', 'video', 'avatar', 'banner', 'poster']

export async function POST(request: NextRequest) {
  try {
    const who = await requireUploader()
    if ('response' in who) return who.response

    const params = new URL(request.url).searchParams
    const kind = params.get('kind') as StoreKind | null
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 })
    }

    const mime = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()

    // Refuse an oversized upload before reading it.
    const limit = kind === 'poster' ? MAX_POSTER_BYTES : kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    const declared = Number(request.headers.get('content-length') || 0)
    if (declared > limit) {
      const label = kind === 'poster' ? '2MB' : kind === 'video' ? MAX_VIDEO_LABEL : MAX_IMAGE_LABEL
      return NextResponse.json({ error: `File too large. Maximum size is ${label}.` }, { status: 413 })
    }

    const bytes = new Uint8Array(await request.arrayBuffer())
    const media = await storeMedia({
      profileId: who.profile.id, kind, mime, bytes,
      hint: { width: params.get('w'), height: params.get('h'), duration: params.get('d') },
    })
    return NextResponse.json({ success: true, media }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
