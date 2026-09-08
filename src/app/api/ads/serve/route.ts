// src/app/api/ads/serve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const CREATOR_SHARE = 0.70
const PLATFORM_SHARE = 0.30

// Fraud guards — see supabase/migrations/006_revenue_fraud_hardening.sql
const MAX_CREDITED_IMPRESSIONS_PER_VIEWER_CREATOR_PER_DAY = 5
const MAX_CREDITED_IMPRESSIONS_PER_VIEWER_POST_PER_DAY = 1

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { searchParams } = new URL(request.url)
    const postId    = searchParams.get('post_id') || null
    const userState = searchParams.get('state')   || null
    // Client should send a stable per-device hash (e.g. via FingerprintJS) —
    // see device_fingerprint_log in the fraud-hardening migration.
    const deviceFingerprint = request.headers.get('x-device-fingerprint') || null

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

    // Log the device fingerprint against this viewer for multi-account
    // clustering (see detect_device_clusters() in the migration).
    if (deviceFingerprint && userId) {
      admin.from('device_fingerprint_log').insert({
        device_fingerprint: deviceFingerprint,
        user_id: userId,
        ip_hash: ipHash,
      }).then(() => {})
    }

    // Credit the post author if ad appeared near their post — only if they've
    // opted into monetisation (see lib/actions/monetisation.ts: 90 days /
    // 500 followers / 100 posts + explicit accept), and subject to rate
    // limits so one viewer can't farm a specific creator's earnings.
    // Ads still bill normally either way — this only decides whether the
    // creator's cut is credited, or stays with the platform.
    if (postId && impression) {
      const { data: post } = await admin
        .from('posts')
        .select('user_id, users!inner(is_monetised)')
        .eq('id', postId)
        .single()

      const creatorIsMonetised = (post?.users as unknown as { is_monetised: boolean } | null)?.is_monetised

      if (post && post.user_id !== userId && creatorIsMonetised) {
        const shouldCredit = userId
          ? await passesRateLimits(admin, userId, post.user_id, postId)
          : true // anonymous viewers aren't rate-limited per-account (IP-level limits can be layered on separately)

        if (shouldCredit) {
          await admin.from('creator_ad_earnings').insert({
            user_id: post.user_id,
            ad_impression_id: impression.id,
            amount_kobo: creatorShare,
          })
        } else {
          // Impression + ad billing still stand (advertiser genuinely got a
          // view), but this one doesn't count toward the creator's earnings.
          admin.from('fraud_flags').insert({
            user_id: userId,
            flag_type: 'impression_cap_exceeded',
            details: { creator_id: post.user_id, post_id: postId, impression_id: impression.id },
          }).then(() => {})
        }
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

// Returns false if this viewer has already hit the daily cap for this
// creator or this specific post — meaning the impression shouldn't be
// credited toward the creator's earnings.
async function passesRateLimits(
  admin: ReturnType<typeof createAdminClient>,
  viewerId: string,
  creatorId: string,
  postId: string
): Promise<boolean> {
  const [{ data: perCreator }, { data: perPost }] = await Promise.all([
    admin.rpc('count_viewer_creator_impressions_today', {
      p_viewer_id: viewerId,
      p_creator_id: creatorId,
    }),
    admin.rpc('count_viewer_post_impressions_today', {
      p_viewer_id: viewerId,
      p_post_id: postId,
    }),
  ])

  if ((perCreator ?? 0) >= MAX_CREDITED_IMPRESSIONS_PER_VIEWER_CREATOR_PER_DAY) return false
  if ((perPost ?? 0) >= MAX_CREDITED_IMPRESSIONS_PER_VIEWER_POST_PER_DAY) return false
  return true
}

function detectDevice(ua: string): string {
  if (/mobile|android|iphone/i.test(ua)) return 'mobile'
  if (/tablet|ipad/i.test(ua)) return 'tablet'
  return 'desktop'
}
