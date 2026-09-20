import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v2 as cloudinary } from 'cloudinary'
import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_IMAGE_LABEL, MAX_VIDEO_LABEL,
} from '@/lib/media-limits'

/**
 * Direct-to-Cloudinary uploads (see src/lib/upload-media.ts).
 *
 * The phone sends the file straight to Cloudinary instead of relaying it
 * through this server, so it crosses the (slow) network once, not twice. This
 * route never sees the file - it only checks who is asking and returns a
 * short-lived *signature* for one specific upload. Because the folder,
 * transformation and allowed formats are part of what gets signed, the client
 * can't change them: uploads land in the caller's own folder, are resized the
 * same way /api/upload resizes them, and only accept the allowed file formats.
 *
 * What a signature can NOT do is cap file size. The size check below trusts
 * what the client declares, so also set the max image/video file size on the
 * Cloudinary account (Settings > Upload) as the hard limit.
 */

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const KINDS = ['image', 'video', 'avatar', 'banner'] as const
type Kind = (typeof KINDS)[number]

// Same intent as the options /api/upload applies through the SDK.
const TRANSFORMATION: Record<Kind, string> = {
  image: 'c_limit,w_1200/fl_progressive,q_auto',   // never upscale, max 1200px wide
  video: 'du_180/q_70,vc_h264',                    // max 3 minutes, h264
  avatar: 'c_fill,g_face,h_400,w_400/q_80',
  banner: 'c_fill,h_500,w_1500/q_80',
}

const IMAGE_FORMATS = 'jpg,png,gif,webp'
const VIDEO_FORMATS = 'mp4,webm,mov,avi'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id, status').eq('auth_id', user.id).single()
    if (!profile || profile.status === 'banned' || profile.status === 'suspended') {
      return NextResponse.json({ error: 'Account not eligible for uploads' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as { type?: string; size?: number; mime?: string } | null
    const kind = body?.type as Kind | undefined
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 })
    }
    if (typeof body?.size !== 'number' || typeof body?.mime !== 'string') {
      return NextResponse.json({ error: 'File size and type required' }, { status: 400 })
    }

    const isVideo = kind === 'video'
    const allowedMimes = isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES
    if (!allowedMimes.includes(body.mime)) {
      return NextResponse.json({
        error: `File type ${body.mime || 'unknown'} not allowed. Use JPEG, PNG, GIF, WebP, MP4, MOV or WebM.`,
      }, { status: 400 })
    }
    if (body.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
      return NextResponse.json({
        error: `File too large. Maximum size is ${isVideo ? MAX_VIDEO_LABEL : MAX_IMAGE_LABEL}.`,
      }, { status: 400 })
    }

    const isProfile = kind === 'avatar' || kind === 'banner'
    // Everything in here is signed: the client must send it back unchanged.
    const params: Record<string, string | number> = {
      timestamp: Math.round(Date.now() / 1000),
      folder: `para/${profile.id}/${isProfile ? 'profile' : 'posts'}`,
      transformation: TRANSFORMATION[kind],
      allowed_formats: isVideo ? VIDEO_FORMATS : IMAGE_FORMATS,
    }
    if (isProfile) params.public_id = `${kind}_${Date.now()}`

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET as string)

    return NextResponse.json(
      {
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        resource_type: isVideo ? 'video' : 'image',
        fields: { ...params, signature },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Upload signature error:', error)
    return NextResponse.json({ error: 'Could not start upload. Please try again.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
