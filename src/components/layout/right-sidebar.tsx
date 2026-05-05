// src/components/layout/right-sidebar.tsx
import Link from 'next/link'
import {
  Search, BadgeCheck, Star, ArrowUpRight,
  CheckCircle2, XCircle, Shield, Wallet, MoreHorizontal, TrendingUp,
} from 'lucide-react'
import { formatNaira, formatNumber } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/server'
import SidebarFollowBtn from './sidebar-follow-btn'
import type { User } from '@/types'

// ─── Monetisation thresholds from env (never hardcoded in UI) ─────────────────
const REQUIRED_FOLLOWERS = parseInt(process.env.MONETISATION_REQUIRED_FOLLOWERS ?? '500', 10)
const REQUIRED_POSTS     = parseInt(process.env.MONETISATION_REQUIRED_POSTS     ?? '100', 10)

// ─── Types ────────────────────────────────────────────────────────────────────
interface RightSidebarProps { profile: User }

// ─── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A','#1A6A6A']
const avatarBg = (s: string) => AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length]

function Avatar({ user, size = 40 }: {
  user: Pick<User, 'username' | 'display_name' | 'avatar_url'>
  size?: number
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: user.avatar_url ? 'transparent' : avatarBg(user.username),
      overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne', sans-serif", fontWeight: 800,
      fontSize: Math.round(size * 0.35), color: 'white',
    }}>
      {user.avatar_url
        ? <img src={user.avatar_url} alt={user.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : user.display_name?.slice(0, 2).toUpperCase() ?? '??'
      }
    </div>
  )
}

function VerifiedBadge({ tier }: { tier: string }) {
  if (!tier || tier === 'none') return null
  return (
    <span title={tier === 'organisation' ? 'Verified Organisation' : 'Verified'} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
      background: tier === 'organisation' ? '#D4A017' : 'var(--color-brand)',
    }}>
      <BadgeCheck size={10} color="white" />
    </span>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 16, overflow: 'hidden', flexShrink: 0, ...style,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '14px 16px 10px' }}>
      <h3 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800,
        fontSize: 19, color: 'var(--color-text-primary)', margin: 0,
      }}>
        {title}
      </h3>
    </div>
  )
}

function ShowMore({ href }: { href: string }) {
  return (
    <Link href={href} style={{
      display: 'block', padding: '12px 16px',
      fontSize: 14, color: 'var(--color-brand)',
      textDecoration: 'none', fontWeight: 500,
    }}>
      Show more
    </Link>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, pct)
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-2)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%', width: `${clamped}%`, borderRadius: 2,
        background: clamped >= 100
          ? 'var(--color-brand)'
          : 'linear-gradient(90deg, var(--color-brand-dim), var(--color-brand))',
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

// ─── Creator Programme widget ─────────────────────────────────────────────────
function MonetisationProgress({ profile }: { profile: User }) {
  const followersVal = profile.followers_count ?? 0
  const postsVal     = profile.posts_count     ?? 0
  const bvnDone      = profile.bvn_verified    ?? false

  const followersPct = Math.min(100, Math.round((followersVal / REQUIRED_FOLLOWERS) * 100))
  const postsPct     = Math.min(100, Math.round((postsVal     / REQUIRED_POSTS)     * 100))
  const allMet       = followersPct >= 100 && postsPct >= 100 && bvnDone

  return (
    <Card>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Star size={15} fill="var(--color-gold)" stroke="none" />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--color-text-primary)' }}>
            Creator Programme
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 14px' }}>
          {allMet ? 'You qualify — apply now to start earning.' : 'Meet these criteria to start earning on Spup.'}
        </p>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Followers</span>
            <span style={{ fontWeight: 600, color: followersPct >= 100 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
              {formatNumber(followersVal)} / {formatNumber(REQUIRED_FOLLOWERS)}
            </span>
          </div>
          <ProgressBar pct={followersPct} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Posts</span>
            <span style={{ fontWeight: 600, color: postsPct >= 100 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
              {postsVal} / {REQUIRED_POSTS}
            </span>
          </div>
          <ProgressBar pct={postsPct} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
            <Shield size={13} /> BVN Verified
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: bvnDone ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
            {bvnDone ? <><CheckCircle2 size={13} /> Done</> : <><XCircle size={13} /> Required</>}
          </div>
        </div>

        <Link href="/wallet" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 16px',
          background: allMet ? 'var(--color-brand)' : 'transparent',
          border: `1.5px solid ${allMet ? 'var(--color-brand)' : 'var(--color-border)'}`,
          borderRadius: 24,
          color: allMet ? 'white' : 'var(--color-text-secondary)',
          fontSize: 14, fontWeight: 700, textDecoration: 'none',
          fontFamily: "'Syne', sans-serif",
        }}>
          <Wallet size={14} />
          {allMet ? 'Apply Now' : 'Learn More'}
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </Card>
  )
}

// ─── Creator Wallet ───────────────────────────────────────────────────────────
function CreatorWallet({ wallet }: {
  wallet: { balance_kobo: number; total_earned_kobo: number; total_withdrawn_kobo: number }
}) {
  return (
    <Card>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Wallet size={15} style={{ color: 'var(--color-brand)' }} />
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--color-text-primary)' }}>
              Creator Wallet
            </span>
          </div>
          <Link href="/wallet" style={{ fontSize: 13, color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            Manage <ArrowUpRight size={12} />
          </Link>
        </div>

        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {formatNaira(wallet.balance_kobo)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, marginBottom: 14 }}>
          Available to withdraw
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Total Earned', value: wallet.total_earned_kobo    },
            { label: 'Withdrawn',    value: wallet.total_withdrawn_kobo },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--color-surface-2)', borderRadius: 10, padding: '8px 10px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
                {formatNaira(value)}
              </div>
            </div>
          ))}
        </div>

        <Link href="/wallet" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px', background: 'var(--color-brand)', borderRadius: 24,
          color: 'white', fontSize: 14, fontWeight: 700,
          textDecoration: 'none', fontFamily: "'Syne', sans-serif",
        }}>
          <Wallet size={14} /> Withdraw Earnings
        </Link>
      </div>
    </Card>
  )
}

// ─── What's happening ─────────────────────────────────────────────────────────
function WhatsHappening({ trending }: { trending: { tag: string; posts_count: number }[] }) {
  return (
    <Card>
      <CardHeader title="What's happening" />

      {trending.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <TrendingUp size={24} color="var(--color-text-muted)" style={{ margin: '0 auto 8px', display: 'block' }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
            No trending topics yet
          </p>
        </div>
      ) : (
        trending.map(t => (
          <Link
            key={t.tag}
            href={`/explore?q=${encodeURIComponent('#' + t.tag)}`}
            className="trend-row"
            style={{
              textDecoration: 'none', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)',
                fontFamily: "'Syne', sans-serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                #{t.tag}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {formatNumber(t.posts_count)} posts
              </div>
            </div>
            <MoreHorizontal size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }} />
          </Link>
        ))
      )}

      <ShowMore href="/explore?tab=trending" />
    </Card>
  )
}

// ─── Who to Follow ────────────────────────────────────────────────────────────
function WhoToFollow({ suggested, followingIds, followerIds }: { suggested: any[]; followingIds: string[]; followerIds: string[] }) {
  if (!suggested.length) return null
  const followingSet = new Set(followingIds)
  const followerSet  = new Set(followerIds)
  return (
    <Card>
      <CardHeader title="Who to follow" />
      {suggested.map((u: any) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
          <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Avatar user={u} size={40} />
          </Link>
          <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)',
                fontFamily: "'Syne', sans-serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100,
              }}>
                {u.display_name}
              </span>
              <VerifiedBadge tier={u.verification_tier} />
              {u.is_monetised && <Star size={12} fill="var(--color-gold)" stroke="none" />}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>
              @{u.username}
            </div>
          </Link>
          <SidebarFollowBtn targetUserId={u.id} initialFollowing={followingSet.has(u.id)} followsMe={followerSet.has(u.id)} />
        </div>
      ))}
      <ShowMore href="/explore?tab=people" />
    </Card>
  )
}

// ─── Explore Topics — derived from top hashtags ───────────────────────────────
function ExploreTopics({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <Card>
      <CardHeader title="Explore Topics" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 16px 16px' }}>
        {tags.map(tag => (
          <Link key={tag} href={`/explore?q=${encodeURIComponent('#' + tag)}`} style={{
            textDecoration: 'none', padding: '6px 12px', borderRadius: 24,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}>
            #{tag}
          </Link>
        ))}
      </div>
    </Card>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default async function RightSidebar({ profile }: RightSidebarProps) {
  const admin = createAdminClient()

  const [hashtagResult, followsResult, followerResult, walletResult] = await Promise.all([
    admin
      .from('hashtags')
      .select('tag, posts_count')
      .order('posts_count', { ascending: false })
      .limit(5),
    admin
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id),
    admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', profile.id),
    profile.is_monetised
      ? admin
          .from('wallets')
          .select('balance_kobo, total_earned_kobo, total_withdrawn_kobo')
          .eq('user_id', profile.id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const trending     = (hashtagResult.data || []) as { tag: string; posts_count: number }[]
  const followingIds = (followsResult.data  || []).map((f: any) => f.following_id as string)
  const followerIds  = (followerResult.data || []).map((f: any) => f.follower_id  as string)
  const excludeIds   = [profile.id, ...followingIds]

  const { data: suggestedData } = await admin
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .order('followers_count', { ascending: false })
    .limit(5)

  const suggested = (suggestedData || []) as any[]
  const wallet    = (walletResult as any)?.data as {
    balance_kobo: number; total_earned_kobo: number; total_withdrawn_kobo: number
  } | null

  // Derive topic chips from top 6 hashtags beyond the trending 5
  const { data: topicData } = await admin
    .from('hashtags')
    .select('tag')
    .order('posts_count', { ascending: false })
    .range(5, 11)
  const topicTags = (topicData || []).map((h: any) => h.tag as string)

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      padding: '16px 0 16px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
      overflowY: 'auto', position: 'sticky', top: 0, height: '100dvh',
      scrollbarWidth: 'none', alignItems: 'stretch',
    }}>

      {/* Search */}
      <Link href="/explore" style={{
        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 24,
        background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border-light)',
        flexShrink: 0,
      }}>
        <Search size={15} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
          Search Spup
        </span>
      </Link>

      {profile.is_monetised && wallet && <CreatorWallet wallet={wallet} />}
      {!profile.is_monetised && <MonetisationProgress profile={profile} />}
      <WhatsHappening trending={trending} />
      <WhoToFollow suggested={suggested} followingIds={followingIds} followerIds={followerIds} />
      {topicTags.length > 0 && <ExploreTopics tags={topicTags} />}

      {/* Footer */}
      <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 2, paddingBottom: 12, flexShrink: 0 }}>
        <Link href="/terms"          style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</Link>
        {' · '}
        <Link href="/privacy"        style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</Link>
        {' · '}
        <Link href="/content-policy" style={{ color: 'inherit', textDecoration: 'none' }}>Content Policy</Link>
        {' · '}
        <Link href="/contact"        style={{ color: 'inherit', textDecoration: 'none' }}>Contact</Link>
        <br />
        © {new Date().getFullYear()} Spup Technologies Limited
      </div>
    </aside>
  )
}