// src/lib/admin/user-data-export.ts
// Assembles everything Spup holds about one user into a single JSON document,
// for data-access requests (privacy@spup.ng - see /privacy, "Your Rights").
//
// Server-only. Callers MUST have already checked the viewer is an admin.
//
// Design notes:
//  - Reads via the service-role client, so it sees everything RLS would hide.
//    That is exactly why credentials are stripped below.
//  - Each section is fetched independently. A missing table or column (several
//    tables the app uses aren't in supabase/migrations) marks that one section
//    "unavailable" in the file's meta block instead of failing the whole export.
//  - Every section is capped so one very active account can't blow the request.

import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllRows, dateStamp } from './export'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS_PER_SECTION = 5000

// Keys that hold credentials or secrets. Matched on key name at any depth, so it
// also covers columns added after this was written (e.g. a future `totp_secret`).
const SENSITIVE_KEY = /(^|_)(hash|secret|pepper|pin|token|password|otp)(_|$)|verification_ref|recipient_code/i

type Row = Record<string, unknown>

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Row)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, v]) => [key, stripSensitive(v)]),
    )
  }
  return value
}

/** Returns a mapper that drops the given keys from a row (internal/moderation fields). */
const omit = (...keys: string[]) => (row: Row): Row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))

function maskAccountNumber(value: unknown): string {
  const s = String(value ?? '')
  return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : s
}

export type UserDataExportResult =
  | { ok: false; error: string }
  | {
      ok: true
      filename: string
      json: string
      email: string | null
      displayName: string
      sectionCounts: Record<string, number>
    }

export async function buildUserDataExport(userId: string): Promise<UserDataExportResult> {
  // userId can originate from a URL segment and is interpolated into an
  // `.or()` filter below - only ever accept a real UUID.
  if (!UUID_RE.test(userId)) return { ok: false, error: 'Invalid user id' }

  const db = createAdminClient()

  const { data: user, error: userError } = await db.from('users').select('*').eq('id', userId).maybeSingle()
  if (userError) return { ok: false, error: 'Could not load this user' }
  if (!user) return { ok: false, error: 'User not found' }

  const unavailable: string[] = []
  const truncated: string[] = []
  const sectionCounts: Record<string, number> = {}

  async function section(
    name: string,
    build: Parameters<typeof fetchAllRows>[0],
    mapRow: (row: Row) => Row = row => row,
  ): Promise<Row[]> {
    try {
      const { rows, truncated: wasTruncated } = await fetchAllRows<Row>(build, { maxRows: MAX_ROWS_PER_SECTION })
      if (wasTruncated) truncated.push(name)
      sectionCounts[name] = rows.length
      return rows.map(row => stripSensitive(mapRow(row)) as Row)
    } catch (err) {
      console.error(`[user data export] section "${name}" failed:`, err)
      unavailable.push(name)
      return []
    }
  }

  // Wallet first - transactions hang off its id.
  let wallet: Row | null = null
  let walletId: string | null = null
  try {
    const { data, error } = await db.from('wallets').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) {
      walletId = data.id as string
      const cleaned = stripSensitive(data) as Row
      if ('bank_account_number' in cleaned) cleaned.bank_account_number = maskAccountNumber(cleaned.bank_account_number)
      wallet = cleaned
    }
  } catch (err) {
    console.error('[user data export] section "wallet" failed:', err)
    unavailable.push('wallet')
  }

  const byNewest = { ascending: false } as const

  const [
    transactions, posts, likes, bookmarks, following, followers, blocked, muted,
    notifications, interests, onboarding, monetisation, verification, reportsFiled, escrowOrders, devices,
  ] = await Promise.all([
    walletId
      ? section('transactions', (from, to) =>
          db.from('transactions').select('*').eq('wallet_id', walletId)
            .order('created_at', byNewest).order('id').range(from, to))
      : Promise.resolve<Row[]>([]),

    section('posts', (from, to) =>
      db.from('posts').select('*').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to)),

    section('likes', (from, to) =>
      db.from('likes').select('post_id, created_at').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to)),

    section('bookmarks', (from, to) =>
      db.from('bookmarks').select('post_id, created_at').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to)),

    // Other people are identified by public username only - never by id/email.
    section('following', (from, to) =>
      db.from('follows').select('created_at, user:users!follows_following_id_fkey(username)').eq('follower_id', userId)
        .order('created_at', byNewest).order('following_id').range(from, to),
      row => ({ username: (row.user as Row | null)?.username ?? null, followed_at: row.created_at })),

    section('followers', (from, to) =>
      db.from('follows').select('created_at, user:users!follows_follower_id_fkey(username)').eq('following_id', userId)
        .order('created_at', byNewest).order('follower_id').range(from, to),
      row => ({ username: (row.user as Row | null)?.username ?? null, followed_at: row.created_at })),

    section('blocked_users', (from, to) =>
      db.from('user_blocks').select('created_at, user:users!user_blocks_blocked_id_fkey(username)').eq('blocker_id', userId)
        .order('created_at', byNewest).order('blocked_id').range(from, to),
      row => ({ username: (row.user as Row | null)?.username ?? null, blocked_at: row.created_at })),

    section('muted_users', (from, to) =>
      db.from('user_mutes').select('created_at, user:users!user_mutes_muted_id_fkey(username)').eq('muter_id', userId)
        .order('created_at', byNewest).order('muted_id').range(from, to),
      row => ({ username: (row.user as Row | null)?.username ?? null, muted_at: row.created_at })),

    section('notifications', (from, to) =>
      db.from('notifications').select('*').eq('recipient_id', userId)
        .order('created_at', byNewest).order('id').range(from, to)),

    section('interests', (from, to) =>
      db.from('user_interests').select('interest').eq('user_id', userId)
        .order('interest').range(from, to)),

    section('onboarding', (from, to) =>
      db.from('onboarding_progress').select('*').eq('user_id', userId)
        .order('user_id').range(from, to)),

    section('monetisation_applications', (from, to) =>
      db.from('monetisation_applications').select('*').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to),
      omit('reviewed_by')),

    // Internal reviewer identity and notes are moderation records, not the user's data.
    section('verification_requests', (from, to) =>
      db.from('verification_requests').select('*').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to),
      omit('reviewed_by', 'review_notes')),

    // Reports this user filed. Reports filed AGAINST them are deliberately left out
    // (they'd reveal other users' identities and open moderation cases).
    section('reports_filed', (from, to) =>
      db.from('reports').select('*').eq('reporter_id', userId)
        .order('created_at', byNewest).order('id').range(from, to),
      omit('reviewer_id')),

    section('escrow_orders', (from, to) =>
      db.from('escrow_orders').select('*').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order('created_at', byNewest).order('id').range(from, to)),

    // Device tokens are credentials - only say which platforms are registered.
    section('devices', (from, to) =>
      db.from('user_devices').select('platform, created_at, updated_at').eq('user_id', userId)
        .order('created_at', byNewest).order('id').range(from, to)),
  ])

  const payload = {
    meta: {
      format: 'spup-user-data-export/v1',
      generated_at: new Date().toISOString(),
      user_id: userId,
      notes: [
        'Direct messages are end-to-end encrypted and are not included in this file.',
        'Security credentials (PINs, password and ID-number hashes, device tokens) are omitted.',
        'Bank account numbers are masked to the last 4 digits.',
        'Moderation reports filed about this account, and internal review notes, are not included.',
      ],
      truncated_sections: truncated,
      unavailable_sections: unavailable,
    },
    profile: stripSensitive(user),
    wallet,
    transactions,
    posts,
    likes,
    bookmarks,
    following,
    followers,
    blocked_users: blocked,
    muted_users: muted,
    notifications,
    interests: interests.map(row => row.interest),
    onboarding: onboarding[0] ?? null,
    monetisation_applications: monetisation,
    verification_requests: verification,
    reports_filed: reportsFiled,
    escrow_orders: escrowOrders,
    devices,
  }

  const slug = String(user.username || 'user').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return {
    ok: true,
    filename: `spup-data-${slug || 'user'}-${dateStamp()}.json`,
    json: JSON.stringify(payload, null, 2),
    email: (user.email as string | null)?.trim() || null,
    displayName: String(user.display_name || user.username || 'there'),
    sectionCounts,
  }
}
