// src/app/api/upload/sign/route.ts
//
// Step 1 of a direct upload. The phone asks here for permission to send ONE file, and gets
// back the address to send it to. The file itself then goes phone -> Bunny Edge Script ->
// Bunny storage and never passes through this server, which is what lets videos bigger
// than Vercel's 4.5MB request limit through.
//
// Body (JSON): { kind: 'image' | 'video' | 'poster', mime, size, w?, h?, d? }
// Answer:      { direct: true, uploadUrl, media }   - same `media` shape /api/upload/bunny returns
//          or  { direct: false }                    - direct uploads are not set up; use /api/upload/bunny
//
// Needs two env vars on Vercel: UPLOAD_EDGE_URL and UPLOAD_SIGNING_SECRET (see edge/SETUP.md).
// Without them this answers direct:false and everything keeps working the old way.

import { NextRequest, NextResponse } from 'next/server'
import { requireUploader } from '@/lib/storage/require-uploader'
import { EXT_BY_MIME, MAX_POSTER_BYTES, MAX_VIDEO_SECONDS } from '@/lib/storage/store-media'
import { signUploadToken } from '@/lib/storage/upload-token'
import { accountFolder } from '@/lib/media-config'
import { publicUrl } from '@/lib/storage/bunny'
import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
  MAX_IMAGE_LABEL, MAX_VIDEO_LABEL,
} from '@/lib/media-limits'

const TOKEN_LIFETIME_SECONDS = 30 * 60

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  try {
    const who = await requireUploader()
    if ('response' in who) return who.response

    const edge = (process.env.UPLOAD_EDGE_URL || '').trim().replace(/\/+$/, '')
    const secret = (process.env.UPLOAD_SIGNING_SECRET || '').trim()
    if (!edge || !secret) {
      return NextResponse.json({ direct: false }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const b = await request.json().catch(() => null) as
      { kind?: string; mime?: string; size?: number; w?: number; h?: number; d?: number } | null
    if (!b) return bad('Invalid request')

    const kind = b.kind
    if (kind !== 'image' && kind !== 'video' && kind !== 'poster') return bad('Invalid upload type')
    const mime = String(b.mime || '').split(';')[0].trim().toLowerCase()
    const size = typeof b.size === 'number' ? b.size : 0

    const isVideo = kind === 'video'
    const allowed = isVideo ? ALLOWED_VIDEO_TYPES : kind === 'poster' ? ['image/jpeg'] : ALLOWED_IMAGE_TYPES
    if (!allowed.includes(mime)) {
      return bad(`File type ${mime || 'unknown'} not allowed. Use JPEG, PNG, GIF, WebP, MP4, MOV or WebM.`)
    }
    const max = kind === 'poster' ? MAX_POSTER_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (!Number.isFinite(size) || size <= 0) return bad('That file is empty.')
    if (size > max) {
      const label = kind === 'poster' ? '2MB' : isVideo ? MAX_VIDEO_LABEL : MAX_IMAGE_LABEL
      return bad(`File too large. Maximum size is ${label}.`, 413)
    }

    const path = `${accountFolder(who.profile.id, 'posts')}/${crypto.randomUUID().replace(/-/g, '')}.${EXT_BY_MIME[mime]}`
    const token = signUploadToken(
      { p: path, m: mime, x: max, e: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS, u: who.profile.id },
      secret,
    )

    return NextResponse.json({
      direct: true,
      uploadUrl: `${edge}/?t=${encodeURIComponent(token)}`,
      media: {
        url: publicUrl(path),
        thumbnail_url: null,
        media_type: isVideo ? 'video' : 'image',
        width: int(b.w, 1, 20000),
        height: int(b.h, 1, 20000),
        duration_secs: isVideo ? int(b.d, 0, MAX_VIDEO_SECONDS + 5) : null,
        size_bytes: size,
        cloudinary_id: path,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Upload sign error:', error)
    return bad('Upload failed. Please try again.', 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
