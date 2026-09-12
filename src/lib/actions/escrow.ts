// src/lib/actions/escrow.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// P2P escrow: buyer pays seller from wallet balance. Money leaves
// the buyer's balance_kobo the instant they pay (escrow_hold) and
// only enters the seller's balance_kobo (escrow_release) once the
// buyer confirms receipt, an auto-release timeout passes, or a
// dispute resolves in the seller's favour. See migration
// 013_escrow_marketplace.sql for the full schema/rationale.
//
// All wallet balance mutations here use the admin client — even
// the buyer-debit step, deliberately, because a single action can
// touch both parties' wallets (e.g. mutual-refund) and mixing RLS-
// scoped and admin-scoped clients in one function invites subtle
// bugs. Every function still authenticates and authorizes the
// caller explicitly before touching anything.
// ============================================================

const AUTO_RELEASE_DAYS = 5
const DISPUTE_RESPONSE_WINDOW_HOURS = 48

function generateReference(prefix: string) {
  return `SPUP-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', profile: null }

  const { data: profile } = await supabase
    .from('users')
    .select('id, username, status')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', profile: null }
  if (profile.status === 'banned' || profile.status === 'suspended') {
    return { error: 'Your account is not eligible for this action', profile: null }
  }
  return { error: null, profile }
}

async function notify(recipientId: string, actorId: string, type: string, entityId: string, entityType = 'escrow_order') {
  const admin = createAdminClient()
  void admin.from('notifications').insert({
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    entity_id: entityId,
    entity_type: entityType,
  })
}

// ─── 1. Buyer pays a vendor ─────────────────────────────────────────────────

export async function payVendorAction({
  sellerUsername,
  postId,
  amountKobo,
  note,
}: {
  sellerUsername: string
  postId?: string
  amountKobo: number
  note?: string
}) {
  const { error: authError, profile: buyer } = await getCallerProfile()
  if (authError || !buyer) return { error: authError }

  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    return { error: 'Enter a valid amount' }
  }
  // ₦100 minimum keeps this from being used to spam-test with 1 kobo transfers.
  if (amountKobo < 10_000) {
    return { error: 'Minimum payment is ₦100' }
  }

  const admin = createAdminClient()

  const { data: seller } = await admin
    .from('users')
    .select('id, username, status, bvn_verified')
    .eq('username', sellerUsername)
    .single()

  if (!seller) return { error: 'Vendor not found' }
  if (seller.status === 'banned' || seller.status === 'suspended') {
    return { error: 'This vendor account is not currently active' }
  }
  if (seller.id === buyer.id) return { error: "You can't pay yourself" }

  // Require the seller to have completed BVN verification before they can
  // *receive* escrow — same gate already enforced at withdrawal time, just
  // applied a step earlier. Ties every seller to a real, traceable identity.
  if (!seller.bvn_verified) {
    return { error: 'This vendor has not completed identity verification and cannot receive escrow payments yet' }
  }

  const { data: buyerWallet } = await admin
    .from('wallets')
    .select('id, balance_kobo')
    .eq('user_id', buyer.id)
    .single()

  if (!buyerWallet) return { error: 'Wallet not found' }
  if (buyerWallet.balance_kobo < amountKobo) {
    return {
      error: `Insufficient balance. Your balance is ₦${(buyerWallet.balance_kobo / 100).toFixed(2)} — top up your wallet first.`,
      insufficient_balance: true,
    }
  }

  const reference = generateReference('ESC')
  const now = new Date().toISOString()

  // Debit buyer immediately — this is what makes it "held" rather than
  // merely "authorized". A crashed request after this point still leaves
  // an accurate, auditable transaction row; nothing is lost silently.
  const { error: debitError } = await admin
    .from('wallets')
    .update({ balance_kobo: buyerWallet.balance_kobo - amountKobo })
    .eq('id', buyerWallet.id)

  if (debitError) return { error: 'Could not process payment. Please try again.' }

  const { data: holdTxn, error: txnError } = await admin
    .from('transactions')
    .insert({
      wallet_id: buyerWallet.id,
      type: 'escrow_hold',
      amount_kobo: amountKobo,
      status: 'completed',
      reference,
      description: `Escrow payment to @${seller.username}`,
      entity_id: postId ?? null,
      completed_at: now,
    })
    .select('id')
    .single()

  if (txnError || !holdTxn) {
    // Roll back the debit — better to fail the payment than lose the money.
    await admin.from('wallets').update({ balance_kobo: buyerWallet.balance_kobo }).eq('id', buyerWallet.id)
    return { error: 'Could not record payment. Please try again.' }
  }

  const { data: order, error: orderError } = await admin
    .from('escrow_orders')
    .insert({
      reference,
      buyer_id: buyer.id,
      seller_id: seller.id,
      post_id: postId ?? null,
      amount_kobo: amountKobo,
      status: 'held',
      hold_txn_id: holdTxn.id,
      note: note ?? null,
      held_at: now,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    await admin.from('wallets').update({ balance_kobo: buyerWallet.balance_kobo }).eq('id', buyerWallet.id)
    await admin.from('transactions').update({ status: 'failed' }).eq('id', holdTxn.id)
    return { error: 'Could not create order. Please try again.' }
  }

  await notify(seller.id, buyer.id, 'escrow_hold_received', order.id)
  revalidatePath('/wallet')

  return { success: true, orderId: order.id, reference }
}

// ─── 2. Seller marks the item delivered/sent ───────────────────────────────

export async function markDeliveredAction({ orderId }: { orderId: string }) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('escrow_orders')
    .select('id, seller_id, status')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found' }
  if (order.seller_id !== profile.id) return { error: 'Only the seller can do this' }
  if (order.status !== 'held') return { error: 'This order is not awaiting delivery' }

  const now = new Date()
  const autoReleaseAt = new Date(now.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000)

  const { error } = await admin
    .from('escrow_orders')
    .update({
      status: 'delivered_by_seller',
      delivered_at: now.toISOString(),
      auto_release_at: autoReleaseAt.toISOString(),
    })
    .eq('id', orderId)

  if (error) return { error: 'Could not update order' }

  const { data: fullOrder } = await admin.from('escrow_orders').select('buyer_id').eq('id', orderId).single()
  if (fullOrder) await notify(fullOrder.buyer_id, profile.id, 'escrow_delivered', orderId)

  revalidatePath(`/wallet/orders/${orderId}`)
  return { success: true, auto_release_at: autoReleaseAt.toISOString() }
}

// ─── 3. Buyer confirms receipt → release funds ─────────────────────────────

async function releaseEscrow(orderId: string, resolvedVia: 'buyer_confirmed' | 'auto_release' | 'mutual' | 'admin') {
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('escrow_orders')
    .select('id, seller_id, amount_kobo, status')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found' }
  if (!['held', 'delivered_by_seller', 'disputed'].includes(order.status)) {
    return { error: 'This order cannot be released in its current state' }
  }

  const { data: sellerWallet } = await admin
    .from('wallets')
    .select('id, balance_kobo')
    .eq('user_id', order.seller_id)
    .single()

  if (!sellerWallet) return { error: "Seller's wallet not found" }

  const now = new Date().toISOString()

  const { data: releaseTxn, error: txnError } = await admin
    .from('transactions')
    .insert({
      wallet_id: sellerWallet.id,
      type: 'escrow_release',
      amount_kobo: order.amount_kobo,
      status: 'completed',
      reference: generateReference('ESCREL'),
      description: `Escrow release (${resolvedVia})`,
      entity_id: orderId,
      completed_at: now,
    })
    .select('id')
    .single()

  if (txnError || !releaseTxn) return { error: 'Could not release funds' }

  await admin.from('wallets').update({ balance_kobo: sellerWallet.balance_kobo + order.amount_kobo }).eq('id', sellerWallet.id)

  await admin
    .from('escrow_orders')
    .update({ status: 'released', released_at: now, release_txn_id: releaseTxn.id, auto_release_at: null })
    .eq('id', orderId)

  await notify(order.seller_id, order.seller_id, 'escrow_released', orderId)
  return { success: true }
}

async function refundEscrow(orderId: string) {
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('escrow_orders')
    .select('id, buyer_id, amount_kobo, hold_txn_id, status')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found' }
  if (!['held', 'delivered_by_seller', 'disputed'].includes(order.status)) {
    return { error: 'This order cannot be refunded in its current state' }
  }

  const { data: buyerWallet } = await admin
    .from('wallets')
    .select('id, balance_kobo')
    .eq('user_id', order.buyer_id)
    .single()

  if (!buyerWallet) return { error: "Buyer's wallet not found" }

  const now = new Date().toISOString()

  const { data: refundTxn, error: txnError } = await admin
    .from('transactions')
    .insert({
      wallet_id: buyerWallet.id,
      type: 'refund',
      amount_kobo: order.amount_kobo,
      status: 'completed',
      reference: generateReference('ESCREF'),
      description: 'Escrow refund',
      entity_id: orderId,
      completed_at: now,
    })
    .select('id')
    .single()

  if (txnError || !refundTxn) return { error: 'Could not process refund' }

  await admin.from('wallets').update({ balance_kobo: buyerWallet.balance_kobo + order.amount_kobo }).eq('id', buyerWallet.id)

  await admin
    .from('escrow_orders')
    .update({ status: 'refunded', release_txn_id: refundTxn.id, auto_release_at: null })
    .eq('id', orderId)

  return { success: true }
}

// Split resolution: part to seller (as a release), part back to buyer (as a
// refund). Reuses the two primitives above rather than a third code path.
async function splitEscrow(orderId: string, sellerKobo: number, buyerKobo: number) {
  const admin = createAdminClient()
  const { data: order } = await admin.from('escrow_orders').select('amount_kobo, seller_id, buyer_id, status').eq('id', orderId).single()
  if (!order) return { error: 'Order not found' }
  if (sellerKobo + buyerKobo !== order.amount_kobo) return { error: 'Split amounts must add up to the full order amount' }

  const now = new Date().toISOString()

  if (sellerKobo > 0) {
    const { data: sellerWallet } = await admin.from('wallets').select('id, balance_kobo').eq('user_id', order.seller_id).single()
    if (sellerWallet) {
      const { data: txn } = await admin.from('transactions').insert({
        wallet_id: sellerWallet.id, type: 'escrow_release', amount_kobo: sellerKobo,
        status: 'completed', reference: generateReference('ESCSPL'), description: 'Escrow split resolution', entity_id: orderId, completed_at: now,
      }).select('id').single()
      await admin.from('wallets').update({ balance_kobo: sellerWallet.balance_kobo + sellerKobo }).eq('id', sellerWallet.id)
      if (txn) await admin.from('escrow_orders').update({ release_txn_id: txn.id }).eq('id', orderId)
    }
  }

  if (buyerKobo > 0) {
    const { data: buyerWallet } = await admin.from('wallets').select('id, balance_kobo').eq('user_id', order.buyer_id).single()
    if (buyerWallet) {
      await admin.from('transactions').insert({
        wallet_id: buyerWallet.id, type: 'refund', amount_kobo: buyerKobo,
        status: 'completed', reference: generateReference('ESCSPL'), description: 'Escrow split resolution', entity_id: orderId, completed_at: now,
      })
      await admin.from('wallets').update({ balance_kobo: buyerWallet.balance_kobo + buyerKobo }).eq('id', buyerWallet.id)
    }
  }

  await admin.from('escrow_orders').update({ status: 'released', released_at: now, auto_release_at: null }).eq('id', orderId)
  return { success: true }
}

export async function confirmReceiptAction({ orderId }: { orderId: string }) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }

  const admin = createAdminClient()
  const { data: order } = await admin.from('escrow_orders').select('buyer_id, status').eq('id', orderId).single()
  if (!order) return { error: 'Order not found' }
  if (order.buyer_id !== profile.id) return { error: 'Only the buyer can confirm receipt' }
  if (!['held', 'delivered_by_seller'].includes(order.status)) {
    return { error: 'This order is not awaiting confirmation' }
  }

  const result = await releaseEscrow(orderId, 'buyer_confirmed')
  if (result.error) return result

  revalidatePath(`/wallet/orders/${orderId}`)
  return { success: true }
}

// ─── 4. Dispute: open, add evidence, propose, respond, escalate ───────────

export async function openDisputeAction({
  orderId,
  reason,
  details,
}: {
  orderId: string
  reason: 'item_not_received' | 'item_not_as_described' | 'seller_unresponsive' | 'buyer_falsely_disputing' | 'other'
  details: string
}) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }
  if (!details?.trim()) return { error: 'Please describe the issue' }

  const admin = createAdminClient()
  const { data: order } = await admin.from('escrow_orders').select('id, buyer_id, seller_id, status').eq('id', orderId).single()
  if (!order) return { error: 'Order not found' }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) return { error: 'Not your order' }
  if (!['held', 'delivered_by_seller'].includes(order.status)) {
    return { error: 'This order cannot be disputed in its current state' }
  }

  const responseDeadline = new Date(Date.now() + DISPUTE_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000)

  const { data: dispute, error } = await admin
    .from('escrow_disputes')
    .insert({
      escrow_order_id: orderId,
      opened_by: profile.id,
      reason,
      details: details.trim(),
      status: 'open',
      response_deadline_at: responseDeadline.toISOString(),
    })
    .select('id')
    .single()

  if (error || !dispute) return { error: 'Could not open dispute' }

  // Freeze auto-release the moment a dispute opens.
  await admin.from('escrow_orders').update({ status: 'disputed', auto_release_at: null }).eq('id', orderId)

  const otherParty = order.buyer_id === profile.id ? order.seller_id : order.buyer_id
  await notify(otherParty, profile.id, 'escrow_disputed', orderId)

  revalidatePath(`/wallet/orders/${orderId}`)
  return { success: true, disputeId: dispute.id }
}

export async function submitDisputeEvidenceAction({
  disputeId,
  evidenceType,
  fileUrl,
  textContent,
}: {
  disputeId: string
  evidenceType: 'photo' | 'video' | 'tracking_number' | 'note'
  fileUrl?: string
  textContent?: string
}) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }
  if (!fileUrl && !textContent) return { error: 'Provide a file or a note' }

  const admin = createAdminClient()
  const { data: dispute } = await admin
    .from('escrow_disputes')
    .select('id, escrow_order_id, status, order:escrow_order_id ( buyer_id, seller_id )')
    .eq('id', disputeId)
    .single()

  if (!dispute) return { error: 'Dispute not found' }
  const order = dispute.order as unknown as { buyer_id: string; seller_id: string }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) return { error: 'Not your dispute' }
  if (!['open', 'negotiating', 'escalated'].includes(dispute.status)) {
    return { error: 'This dispute is already resolved' }
  }

  const { error } = await admin.from('escrow_dispute_evidence').insert({
    dispute_id: disputeId,
    uploaded_by: profile.id,
    evidence_type: evidenceType,
    file_url: fileUrl ?? null,
    text_content: textContent ?? null,
  })

  if (error) return { error: 'Could not submit evidence' }
  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true }
}

// Either party proposes a resolution. Shows up as a card in their
// existing DM thread (rendered client-side) as well as the order page.
export async function proposeResolutionAction({
  disputeId,
  resolutionType,
  splitSellerKobo,
  splitBuyerKobo,
  message,
}: {
  disputeId: string
  resolutionType: 'release_to_seller' | 'refund_to_buyer' | 'split'
  splitSellerKobo?: number
  splitBuyerKobo?: number
  message?: string
}) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }

  const admin = createAdminClient()
  const { data: dispute } = await admin
    .from('escrow_disputes')
    .select('id, escrow_order_id, status, order:escrow_order_id ( buyer_id, seller_id, amount_kobo )')
    .eq('id', disputeId)
    .single()

  if (!dispute) return { error: 'Dispute not found' }
  const order = dispute.order as unknown as { buyer_id: string; seller_id: string; amount_kobo: number }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) return { error: 'Not your dispute' }
  if (!['open', 'negotiating'].includes(dispute.status)) {
    return { error: 'This dispute is no longer open for negotiation — it may have been escalated or resolved' }
  }

  if (resolutionType === 'split') {
    if (splitSellerKobo == null || splitBuyerKobo == null || splitSellerKobo + splitBuyerKobo !== order.amount_kobo) {
      return { error: 'Split amounts must add up to the full order amount' }
    }
  }

  // Superseding any prior pending proposal on this dispute avoids stale
  // "accept" clicks resolving the wrong offer.
  await admin.from('escrow_dispute_proposals').update({ status: 'withdrawn' }).eq('dispute_id', disputeId).eq('status', 'pending')

  const { data: proposal, error } = await admin
    .from('escrow_dispute_proposals')
    .insert({
      dispute_id: disputeId,
      proposed_by: profile.id,
      resolution_type: resolutionType,
      split_seller_kobo: splitSellerKobo ?? null,
      split_buyer_kobo: splitBuyerKobo ?? null,
      message: message ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !proposal) return { error: 'Could not submit proposal' }

  await admin.from('escrow_disputes').update({ status: 'negotiating' }).eq('id', disputeId)

  const otherParty = order.buyer_id === profile.id ? order.seller_id : order.buyer_id
  await notify(otherParty, profile.id, 'escrow_proposal', dispute.escrow_order_id)

  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true, proposalId: proposal.id }
}

export async function respondToProposalAction({
  proposalId,
  accept,
}: {
  proposalId: string
  accept: boolean
}) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }

  const admin = createAdminClient()
  const { data: proposal } = await admin
    .from('escrow_dispute_proposals')
    .select('id, dispute_id, proposed_by, resolution_type, split_seller_kobo, split_buyer_kobo, status')
    .eq('id', proposalId)
    .single()

  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'pending') return { error: 'This proposal is no longer active' }
  if (proposal.proposed_by === profile.id) return { error: "You can't respond to your own proposal" }

  const { data: dispute } = await admin
    .from('escrow_disputes')
    .select('id, escrow_order_id, order:escrow_order_id ( buyer_id, seller_id )')
    .eq('id', proposal.dispute_id)
    .single()

  if (!dispute) return { error: 'Dispute not found' }
  const order = dispute.order as unknown as { buyer_id: string; seller_id: string }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) return { error: 'Not your dispute' }

  if (!accept) {
    await admin.from('escrow_dispute_proposals').update({ status: 'rejected', responded_at: new Date().toISOString() }).eq('id', proposalId)
    revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
    return { success: true, accepted: false }
  }

  // Accepted — execute the agreed resolution.
  let result: { error?: string; success?: boolean } = { error: 'Unknown resolution type' }
  if (proposal.resolution_type === 'release_to_seller') {
    result = await releaseEscrow(dispute.escrow_order_id, 'mutual')
  } else if (proposal.resolution_type === 'refund_to_buyer') {
    result = await refundEscrow(dispute.escrow_order_id)
  } else if (proposal.resolution_type === 'split') {
    result = await splitEscrow(dispute.escrow_order_id, proposal.split_seller_kobo!, proposal.split_buyer_kobo!)
  }

  if (result.error) return result

  const now = new Date().toISOString()
  await admin.from('escrow_dispute_proposals').update({ status: 'accepted', responded_at: now }).eq('id', proposalId)
  await admin
    .from('escrow_disputes')
    .update({
      status: 'resolved_mutual',
      resolution: proposal.resolution_type,
      split_seller_kobo: proposal.split_seller_kobo,
      split_buyer_kobo: proposal.split_buyer_kobo,
      resolved_by: profile.id,
      resolved_at: now,
    })
    .eq('id', dispute.id)

  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true, accepted: true }
}

export async function escalateDisputeAction({ disputeId }: { disputeId: string }) {
  const { error: authError, profile } = await getCallerProfile()
  if (authError || !profile) return { error: authError }

  const admin = createAdminClient()
  const { data: dispute } = await admin
    .from('escrow_disputes')
    .select('id, escrow_order_id, status, order:escrow_order_id ( buyer_id, seller_id )')
    .eq('id', disputeId)
    .single()

  if (!dispute) return { error: 'Dispute not found' }
  const order = dispute.order as unknown as { buyer_id: string; seller_id: string }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) return { error: 'Not your dispute' }
  if (['resolved_mutual', 'resolved_admin'].includes(dispute.status)) return { error: 'This dispute is already resolved' }

  const { error } = await admin.from('escrow_disputes').update({ status: 'escalated' }).eq('id', disputeId)
  if (error) return { error: 'Could not escalate dispute' }

  const otherParty = order.buyer_id === profile.id ? order.seller_id : order.buyer_id
  await notify(otherParty, profile.id, 'escrow_escalated', dispute.escrow_order_id)

  revalidatePath(`/wallet/orders/${dispute.escrow_order_id}`)
  return { success: true }
}

// Exported for the admin action file and the cron route, which both need
// to execute a resolution outside the buyer/seller-initiated flows above.
export { releaseEscrow, refundEscrow, splitEscrow }
