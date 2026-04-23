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
  revalidatePath('/admin/users')
  return { success: true }
}

// ─── Post moderation ──────────────────────────────────────────────────────────

export async function adminDeletePostAction(postId: string, reason: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  await admin.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId)

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
  revalidatePath('/admin/posts')
  return { success: true }
}

// ─── Report moderation ────────────────────────────────────────────────────────

type ReportAction = 'dismiss' | 'action_taken'

export async function adminResolveReportAction(reportId: string, decision: ReportAction, notes?: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  await admin.from('reports').update({
    status: decision === 'dismiss' ? 'dismissed' : 'actioned',
    reviewer_id: profile.id,
    reviewed_at: new Date().toISOString(),
    ...(notes && { details: notes }),
  }).eq('id', reportId)

  await auditLog(profile.id, `report_${decision}`, 'report', reportId)
  revalidatePath('/admin/reports')
  return { success: true }
}

// ─── Ad moderation ────────────────────────────────────────────────────────────

export async function adminUpdateAdAction(adId: string, status: 'active' | 'rejected', notes?: string) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  await admin.from('ads').update({
    status,
    review_notes: notes || null,
  }).eq('id', adId)

  await auditLog(profile.id, `ad_${status}`, 'ad', adId, { notes })
  revalidatePath('/admin/ads')
  return { success: true }
}

// ─── Waitlist management ──────────────────────────────────────────────────────

export async function adminInviteWaitlistAction(waitlistId: string) {
  const { error, admin, profile } = await requireAdmin(false) // admin only
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  await admin.from('waitlist').update({
    status: 'invited',
    invited_at: new Date().toISOString(),
  }).eq('id', waitlistId)

  await auditLog(profile.id, 'waitlist_invite', 'waitlist', waitlistId)
  revalidatePath('/admin/users')
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