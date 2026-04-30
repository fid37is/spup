// src/components/layout/right-sidebar.tsx

import Link from 'next/link'
import {
  Search, BadgeCheck, Star, ArrowUpRight,
  CheckCircle2, XCircle, Shield, Globe, Tv2, Cpu,
  ShoppingBag, Briefcase, Music2, Wallet, MoreHorizontal, Flag,
} from 'lucide-react'
import { formatNaira, formatNumber } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import SidebarFollowBtn from './sidebar-follow-btn'
import type { User } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_TRENDING = [
  { tag: 'SuperEagles',  posts_count: 14200, category: 'Trending in Nigeria' },
  { tag: 'LagosTech',    posts_count: 9800,  category: 'Technology' },
  { tag: 'CBNPolicy',    posts_count: 7400,  category: 'Finance' },
  { tag: 'Afrobeats',    posts_count: 6100,  category: 'Music' },
  { tag: 'NaijaFashion', posts_count: 4400,  category: 'Lifestyle' },
]

const AVATAR_COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A','#1A6A6A']
const avatarBg = (s: string) => AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length]

const TOPIC_CHIPS = [
  { label: 'Football',  q: 'football',  Icon: Globe      },
  { label: 'Afrobeats', q: 'afrobeats', Icon: Music2      },
  { label: 'Tech',      q: 'tech',      Icon: Cpu         },
  { label: 'Politics',  q: 'politics',  Icon: Briefcase   },
  { label: 'Business',  q: 'business',  Icon: ShoppingBag },
  { label: 'Nollywood', q: 'nollywood', Icon: Tv2         },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface RightSidebarProps {
  profile: User
  walletBalance: number
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Avatar({ user, size = 40 }: {
  user: Pick<User, 'username' | 'display_name' | 'avatar_url'>
  size?: number
}) {
  const initials = user.display_name?.slice(0, 2).toUpperCase() ?? '??'
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
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatar_url} alt={user.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  )
}

function VerifiedBadge({ tier }: { tier: string }) {
  if (!tier || tier === 'none') return null
  return (
    <span title={tier === 'organisation' ? 'Verified Organisation' : 'Verified'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        background: tier === 'organisation' ? '#D4A017' : 'var(--color-brand)',
      }}>
      <BadgeCheck size={10} color="white" />
    </span>
  )
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      overflow: 'hidden',
      flexShrink: 0,
      ...style,
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

// ─── Creator Programme widget ─────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const met = pct >= 100
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-2)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 2,
        background: met ? 'var(--color-brand)' : 'linear-gradient(90deg, var(--color-brand-dim), var(--color-brand))',
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function MonetisationProgress({ eligibility }: {
  eligibility: {
    followers: { value: number; required: number }
    posts: { value: number; required: number }
    bvn_verified: { value: boolean }
  }
}) {
  const followersPct = Math.min(100, Math.round((eligibility.followers.value / eligibility.followers.required) * 100))
  const postsPct    = Math.min(100, Math.round((eligibility.posts.value    / eligibility.posts.required)    * 100))
  const allMet      = followersPct >= 100 && postsPct >= 100 && eligibility.bvn_verified.value

  return (
    <Card>
      <div style={{ padding: '14px 16px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Star size={15} fill="var(--color-gold)" stroke="none" />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--color-text-primary)' }}>
            Creator Programme
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 14px' }}>
          {allMet ? 'You qualify — apply now to start earning.' : 'Meet these criteria to start earning on Spup.'}
        </p>

        {/* Followers */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Followers</span>
            <span style={{ fontWeight: 600, color: followersPct >= 100 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
              {formatNumber(eligibility.followers.value)} / {formatNumber(eligibility.followers.required)}
            </span>
          </div>
          <ProgressBar pct={followersPct} />
        </div>

        {/* Posts */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Posts</span>
            <span style={{ fontWeight: 600, color: postsPct >= 100 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
              {eligibility.posts.value} / {eligibility.posts.required}
            </span>
          </div>
          <ProgressBar pct={postsPct} />
        </div>

        {/* BVN */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
            <Shield size={13} />
            BVN Verified
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: eligibility.bvn_verified.value ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
            {eligibility.bvn_verified.value
              ? <><CheckCircle2 size={13} /> Done</>
              : <><XCircle size={13} /> Required</>
            }
          </div>
        </div>

        {/* CTA */}
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

// ─── Creator Wallet widget (monetised users) ──────────────────────────────────

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
            { label: 'Total Earned', value: wallet.total_earned_kobo },
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
          padding: '9px',
          background: 'var(--color-brand)', borderRadius: 24,
          color: 'white', fontSize: 14, fontWeight: 700,
          textDecoration: 'none', fontFamily: "'Syne', sans-serif",
        }}>
          <Wallet size={14} />
          Withdraw Earnings
        </Link>
      </div>
    </Card>
  )
}

// ─── What's happening (Trending) ──────────────────────────────────────────────

function WhatsHappening({ trending }: { trending: any[] }) {
  return (
    <Card>
      <CardHeader title="What's happening" />
      {trending.map((t: any) => (
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
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Flag size={11} />
              {t.category ?? 'Trending in Nigeria'}
            </div>
            <div style={{
              fontSize: 15, fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontFamily: "'Syne', sans-serif",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              #{t.tag}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {formatNumber(t.posts_count as number)} posts
            </div>
          </div>
          <MoreHorizontal size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }} />
        </Link>
      ))}
      <ShowMore href="/explore?tab=trending" />
    </Card>
  )
}

// ─── Who to Follow ────────────────────────────────────────────────────────────

function WhoToFollow({ suggested }: { suggested: any[] }) {
  if (!suggested.length) return null
  return (
    <Card>
      <CardHeader title="Who to follow" />

      {suggested.map((u: any) => (
        <div key={u.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
        }}>
          {/* Avatar */}
          <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Avatar user={u} size={40} />
          </Link>

          {/* Name + handle */}
          <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontFamily: "'Syne', sans-serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 100,
              }}>
                {u.display_name}
              </span>
              <VerifiedBadge tier={u.verification_tier} />
              {u.is_monetised && (
                <Star size={12} fill="var(--color-gold)" stroke="none" />
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>
              @{u.username}
            </div>
          </Link>

          {/* Follow button */}
          <SidebarFollowBtn targetUserId={u.id} />
        </div>
      ))}

      <ShowMore href="/explore?tab=people" />
    </Card>
  )
}

// ─── Explore Topics ───────────────────────────────────────────────────────────

function ExploreTopics() {
  return (
    <Card>
      <CardHeader title="Explore Topics" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 16px 16px' }}>
        {TOPIC_CHIPS.map(({ label, q, Icon }) => (
          <Link key={q} href={`/explore?q=${encodeURIComponent(q)}`} style={{
            textDecoration: 'none', padding: '6px 12px', borderRadius: 24,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap',
          }}>
            <Icon size={12} />
            {label}
          </Link>
        ))}
      </div>
    </Card>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default async function RightSidebar({ profile }: RightSidebarProps) {
  const supabase = await createClient()

  // All DB reads in parallel
  const [hashtagResult, followsResult, walletResult] = await Promise.all([
    supabase
      .from('hashtags')
      .select('tag, posts_count, category')
      .order('posts_count', { ascending: false })
      .limit(5),
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id),
    profile.is_monetised
      ? supabase
          .from('wallets')
          .select('balance_kobo, total_earned_kobo, total_withdrawn_kobo')
          .eq('user_id', profile.id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const trending =
    hashtagResult.data && hashtagResult.data.length > 0
      ? hashtagResult.data
      : FALLBACK_TRENDING

  const followingIds = (followsResult.data || []).map((f: { following_id: string }) => f.following_id)
  const excludeIds   = [profile.id, ...followingIds]

  let suggestedQuery = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(5)

  if (excludeIds.length > 0) {
    suggestedQuery = suggestedQuery.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data: suggestedData } = await suggestedQuery
  const suggested = (suggestedData || []) as any[]

  const wallet = (walletResult as any)?.data as {
    balance_kobo: number; total_earned_kobo: number; total_withdrawn_kobo: number
  } | null

  const eligibility = !profile.is_monetised ? {
    followers:    { value: profile.followers_count ?? 0, required: 500 },
    posts:        { value: profile.posts_count ?? 0,     required: 100 },
    bvn_verified: { value: profile.bvn_verified ?? false },
  } : null

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      padding: '16px 0 16px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
      overflowY: 'auto', position: 'sticky', top: 0, height: '100dvh',
      scrollbarWidth: 'none', alignItems: 'stretch',
    }}>

      {/* Search bar */}
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

      {/* Creator Wallet (monetised) */}
      {profile.is_monetised && wallet && <CreatorWallet wallet={wallet} />}

      {/* Creator Programme progress (non-monetised) */}
      {eligibility && <MonetisationProgress eligibility={eligibility} />}

      {/* What's happening */}
      <WhatsHappening trending={trending} />

      {/* Who to follow */}
      <WhoToFollow suggested={suggested} />

      {/* Explore Topics */}
      <ExploreTopics />

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