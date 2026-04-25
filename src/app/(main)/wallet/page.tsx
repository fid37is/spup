import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileByAuthId } from '@/lib/queries'
import { getWallet, getTransactions, getMonthlyEarnings, checkMonetisationEligibility } from '@/lib/queries'
import { formatNaira, formatNumber } from '@/lib/utils'
import { TrendingUp, ArrowDownToLine, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import WithdrawButton from './withdraw-button'

function MonetisationChecklist({ criteria, is_monetised }: { criteria: NonNullable<Awaited<ReturnType<typeof checkMonetisationEligibility>>>['criteria']; is_monetised: boolean }) {
  const items = [
    { label: '500+ followers', ...criteria.followers, display: `${formatNumber(criteria.followers.value as number)} followers` },
    { label: '90-day account', ...criteria.account_age, display: `${criteria.account_age.value} days old` },
    { label: '100+ posts', ...criteria.posts, display: `${formatNumber(criteria.posts.value as number)} posts` },
    { label: 'No violations', ...criteria.good_standing, display: criteria.good_standing.met ? 'Account in good standing' : 'Account has violations' },
    { label: 'BVN verified', ...criteria.bvn_verified, display: criteria.bvn_verified.met ? 'BVN verified' : 'BVN not verified' },
  ]
  const metCount = items.filter(i => i.met).length
  const pct = Math.round((metCount / items.length) * 100)

  return (
    <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F5F5F0' }}>
          {is_monetised ? 'Monetisation active ✓' : 'Monetisation eligibility'}
        </h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#22A861' : '#D4A017' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: '#1E1E1E', borderRadius: 2, marginBottom: 16 }}>
        <div style={{ height: '100%', borderRadius: 2, background: pct === 100 ? '#22A861' : '#D4A017', width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      {items.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < items.length - 1 ? 10 : 0 }}>
          {c.met ? <CheckCircle size={16} color="#22A861" /> : <AlertCircle size={16} color="#555" />}
          <div>
            <div style={{ fontSize: 14, color: c.met ? '#F5F5F0' : '#6A6A60', fontWeight: c.met ? 500 : 400 }}>{c.label}</div>
            <div style={{ fontSize: 12, color: c.met ? '#22A861' : '#555' }}>{c.display}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TransactionRow({ tx }: { tx: any }) {
  const isCredit = ['earning_ad', 'earning_tip', 'earning_subscription'].includes(tx.type)
  const typeLabel: Record<string, string> = { earning_ad: 'Ad revenue', earning_tip: 'Tip received', earning_subscription: 'Subscription', withdrawal: 'Withdrawal', refund: 'Refund' }
  const statusIcon = { pending: <Clock size={12} color="#D4A017" />, completed: <CheckCircle size={12} color="#22A861" />, failed: <AlertCircle size={12} color="#E53935" />, reversed: <AlertCircle size={12} color="#555" /> }[tx.status as string]

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #141414' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: isCredit ? 'rgba(26,122,74,0.15)' : 'rgba(229,57,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isCredit ? <TrendingUp size={16} color="#22A861" /> : <ArrowDownToLine size={16} color="#E53935" />}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#F5F5F0' }}>{typeLabel[tx.type] || tx.type}</div>
          <div style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
            {statusIcon} <span style={{ textTransform: 'capitalize' }}>{tx.status}</span>
            {' · '}{new Date(tx.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: isCredit ? '#22A861' : '#D0D0C8', fontFamily: "'Syne', sans-serif" }}>
        {isCredit ? '+' : '-'}{formatNaira(tx.amount_kobo)}
      </span>
    </div>
  )
}

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const [wallet, eligibility] = await Promise.all([
    getWallet(profile.id),
    checkMonetisationEligibility(profile.id),
  ])

  const { transactions } = wallet ? await getTransactions(wallet.id, 20) : { transactions: [] }
  const monthlyEarnings = wallet ? await getMonthlyEarnings(wallet.id) : { total_kobo: 0, by_source: {} }

  const balance = wallet?.balance_kobo || 0
  const totalEarned = wallet?.total_earned_kobo || 0
  const totalWithdrawn = wallet?.total_withdrawn_kobo || 0
  const canWithdraw = balance >= 100_000 && profile.bvn_verified

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'rgba(10,10,10,0.9)', borderBottom: '1px solid #1A1A1A', padding: '16px 20px' }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: '#F5F5F0' }}>Wallet</h1>
      </div>

      <div style={{ padding: 20 }}>
        {/* Balance card */}
        <div style={{ background: 'linear-gradient(135deg, #0F3020 0%, #1A1A0A 100%)', border: '1px solid rgba(26,122,74,0.3)', borderRadius: 20, padding: 24, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(26,122,74,0.08)' }} />
          <div style={{ fontSize: 12, color: '#22A861', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>AVAILABLE BALANCE</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 40, color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 6 }}>{formatNaira(balance)}</div>
          <div style={{ fontSize: 13, color: '#22A861', marginBottom: 20 }}>+{formatNaira(monthlyEarnings.total_kobo)} this month</div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
            {[{ label: 'Total earned', value: totalEarned }, { label: 'Withdrawn', value: totalWithdrawn }].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#9A9A90', fontFamily: "'Syne', sans-serif" }}>{formatNaira(value)}</div>
              </div>
            ))}
          </div>

          <WithdrawButton canWithdraw={canWithdraw} balance={balance} bvnVerified={profile.bvn_verified} />
        </div>

        {!profile.bvn_verified && (
          <div style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
            <AlertCircle size={16} color="#D4A017" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#D4A017', marginBottom: 4 }}>BVN verification required</div>
              <div style={{ fontSize: 13, color: '#9A7A10', lineHeight: 1.5 }}>Required by CBN before you can withdraw earnings.</div>
              <button style={{ marginTop: 10, background: '#D4A017', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Verify BVN</button>
            </div>
          </div>
        )}

        {eligibility && !eligibility.is_monetised && (
          <MonetisationChecklist criteria={eligibility.criteria} is_monetised={eligibility.is_monetised} />
        )}

        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#F5F5F0', marginBottom: 16 }}>Transaction history</h2>
        {transactions.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <TrendingUp size={32} color="#2A2A2A" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: '#555' }}>No transactions yet. Start posting to earn!</p>
          </div>
        ) : (
          transactions.map((tx: any) => <TransactionRow key={tx.id} tx={tx} />)
        )}
      </div>
    </div>
  )
}
