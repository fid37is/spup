// src/lib/actions/admin.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Guard: caller must be admin or moderator ─────────────────────────────────

async function requireAdmin(allowModerator = true) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', admin: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', admin: null }
  const roles = allowModerator ? ['admin', 'moderator'] : ['admin']
  if (!roles.includes(profile.role)) return { error: 'Forbidden', admin: null }

  return { error: null, admin, profile }
}

async function auditLog(adminId: string, action: string, targetType: string, targetId: string, metadata = {}) {
  const db = createAdminClient()
  await db.from('admin_audit_log').insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata })
}

// ─── User moderation ──────────────────────────────────────────────────────────

type UserAction = 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'make_moderator' | 'revoke_moderator' | 'approve_monetisation'

export async function adminUpdateUserAction({ userId, action }: { userId: string; action: UserAction }) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const SUSPEND_UNTIL = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const updates: Record<UserAction, Record<string, unknown>> = {
    suspend:              { status: 'suspended' },
    unsuspend:            { status: 'active' },
    ban:                  { status: 'banned', deleted_at: new Date().toISOString() },
    unban:                { status: 'active', deleted_at: null },
    make_moderator:       { role: 'moderator' },
    revoke_moderator:     { role: 'user' },
    approve_monetisation: { is_monetised: true },
  }

  const { error: updateError } = await admin
    .from('users')
    .update(updates[action])
    .eq('id', userId)

  if (updateError) return { error: 'Update failed' }

  // If suspending, also send a system notification
  if (action === 'suspend') {
    await admin.from('notifications').insert({
      recipient_id: userId,
      type: 'system',
      metadata: { message: 'Your account has been suspended for 7 days due to a policy violation.' },
    })
  }

  await auditLog(profile.id, action, 'user', userId)
  revalidatePath('/users')
  revalidatePath(`/users/${userId}`)
  return { success: true }
}

// ─── Post moderation ──────────────────────────────────────────────────────────

export async function adminDeletePostAction(postId: string, reason: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: deleteError } = await admin
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', postId)

  if (deleteError) return { error: 'Delete failed' }

  // Notify author
  const { data: post } = await admin.from('posts').select('user_id').eq('id', postId).single()
  if (post) {
    await admin.from('notifications').insert({
      recipient_id: post.user_id,
      type: 'system',
      metadata: { message: `A post was removed: ${reason}` },
    })
  }

  await auditLog(profile.id, 'delete_post', 'post', postId, { reason })
  revalidatePath('/posts')
  return { success: true }
}

// ─── Report moderation ────────────────────────────────────────────────────────

type ReportAction = 'dismiss' | 'action_taken'

export async function adminResolveReportAction(reportId: string, decision: ReportAction, notes?: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: reportError } = await admin.from('reports').update({
    status: decision === 'dismiss' ? 'dismissed' : 'actioned',
    reviewer_id: profile.id,
    reviewed_at: new Date().toISOString(),
    ...(notes && { details: notes }),
  }).eq('id', reportId)

  if (reportError) return { error: 'Update failed' }

  await auditLog(profile.id, `report_${decision}`, 'report', reportId)
  revalidatePath('/reports')
  return { success: true }
}

// ─── Ad moderation ────────────────────────────────────────────────────────────

export async function adminUpdateAdAction(adId: string, status: 'active' | 'rejected', notes?: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: adError } = await admin.from('ads').update({
    status,
    review_notes: notes || null,
  }).eq('id', adId)

  if (adError) return { error: 'Update failed' }

  await auditLog(profile.id, `ad_${status}`, 'ad', adId, { notes })
  revalidatePath('/ads')
  return { success: true }
}

// ─── Waitlist management ──────────────────────────────────────────────────────

export async function adminInviteWaitlistAction(waitlistId: string) {
  const { error, admin, profile } = await requireAdmin(false) // admin only
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: inviteError } = await admin.from('waitlist').update({
    status: 'invited',
    invited_at: new Date().toISOString(),
  }).eq('id', waitlistId)

  if (inviteError) return { error: 'Invite failed' }

  await auditLog(profile.id, 'waitlist_invite', 'waitlist', waitlistId)
  revalidatePath('/waitlist')
  return { success: true }
}

// ─── Platform stats (for dashboard) ──────────────────────────────────────────

export async function getAdminStatsAction() {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error }

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [
    { count: totalUsers },
    { count: totalPosts },
    { count: pendingReports },
    { count: activeAds },
    { data: earnings },
  ] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('posts').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('transactions').select('amount_kobo').eq('status', 'completed').gte('created_at', startOfMonth),
  ])

  const monthlyRevenue = (earnings || []).reduce((sum: number, t: { amount_kobo: number }) => sum + t.amount_kobo, 0)

  return { totalUsers, totalPosts, pendingReports, activeAds, monthlyRevenue }
}

// ─── Promotions ─────────────────────────────────────────────────────────────

export async function adminCancelPromotionAction(promotionId: string, reason: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: cancelError } = await admin.from('post_promotions').update({ status: 'cancelled' }).eq('id', promotionId)

  if (cancelError) return { error: 'Cancel failed' }

  await auditLog(profile.id, 'cancel_promotion', 'post_promotion', promotionId, { reason })
  revalidatePath('/promotions')
  revalidatePath(`/promotions/${promotionId}`)
  return { success: true }
}

// ─── Verification queue ──────────────────────────────────────────────────────

export async function adminReviewVerificationAction(
  requestId: string,
  decision: 'approved' | 'rejected',
  notes?: string
) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { data: reqRow } = await admin
    .from('verification_requests')
    .select('id, user_id, requested_tier')
    .eq('id', requestId)
    .single()

  if (!reqRow) return { error: 'Request not found' }

  const { error: reviewError } = await admin
    .from('verification_requests')
    .update({
      status: decision,
      reviewed_by: profile.id,
      review_notes: notes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (reviewError) return { error: 'Update failed' }

  if (decision === 'approved') {
    const { error: tierError } = await admin
      .from('users')
      .update({ verification_tier: reqRow.requested_tier })
      .eq('id', reqRow.user_id)

    if (tierError) return { error: 'Verification approved but tier update failed — check the user record' }
  }

  await auditLog(profile.id, `verification_${decision}`, 'user', reqRow.user_id, { requested_tier: reqRow.requested_tier, notes })
  revalidatePath('/verification')
  revalidatePath(`/verification/${requestId}`)
  revalidatePath(`/users/${reqRow.user_id}`)
  return { success: true }
}

// ─── Public: submit a verification request (for future settings-page UI) ────

export async function submitVerificationRequestAction(requestedTier: 'standard' | 'creator' | 'organisation', note?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const { error: insertError } = await supabase
    .from('verification_requests')
    .insert({ user_id: profile.id, requested_tier: requestedTier, note })

  if (insertError) return { error: 'You already have a pending request, or something went wrong' }
  return { success: true }
}