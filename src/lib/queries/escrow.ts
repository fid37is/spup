// src/lib/queries/escrow.ts
import { createClient } from '@/lib/supabase/server'

// ─── Current user's orders (as buyer or seller) ────────────────────────────

export async function getMyEscrowOrders(role: 'buyer' | 'seller' = 'buyer') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', orders: null }

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', orders: null }

  const column = role === 'buyer' ? 'buyer_id' : 'seller_id'
  const otherParty = role === 'buyer' ? 'seller_id' : 'buyer_id'

  const { data: orders, error } = await supabase
    .from('escrow_orders')
    .select(`
      *,
      buyer:buyer_id ( id, username, display_name, avatar_url ),
      seller:seller_id ( id, username, display_name, avatar_url )
    `)
    .eq(column, profile.id)
    .order('created_at', { ascending: false })

  if (error) return { error: 'Could not load orders', orders: null }
  return { error: null, orders, viewer_id: profile.id }
}

// ─── Single order, with dispute/evidence/proposals if any ─────────────────

export async function getEscrowOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', order: null }

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', order: null }

  const { data: order, error } = await supabase
    .from('escrow_orders')
    .select(`
      *,
      buyer:buyer_id ( id, username, display_name, avatar_url ),
      seller:seller_id ( id, username, display_name, avatar_url )
    `)
    .eq('id', orderId)
    .single()

  // RLS already restricts this to buyer/seller, but double-check
  // explicitly so a not-found and a not-yours error don't look
  // identical to the caller.
  if (error || !order) return { error: 'Order not found', order: null }
  if (order.buyer_id !== profile.id && order.seller_id !== profile.id) {
    return { error: 'Order not found', order: null }
  }

  const { data: dispute } = await supabase
    .from('escrow_disputes')
    .select(`
      *,
      evidence:escrow_dispute_evidence ( * ),
      proposals:escrow_dispute_proposals ( * )
    `)
    .eq('escrow_order_id', orderId)
    .maybeSingle()

  return {
    error: null,
    order,
    dispute: dispute ?? null,
    viewer_id: profile.id,
    viewer_role: order.buyer_id === profile.id ? 'buyer' as const : 'seller' as const,
  }
}

// ─── Admin: escalated disputes queue ────────────────────────────────────────
// Mirrors the shape of the existing reports moderation queue in
// (admin)/reports. Access control is enforced by requireAdmin() in
// the corresponding action file, not here — this uses the admin
// client so it must only ever be called from an already-gated route.

export async function getEscalatedDisputesAdmin() {
  const { createAdminClient } = await import('@/lib/supabase/server')
  const admin = createAdminClient()

  const { data: disputes, error } = await admin
    .from('escrow_disputes')
    .select(`
      *,
      evidence:escrow_dispute_evidence ( * ),
      proposals:escrow_dispute_proposals ( * ),
      order:escrow_order_id (
        *,
        buyer:buyer_id ( id, username, display_name ),
        seller:seller_id ( id, username, display_name )
      )
    `)
    .eq('status', 'escalated')
    .order('created_at', { ascending: true })

  if (error) return { error: 'Could not load dispute queue', disputes: null }
  return { error: null, disputes }
}
