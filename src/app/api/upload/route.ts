import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

// Allowed file types and size limits
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/avi', 'video/webm']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024   // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024  // 100MB

export async function POST(request: NextRequest) {
  try {
    // Auth check — never allow unauthenticated uploads
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for folder namespacing
    const { data: profile } = await supabase
      .from('users')
      .select('id, status')
      .eq('auth_id', user.id)
      .single()

    if (!profile || profile.status === 'banned' || profile.status === 'suspended') {
      return NextResponse.json({ error: 'Account not eligible for uploads' }, { status: 403 })
    }

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

    // Convert file to buffer for Cloudinary upload
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Build Cloudinary upload options
    const isAvatar = mediaType === 'avatar'
    const isBanner = mediaType === 'banner'

    const uploadOptions: Record<string, unknown> = {
      folder: `para/${profile.id}/${isAvatar || isBanner ? 'profile' : 'posts'}`,
      resource_type: isVideo ? 'video' : 'image',
      // Aggressive compression for Nigerian bandwidth
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
          { width: 1200, crop: 'limit' },  // Never upscale, max 1200px wide
          { quality: 'auto' },
        ],
      })
    } else if (isVideo) {
      Object.assign(uploadOptions, {
        transformation: [
          { duration: 180 },         // Max 3 minutes
          { quality: 'auto' },
          { video_codec: 'h264' },
        ],
        eager: [
          // Generate thumbnail automatically
          { format: 'jpg', transformation: [{ width: 800, height: 450, crop: 'fill' }, { quality: 80 }] }
        ],
        eager_async: true,
      })
    }

    // Upload to Cloudinary
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error)
        else resolve(result as Record<string, unknown>)
      }).end(buffer)
    })

    // Return Cloudinary data directly — post_media DB insert happens in
    // createPostAction once the post row exists and we have a real post_id.
    // This avoids the NOT NULL constraint on post_media.post_id.
    return NextResponse.json({
      success: true,
      media: {
        url: result.secure_url as string,
        thumbnail_url: isVideo ? ((result.eager as any)?.[0]?.secure_url || null) : null,
        media_type: isVideo ? 'video' : 'image',
        width: result.width as number,
        height: result.height as number,
        duration_secs: isVideo ? Math.round((result.duration as number) || 0) : null,
        size_bytes: file.size,
        cloudinary_id: result.public_id as string,
      },
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

// Disallow GET — media endpoint is write-only
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}