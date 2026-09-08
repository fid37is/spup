import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileByAuthId } from '@/lib/queries'
import { getWallet, getTransactions, getMonthlyEarnings, getNextPayoutDate } from '@/lib/queries'
import { getMonetisationEligibility } from '@/lib/actions/monetisation'
import { formatNaira, formatNumber } from '@/lib/utils'
import { TrendingUp, ArrowDownToLine, CheckCircle, ArrowUpRight, Shield } from 'lucide-react'
import WithdrawButton from './withdraw-button'
import AcceptMonetisationButton from './accept-monetisation-button'
import Link from 'next/link'

/* ── Monetisation checklist ─────────────────────────────────────────────── */
/* Growth criteria only (90 days / 500 followers / 100 posts) — deliberately
   independent of phone/BVN verification, which stays gated at withdrawal
   only. See lib/actions/monetisation.ts. */
function MonetisationChecklist({
  criteria, is_monetised, eligibleToAccept,
}: {
  criteria: NonNullable<Awaited<ReturnType<typeof getMonetisationEligibility>>>['criteria']
  is_monetised: boolean
  eligibleToAccept: boolean
}) {
  const safeCriteria = criteria ?? {
    followers: { met: false, value: 0 },
    account_age: { met: false, value: 0 },
    posts: { met: false, value: 0 },
  }

  const items = [
    { label: '500+ followers',    ...safeCriteria.followers,    display: `${formatNumber(safeCriteria.followers.value as number)} / 500` },
    { label: '90-day account',    ...safeCriteria.account_age,  display: `${Math.min(safeCriteria.account_age.value as number, 90)} / 90 days` },
    { label: '100+ posts',        ...safeCriteria.posts,        display: `${formatNumber(safeCriteria.posts.value as number)} / 100` },
  ]
  const metCount = items.filter(i => i.met).length
  const pct = Math.round((metCount / items.length) * 100)

  return (
    <section style={{ border: '1px solid var(--color-border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 2 }}>
            {is_monetised ? 'Monetisation active' : 'Monetisation eligibility'}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {is_monetised
              ? 'You are earning ad revenue'
              : eligibleToAccept
                ? 'All criteria met — enable below'
                : `${metCount} of ${items.length} criteria met`}
          </p>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
          background: pct === 100 ? 'var(--color-brand)' : 'var(--color-surface-2)',
          color: pct === 100 ? 'white' : 'var(--color-text-secondary)',
        }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 2, marginBottom: 18 }}>
        <div style={{ height: '100%', borderRadius: 2, background: 'var(--color-brand)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {c.met
                ? <CheckCircle size={16} color="var(--color-brand)" />
                : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--color-border)' }} />
              }
              <span style={{ fontSize: 14, color: c.met ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{c.label}</span>
            </div>
            <span style={{ fontSize: 12, color: c.met ? 'var(--color-brand)' : 'var(--color-text-muted)', fontWeight: c.met ? 600 : 400 }}>
              {c.display}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Transaction row ─────────────────────────────────────────────────────── */
function TransactionRow({ tx }: { tx: any }) {
  const isCredit = ['earning_ad', 'earning_tip', 'earning_subscription'].includes(tx.type)
  const typeLabel: Record<string, string> = {
    earning_ad: 'Ad revenue',
    earning_tip: 'Tip received',
    earning_subscription: 'Subscription',
    withdrawal: 'Withdrawal',
    refund: 'Refund',
  }
  const statusColor: Record<string, string> = {
    pending: 'var(--color-gold)',
    completed: 'var(--color-brand)',
    failed: 'var(--color-error)',
    reversed: 'var(--color-text-muted)',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isCredit
            ? <ArrowUpRight size={16} color="var(--color-brand)" />
            : <ArrowDownToLine size={16} color="var(--color-text-muted)" />
          }
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 3 }}>
            {typeLabel[tx.type] || tx.type}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: statusColor[tx.status] || 'var(--color-text-muted)', textTransform: 'capitalize' }}>
              {tx.status}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              · {new Date(tx.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
      <span style={{
        fontSize: 15, fontWeight: 700,
        color: isCredit ? 'var(--color-brand)' : 'var(--color-text-primary)',
        fontFamily: "'Syne', sans-serif",
        flexShrink: 0, marginLeft: 12,
      }}>
        {isCredit ? '+' : '−'}{formatNaira(tx.amount_kobo)}
      </span>
    </div>
  )
}

/* ── Stat card ───────────────────────────────────────────────────────────── */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: '14px 16px', background: 'var(--color-surface-2)', borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const [wallet, eligibility, nextPayout] = await Promise.all([
    getWallet(profile.id),
    getMonetisationEligibility(),
    getNextPayoutDate(profile.id),
  ])

  const { transactions } = wallet ? await getTransactions(wallet.id, 20) : { transactions: [] }
  const monthlyEarnings = wallet ? await getMonthlyEarnings(wallet.id) : { total_kobo: 0, by_source: {} }

  const balance = wallet?.balance_kobo || 0
  const totalEarned = wallet?.total_earned_kobo || 0
  const totalWithdrawn = wallet?.total_withdrawn_kobo || 0
  const canWithdraw = balance >= 100_000 && profile.bvn_verified

  const savedBank = wallet?.bank_account_number ? {
    bank_name: wallet.bank_name,
    bank_account_number: wallet.bank_account_number,
    bank_account_name: wallet.bank_account_name,
    paystack_recipient_code: wallet.paystack_recipient_code,
  } : null

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '16px 20px',
      }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)' }}>
          Wallet
        </h1>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Balance card */}
        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '24px 20px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>
            Available balance
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 36, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            {formatNaira(balance)}
          </div>
          {monthlyEarnings.total_kobo > 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-brand)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
              <TrendingUp size={13} />
              +{formatNaira(monthlyEarnings.total_kobo)} this month
            </div>
          )}

          {/* Stat row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <StatCard label="Total earned" value={formatNaira(totalEarned)} />
            <StatCard label="Withdrawn" value={formatNaira(totalWithdrawn)} />
          </div>

          <WithdrawButton canWithdraw={canWithdraw} balance={balance} bvnVerified={profile.bvn_verified} savedBank={savedBank} nextEligibleAt={nextPayout.next_eligible_at} />
        </div>

        {/* Phone/BVN banners — shown in dependency order; BVN verification
            requires phone to be verified first (see bvn-kyc.ts) */}
        {!profile.phone_verified && (
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 12,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <Shield size={18} color="var(--color-gold)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                Phone verification required
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: 12 }}>
                Verify your phone number first — this unlocks BVN verification, needed before you can withdraw.
              </div>
              <Link href="/settings/verify-phone" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontFamily: "'Syne', sans-serif" }}>
                Verify phone <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        )}

        {profile.phone_verified && !profile.bvn_verified && (
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 12,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <Shield size={18} color="var(--color-gold)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                BVN verification required
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: 12 }}>
                Only needed before you withdraw — you can keep posting and earning without it until then.
              </div>
              <Link href="/settings/verify-bvn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontFamily: "'Syne', sans-serif" }}>
                Verify BVN <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        )}

        {/* Monetisation: checklist while not yet eligible/monetised, accept
            button once all growth criteria are met */}
        {eligibility && !eligibility.is_monetised && eligibility.eligible_to_accept && (
          <AcceptMonetisationButton />
        )}
        {eligibility && eligibility.criteria && !eligibility.is_monetised && (
          <MonetisationChecklist criteria={eligibility.criteria} is_monetised={eligibility.is_monetised} eligibleToAccept={eligibility.eligible_to_accept} />
        )}

        {/* Transactions */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Transactions
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Last 20 transactions
          </p>

          {transactions.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <TrendingUp size={22} color="var(--color-text-muted)" />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>No transactions yet</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Start posting to earn ad revenue.</p>
            </div>
          ) : (
            <div>
              {transactions.map((tx: any) => <TransactionRow key={tx.id} tx={tx} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}