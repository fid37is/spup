// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/avi', 'video/webm']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024   // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024  // 100MB

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ───────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Profile check ────────────────────────────────────────────────────────
    // Use maybeSingle() so a missing row returns null instead of throwing.
    // Allow 'pending_verification' and 'active' — both are valid during onboarding.
    // Only block banned / suspended accounts.
    const { data: profile } = await supabase
      .from('users')
      .select('id, status')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    if (profile.status === 'banned' || profile.status === 'suspended') {
      return NextResponse.json({ error: 'Account not eligible for uploads' }, { status: 403 })
    }

    // ── Parse form data ──────────────────────────────────────────────────────
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mediaType = formData.get('type') as string | null  // 'image' | 'video' | 'avatar' | 'banner'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!mediaType) return NextResponse.json({ error: 'Media type required' }, { status: 400 })

    const mimeType = file.type
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType)

    if (!isImage && !isVideo) {
      return NextResponse.json({
        error: `File type ${mimeType} not allowed. Use JPEG, PNG, GIF, WebP, or MP4.`
      }, { status: 400 })
    }

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
      const limitLabel = isVideo ? '100MB' : '10MB'
      return NextResponse.json({ error: `File too large. Maximum size is ${limitLabel}.` }, { status: 400 })
    }

    // ── Convert to buffer ────────────────────────────────────────────────────
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const isAvatar = mediaType === 'avatar'
    const isBanner = mediaType === 'banner'

    const uploadOptions: Record<string, unknown> = {
      folder: `spup/${profile.id}/${isAvatar || isBanner ? 'profile' : 'posts'}`,
      resource_type: isVideo ? 'video' : 'image',
      quality: isVideo ? 70 : 85,
      fetch_format: 'auto',
      flags: 'progressive',
    }

    if (isAvatar) {
      Object.assign(uploadOptions, {
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 80 },
        ],
        public_id: `avatar_${Date.now()}`,
      })
    } else if (isBanner) {
      Object.assign(uploadOptions, {
        transformation: [
          { width: 1500, height: 500, crop: 'fill' },
          { quality: 80 },
        ],
        public_id: `banner_${Date.now()}`,
      })
    } else if (isImage) {
      Object.assign(uploadOptions, {
        transformation: [
          { width: 1200, crop: 'limit' },
          { quality: 'auto' },
        ],
      })
    } else if (isVideo) {
      Object.assign(uploadOptions, {
        transformation: [
          { duration: 180 },
          { quality: 'auto' },
          { video_codec: 'h264' },
        ],
        eager: [
          { format: 'jpg', transformation: [{ width: 800, height: 450, crop: 'fill' }, { quality: 80 }] }
        ],
        eager_async: true,
      })
    }

    // ── Upload to Cloudinary ─────────────────────────────────────────────────
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error)
        else resolve(result as Record<string, unknown>)
      }).end(buffer)
    })

    // ── For avatar/banner uploads during onboarding, skip the post_media row ─
    // post_media requires a post_id foreign key context; avatars don't need it.
    if (isAvatar || isBanner) {
      return NextResponse.json({
        success: true,
        media: {
          url: result.secure_url,
          width: result.width,
          height: result.height,
        },
        cloudinaryId: result.public_id,
      })
    }

    // ── Insert post media record ─────────────────────────────────────────────
    const { data: mediaRecord, error: dbError } = await supabase
      .from('post_media')
      .insert({
        post_id: null,
        media_type: isVideo ? 'video' : 'image',
        url: result.secure_url as string,
        thumbnail_url: isVideo ? ((result.eager as any)?.[0]?.secure_url || null) : null,
        width: result.width as number,
        height: result.height as number,
        duration_secs: isVideo ? Math.round(result.duration as number) : null,
        size_bytes: file.size,
        position: 0,
      })
      .select('id, url, thumbnail_url, media_type, width, height')
      .single()

    if (dbError) {
      await cloudinary.uploader.destroy(result.public_id as string)
      return NextResponse.json({ error: 'Failed to save media record' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      media: mediaRecord,
      cloudinaryId: result.public_id,
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}