// src/lib/actions/escrow-admin.ts
'use server'

import { revalidatePath } from 'next/cache'
import { releaseEscrow, refundEscrow, splitEscrow } from './escrow'
import { requireAdmin, auditLog } from './admin'

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

  revalidatePath('/disputes')
  revalidatePath(`/disputes/${disputeId}`)
  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true }
}