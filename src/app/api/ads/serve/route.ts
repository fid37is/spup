// src/app/api/ads/serve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const CREATOR_SHARE = 0.70
const PLATFORM_SHARE = 0.30

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { searchParams } = new URL(request.url)
    const postId    = searchParams.get('post_id') || null
    const userState = searchParams.get('state')   || null

    let userId: string | null = null
    let interests: string[]   = []

    if (user) {
      const { data: profile } = await supabase
        .from('users').select('id').eq('auth_id', user.id).single()

      if (profile) {
        userId = profile.id
        const { data: rows } = await supabase
          .from('user_interests').select('interest').eq('user_id', profile.id)
        interests = (rows || []).map((r: { interest: string }) => r.interest)
      }
    }

    const admin = createAdminClient()

    const { data: adRows } = await admin.rpc('get_next_ad', {
      p_user_id: userId,
      p_interests: interests,
      p_state: userState,
    })

    if (!adRows || adRows.length === 0) {
      return NextResponse.json({ ad: null, use_adsense: true })
    }

    const ad = adRows[0]

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const ipHash = crypto
      .createHash('sha256')
      .update(ip + (process.env.IP_HASH_SALT || 'spup'))
      .digest('hex')
      .slice(0, 16)

    const impressionCost = Math.round(ad.cpm_kobo / 1000)
    const creatorShare   = Math.round(impressionCost * CREATOR_SHARE)
    const platformShare  = impressionCost - creatorShare

    const { data: impression } = await admin
      .from('ad_impressions')
      .insert({
        ad_id: ad.ad_id,
        user_id: userId,
        post_id: postId,
        cost_kobo: impressionCost,
        creator_share_kobo: creatorShare,
        platform_share_kobo: platformShare,
        ip_hash: ipHash,
        device_type: detectDevice(request.headers.get('user-agent') || ''),
      })
      .select('id')
      .single()

    // Update ad spend + impressions (non-blocking)
    admin.from('ads').update({
      impressions: ad.impressions + 1,
      spent_kobo: ad.spent_kobo + impressionCost,
    }).eq('id', ad.ad_id).then(() => {})

    // Credit the post author if ad appeared near their post
    if (postId && impression) {
      const { data: post } = await admin
        .from('posts').select('user_id').eq('id', postId).single()

      if (post && post.user_id !== userId) {
        await admin.from('creator_ad_earnings').insert({
          user_id: post.user_id,
          ad_impression_id: impression.id,
          amount_kobo: creatorShare,
        })
      }
    }

    return NextResponse.json({
      ad: {
        id: ad.ad_id,
        impression_id: impression?.id,
        title: ad.title,
        body: ad.body,
        image_url: ad.image_url,
        destination_url: ad.destination_url,
        cta_label: ad.cta_label,
        format: ad.format,
      },
      use_adsense: false,
    })

  } catch (error) {
    console.error('Ad serve error:', error)
    return NextResponse.json({ ad: null, use_adsense: true })
  }
}

function detectDevice(ua: string): string {
  if (/mobile|android|iphone/i.test(ua)) return 'mobile'
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  return 'desktop'
}