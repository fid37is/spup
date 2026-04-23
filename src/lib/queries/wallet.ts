/**
 * queries/wallet.ts
 * -----------------
 * Read queries for wallet + transaction data.
 * Mutations (initiate withdrawal) live in app/api/paystack/initiate.
 */

import { createClient } from '@/lib/supabase'

// ─── Wallet balance ───────────────────────────────────────────────────────────

export async function getWallet(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data
}

// ─── Transaction history (paginated) ─────────────────────────────────────────

export async function getTransactions(walletId: string, limit = 20, cursor?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('transactions')
    .select('id, type, amount_kobo, platform_fee_kobo, status, description, created_at, completed_at, reference')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data } = await query
  if (!data?.length) return { transactions: [], nextCursor: null }

  const hasMore = data.length > limit
  const page = hasMore ? data.slice(0, limit) : data
  return { transactions: page, nextCursor: hasMore ? page[page.length - 1].created_at : null }
}

// ─── Earnings summary (current month) ────────────────────────────────────────

export async function getMonthlyEarnings(walletId: string) {
  const supabase = await createClient()
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('transactions')
    .select('type, amount_kobo')
    .eq('wallet_id', walletId)
    .eq('status', 'completed')
    .in('type', ['earning_ad', 'earning_tip', 'earning_subscription'])
    .gte('created_at', startOfMonth.toISOString())

  const total = (data || []).reduce((sum: number, t: {amount_kobo: number}) => sum + t.amount_kobo, 0)
  const bySource = (data || []).reduce((acc: Record<string, number>, t: {type: string; amount_kobo: number}) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount_kobo
    return acc
  }, {} as Record<string, number>)

  return { total_kobo: total, by_source: bySource }
}

// ─── Monetisation eligibility check ──────────────────────────────────────────

export async function checkMonetisationEligibility(userId: string) {
  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('followers_count, posts_count, is_monetised, bvn_verified, created_at, status')
    .eq('id', userId)
    .single()

  if (!user) return null

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  return {
    is_monetised: user.is_monetised,
    criteria: {
      followers:    { met: user.followers_count >= 500, value: user.followers_count, required: 500 },
      account_age:  { met: accountAgeDays >= 90,        value: accountAgeDays,       required: 90 },
      posts:        { met: user.posts_count >= 100,     value: user.posts_count,     required: 100 },
      good_standing:{ met: user.status === 'active',    value: user.status,          required: 'active' },
      bvn_verified: { met: user.bvn_verified,           value: user.bvn_verified,    required: true },
    },
  }
}
