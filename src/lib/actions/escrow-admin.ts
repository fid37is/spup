// src/lib/actions/escrow-admin.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { releaseEscrow, refundEscrow, splitEscrow } from './escrow'

// ============================================================
// NOTE: this duplicates the requireAdmin()/auditLog() helpers in
// lib/actions/admin.ts rather than importing them, because those
// are declared without `export` in that file (private to it).
// Cleanest fix: add `export` to both declarations in admin.ts —
// a two-word change — then delete this local copy and import from
// there instead. Left duplicated for now so this file drops in
// without touching admin.ts.
// ============================================================

async function requireAdmin(allowModerator = true) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', admin: null, profile: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', admin: null, profile: null }
  const roles = allowModerator ? ['admin', 'moderator'] : ['admin']
  if (!roles.includes(profile.role)) return { error: 'Forbidden', admin: null, profile: null }

  return { error: null, admin, profile }
}

async function auditLog(adminId: string, action: string, targetType: string, targetId: string, metadata = {}) {
  const db = createAdminClient()
  await db.from('admin_audit_log').insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata })
}

export async function adminResolveDisputeAction({
  disputeId,
  resolution,
  splitSellerKobo,
  splitBuyerKobo,
  resolutionNotes,
}: {
  disputeId: string
  resolution: 'release_to_seller' | 'refund_to_buyer' | 'split'
  splitSellerKobo?: number
  splitBuyerKobo?: number
  resolutionNotes: string
}) {
  const { error, admin, profile } = await requireAdmin()
  if (error || !admin || !profile) return { error: error || 'Forbidden' }
  if (!resolutionNotes?.trim()) return { error: 'A resolution note is required for the audit trail' }

  const { data: dispute } = await admin
    .from('escrow_disputes')
    .select('id, escrow_order_id, status')
    .eq('id', disputeId)
    .single()

  if (!dispute) return { error: 'Dispute not found' }
  if (dispute.status !== 'escalated') return { error: 'Only escalated disputes can be resolved here' }

  let result: { error?: string; success?: boolean } = { error: 'Unknown resolution type' }
  if (resolution === 'release_to_seller') {
    result = await releaseEscrow(dispute.escrow_order_id, 'admin')
  } else if (resolution === 'refund_to_buyer') {
    result = await refundEscrow(dispute.escrow_order_id)
  } else if (resolution === 'split') {
    if (splitSellerKobo == null || splitBuyerKobo == null) {
      return { error: 'Split amounts are required' }
    }
    result = await splitEscrow(dispute.escrow_order_id, splitSellerKobo, splitBuyerKobo)
  }

  if (result.error) return result

  const now = new Date().toISOString()
  await admin
    .from('escrow_disputes')
    .update({
      status: 'resolved_admin',
      resolution,
      split_seller_kobo: splitSellerKobo ?? null,
      split_buyer_kobo: splitBuyerKobo ?? null,
      resolved_by: profile.id,
      resolution_notes: resolutionNotes.trim(),
      resolved_at: now,
    })
    .eq('id', disputeId)

  await auditLog(profile.id, `escrow_dispute_${resolution}`, 'escrow_dispute', disputeId, {
    resolution, splitSellerKobo, splitBuyerKobo, notes: resolutionNotes.trim(),
  })

  revalidatePath('/admin/disputes')
  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true }
}
