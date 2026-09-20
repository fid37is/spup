// src/lib/actions/admin.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendWaitlistInviteEmail, sendUserDataExportEmail } from '@/lib/email/send'
import { checkRateLimit } from '@/lib/rate-limit'
import { fetchAllRows, maskEmail } from '@/lib/admin/export'
import { buildUserDataExport } from '@/lib/admin/user-data-export'

// ─── Guard: caller must be admin or moderator ─────────────────────────────────

export async function requireAdmin(allowModerator = true) {
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

export async function auditLog(adminId: string, action: string, targetType: string, targetId: string, metadata = {}) {
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

// ─── Testimonial moderation ───────────────────────────────────────────────────
// NOTE: `testimonials` has no migration anywhere in supabase/migrations, no
// admin UI page exists for it, and the only other "testimonial" reference in
// the codebase is a hardcoded static grid on the landing page (src/app/page.tsx).
// This compiles fine (the Supabase client here is untyped) but will fail at
// runtime with "relation does not exist" unless that table already exists in
// the live DB outside of migrations, or gets created - flagging rather than
// guessing at its schema.

export async function adminUpdateTestimonialAction(
  testimonialId: string,
  status: 'approved' | 'rejected'
) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: tError } = await admin.from('testimonials').update({
    status,
    reviewed_at: new Date().toISOString(),
  }).eq('id', testimonialId)

  if (tError) return { error: 'Update failed' }

  await auditLog(profile.id, `testimonial_${status}`, 'testimonial', testimonialId)
  revalidatePath('/testimonials')
  revalidatePath('/') // the public landing page reads approved testimonials
  return { success: true }
}

// ─── Waitlist management ──────────────────────────────────────────────────────

export async function adminInviteWaitlistAction(waitlistId: string) {
  const { error, admin, profile } = await requireAdmin(false) // admin only
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { data: entry, error: fetchError } = await admin
    .from('waitlist')
    .select('id, full_name, email')
    .eq('id', waitlistId)
    .single()

  if (fetchError || !entry) return { error: 'Waitlist entry not found' }
  if (!entry.email) return { error: 'This entry has no email address on file - nothing to send the invite to.' }

  // This previously flipped the row to 'invited' and stopped there -
  // no email actually went out, so the row silently looked "sent" while
  // the person on the waitlist never got anything. Send first, only mark
  // invited (and audit-log) once the email genuinely succeeds.
  const sendResult = await sendWaitlistInviteEmail(entry.email, {
    name: entry.full_name,
    subject: "You're in - welcome to Spup",
    message: `Hey ${entry.full_name.split(' ')[0]}, your spot on Spup just opened up. Tap below to create your account and get started.`,
  })

  if (sendResult.error) return { error: `Invite email failed to send: ${sendResult.error}` }

  const { error: inviteError } = await admin.from('waitlist').update({
    status: 'invited',
    invited_at: new Date().toISOString(),
  }).eq('id', waitlistId)

  if (inviteError) return { error: 'Invite email sent, but failed to update the waitlist record.' }

  await auditLog(profile.id, 'waitlist_invite', 'waitlist', waitlistId)
  revalidatePath('/waitlist')
  return { success: true }
}

// ─── Bulk-invite everyone currently waiting ─────────────────────────────────
// Sends the admin-composed message to every 'waiting' entry that has an
// email on file (phone-only entries have no send channel wired up yet -
// there's no SMS provider in this codebase - and are reported back as
// skipped rather than silently dropped).
//
// Sending happens in an after() callback so the action returns immediately
// instead of holding the request open for however long N Resend calls take
// - at waitlist sizes in the hundreds this would otherwise risk hitting the
// platform's function timeout. Each row only flips to 'invited' once its
// own email actually succeeds, in small batches with a short pause between
// them to stay under Resend's rate limit; a failure just leaves that row
// 'waiting' so it's obvious (and re-sendable) which ones didn't go out.
export async function adminBulkInviteWaitlistAction({
  subject,
  message,
  closeWaitlistAfter,
}: {
  subject: string
  message: string
  closeWaitlistAfter: boolean
}) {
  const { error, admin, profile } = await requireAdmin(false) // admin only
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  if (!subject.trim() || !message.trim()) {
    return { error: 'Subject and message are required' }
  }

  type WaitlistEntry = { id: string; full_name: string; email: string | null }

  // A plain .select() returns at most 1000 rows (PostgREST's default cap) with
  // no error, so past 1000 waiting entries the rest were silently never emailed
  // while the UI still showed the full count. Page through everything instead.
  let all: WaitlistEntry[]
  try {
    const result = await fetchAllRows<WaitlistEntry>((from, to) =>
      admin
        .from('waitlist')
        .select('id, full_name, email')
        .eq('status', 'waiting')
        .order('position', { ascending: true })
        .order('id')
        .range(from, to)
    )
    all = result.rows
  } catch {
    return { error: 'Could not load waitlist' }
  }
  const recipients = all.filter((e: WaitlistEntry): e is WaitlistEntry & { email: string } => !!e.email)
  const skippedNoEmail = all.length - recipients.length

  if (recipients.length === 0) {
    return { error: 'No waiting entries have an email address to send to' }
  }

  await auditLog(profile.id, 'waitlist_bulk_invite', 'waitlist', 'bulk', {
    count: recipients.length, skippedNoEmail, subject,
  })

  if (closeWaitlistAfter) {
    await admin.from('platform_settings').upsert({
      key: 'waitlist_open', value: false, updated_at: new Date().toISOString(),
    })
  }

  after(async () => {
    const BATCH_SIZE = 5
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map(async entry => {
        const result = await sendWaitlistInviteEmail(entry.email, {
          name: entry.full_name, subject, message,
        })
        if (result.error) {
          console.error(`[waitlist bulk invite] failed for ${entry.email}:`, result.error)
          return
        }
        await admin.from('waitlist').update({
          status: 'invited', invited_at: new Date().toISOString(),
        }).eq('id', entry.id)
      }))
      // Brief pause between batches - keeps this well under Resend's
      // per-second rate limit even at a few hundred recipients.
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(r => setTimeout(r, 400))
      }
    }
    revalidatePath('/waitlist')
  })

  return { success: true, sending: recipients.length, skippedNoEmail }
}

// ─── User data export: email a copy to the user ─────────────────────────────
// For data-access requests (see /privacy, "Your Rights"). Always sends to the
// address stored on the account - never to an admin-typed address - so a
// mistaken or malicious request can't route someone's data to a third party.
// Downloading the same file is /api/admin/export/user/[id].

export async function adminEmailUserDataAction(userId: string) {
  const { error, admin, profile } = await requireAdmin(false) // admin only
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  // Keeps repeated clicks (or a compromised admin session) from flooding one inbox.
  const allowed = await checkRateLimit(`user-data-email:${userId}`, 3, 60 * 60)
  if (!allowed) return { error: 'This user was emailed their data recently - please wait before sending again.' }

  const built = await buildUserDataExport(userId)
  if (!built.ok) return { error: built.error }
  if (!built.email) return { error: 'This user has no email address on file - download the export instead.' }

  const sendResult = await sendUserDataExportEmail(built.email, {
    name: built.displayName,
    filename: built.filename,
    json: built.json,
  })
  if (sendResult.error) return { error: `Email failed to send: ${sendResult.error}` }

  await auditLog(profile.id, 'user_data_email', 'user', userId, { sections: built.sectionCounts })
  revalidatePath(`/users/${userId}`)
  return { success: true, sentTo: maskEmail(built.email) }
}

// ─── Waitlist form visibility (landing page) ────────────────────────────────
// Independent of sending - lets an admin close/reopen the public join form
// without necessarily sending mail at the same moment.

export async function adminSetWaitlistOpenAction(open: boolean) {
  const { error, admin, profile } = await requireAdmin(false)
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: upsertError } = await admin.from('platform_settings').upsert({
    key: 'waitlist_open', value: open, updated_at: new Date().toISOString(),
  })
  if (upsertError) return { error: 'Could not update setting' }

  await auditLog(profile.id, open ? 'waitlist_reopen' : 'waitlist_close', 'platform_settings', 'waitlist_open')
  revalidatePath('/waitlist')
  revalidatePath('/')
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

    if (tierError) return { error: 'Verification approved but tier update failed - check the user record' }
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