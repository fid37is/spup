// src/app/(main)/notifications/notifications-client.tsx
'use client'

import { useState, useEffect, useRef, useCallback, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Heart, MessageCircle, Repeat2, User, AtSign, DollarSign, Star,
  CheckCheck, Loader, Quote, ShieldCheck, PackageCheck, Scale, Gavel, ShieldAlert,
  Settings, MoreHorizontal, Trash2, BellOff,
} from 'lucide-react'
import {
  getNotificationsAction,
  getNewPostPaneAction,
  markNotificationsReadAction,
  markAllNotificationsReadAction,
  deleteNotificationAction,
  type NotificationItem,
  type NotificationTab,
  type NewPostUser,
} from '@/lib/actions/notifications'
import { disablePostNotificationsAction } from '@/lib/actions/notification-settings'
import { createBrowserClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import VerifiedBadge from '@/components/ui/verified-badge'
import { NotifAvatar } from '@/components/notifications/avatar'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface TabState {
  items: NotificationItem[]
  cursor: string | null
  hasMore: boolean
  loaded: boolean
}

interface PaneState { users: NewPostUser[]; totalPosts: number; unread: number }

interface Group {
  key: string
  items: NotificationItem[]   // newest first
  unread: boolean
}

interface Props {
  userId: string
  username: string
  initialItems: NotificationItem[]
  initialCursor: string | null
  initialPane: PaneState
}

const TABS: { key: NotificationTab; label: string }[] = [
  { key: 'all',      label: 'All'      },
  { key: 'priority', label: 'Priority' },
  { key: 'mentions', label: 'Mentions' },
]

const EMPTY: Record<NotificationTab, { title: string; body: string }> = {
  all:      { title: 'No notifications yet',       body: 'When someone likes, replies to, or follows you, it will show up here.' },
  priority: { title: 'Nothing in Priority yet',    body: 'Turn on the bell on someone\u2019s profile and their posts and activity will show up here first.' },
  mentions: { title: 'Nobody has mentioned you',   body: 'When someone replies to you or @mentions you, it will show up here.' },
}

// X palette for the big left-hand icons
const PINK = '#F91880', GREEN = '#00BA7C', PURPLE = '#794BC4', BLUE = '#1D9BF0', GOLD = '#F59E0B', RED = '#EF4444'

/* ── Grouping ────────────────────────────────────────────────────────────── */
// "A, B and 3 others liked your post" - likes/reposts on the same post, and
// followers within a day of each other, collapse into one row.

const GROUPABLE = new Set(['post_like', 'post_repost', 'comment_like', 'new_follower'])
const DAY = 86_400_000

function groupItems(items: NotificationItem[]): Group[] {
  const groups: Group[] = []
  const open = new Map<string, Group>()

  for (const n of items) {
    if (!GROUPABLE.has(n.type)) {
      groups.push({ key: n.id, items: [n], unread: !n.is_read })
      continue
    }
    const base = n.type === 'new_follower' ? 'new_follower' : `${n.type}:${n.entity_id}`
    const existing = open.get(base)
    const withinDay = existing
      ? Math.abs(new Date(existing.items[0].created_at).getTime() - new Date(n.created_at).getTime()) < DAY
      : false

    if (existing && (n.type !== 'new_follower' || withinDay)) {
      existing.items.push(n)
      if (!n.is_read) existing.unread = true
    } else {
      const g: Group = { key: n.id, items: [n], unread: !n.is_read }
      open.set(base, g)
      groups.push(g)
    }
  }
  return groups
}

/* ── Copy + navigation ───────────────────────────────────────────────────── */

function uniqueActors(g: Group) {
  const seen = new Set<string>()
  const out: NonNullable<NotificationItem['actor']>[] = []
  for (const n of g.items) {
    if (n.actor && !seen.has(n.actor.id)) { seen.add(n.actor.id); out.push(n.actor) }
  }
  return out
}

function verbFor(n: NotificationItem): string {
  const target = n.post?.is_reply ? 'reply' : 'post'
  switch (n.type) {
    case 'new_follower':          return 'followed you'
    case 'post_like':             return `liked your ${target}`
    case 'comment_like':          return 'liked your reply'
    case 'post_repost':           return `reposted your ${target}`
    case 'post_comment':          return `replied to your ${target}`
    case 'post_quote':            return 'quoted your post'
    case 'mention':               return 'mentioned you'
    case 'tip_received':          return 'sent you a tip'
    case 'subscription_new':      return 'subscribed to you'
    case 'new_message':           return 'sent you a message'
    case 'escrow_hold_received':  return 'paid for your item - funds are held in escrow'
    case 'escrow_delivered':      return 'marked your order as delivered'
    case 'escrow_disputed':       return 'opened a dispute on your order'
    case 'escrow_proposal':       return 'proposed a resolution'
    default:                      return 'sent you a notification'
  }
}

// Notifications with no actor / a fixed sentence.
function standaloneText(n: NotificationItem): string | null {
  switch (n.type) {
    case 'earning_milestone':     return n.metadata?.message ?? 'You hit an earnings milestone'
    case 'monetisation_approved': return 'Your account has been approved for monetisation \uD83C\uDF89'
    case 'escrow_released':       return 'Escrow funds have been released to you'
    case 'escrow_escalated':      return 'Your dispute was escalated to Spup support'
    case 'system':                return n.metadata?.message ?? 'Update from Spup'
    default:                      return null
  }
}

const ESCROW = new Set([
  'escrow_hold_received', 'escrow_delivered', 'escrow_released',
  'escrow_disputed', 'escrow_proposal', 'escrow_escalated',
])

/** Where a notification goes when you tap it. Post notifications open the post. */
function hrefFor(g: Group, username: string): string | null {
  const n = g.items[0]
  if (n.type === 'new_message' && n.entity_id) return `/messages/${n.entity_id}`
  if (ESCROW.has(n.type) && n.entity_id) return `/wallet/orders/${n.entity_id}`
  if (['tip_received', 'subscription_new', 'earning_milestone', 'monetisation_approved'].includes(n.type)) return '/wallet'
  if (n.type === 'new_follower') {
    if (g.items.length > 1) return `/connections/${username}?tab=followers`
    return n.actor ? `/user/${n.actor.username}` : null
  }
  // A reply / quote opens the reply / quote itself; everything else opens the post.
  const postId = n.metadata?.reply_id ?? n.entity_id
  if (n.entity_type === 'post' && postId) return `/post/${postId}`
  return null
}

function iconFor(type: string): ReactNode {
  const s = 26
  switch (type) {
    case 'post_like':
    case 'comment_like':          return <Heart size={s} color={PINK} fill={PINK} strokeWidth={0} />
    case 'post_repost':           return <Repeat2 size={s} color={GREEN} strokeWidth={2.4} />
    case 'new_follower':          return <User size={s} color={PURPLE} fill={PURPLE} strokeWidth={0} />
    case 'post_comment':          return <MessageCircle size={s} color={BLUE} fill={BLUE} strokeWidth={0} />
    case 'new_message':           return <MessageCircle size={s} color={BLUE} fill={BLUE} strokeWidth={0} />
    case 'mention':               return <AtSign size={s} color={BLUE} strokeWidth={2.6} />
    case 'post_quote':            return <Quote size={s} color={PURPLE} fill={PURPLE} strokeWidth={0} />
    case 'new_post':              return <Bell size={s} color="var(--color-brand)" fill="var(--color-brand)" strokeWidth={0} />
    case 'tip_received':
    case 'escrow_released':       return <DollarSign size={s} color={GOLD} strokeWidth={2.6} />
    case 'subscription_new':
    case 'earning_milestone':
    case 'monetisation_approved': return <Star size={s} color={GOLD} fill={GOLD} strokeWidth={0} />
    case 'escrow_hold_received':  return <ShieldCheck size={s} color="var(--color-brand)" strokeWidth={2.2} />
    case 'escrow_delivered':      return <PackageCheck size={s} color={GOLD} strokeWidth={2.2} />
    case 'escrow_disputed':       return <ShieldAlert size={s} color={RED} strokeWidth={2.2} />
    case 'escrow_proposal':       return <Scale size={s} color={GOLD} strokeWidth={2.2} />
    case 'escrow_escalated':      return <Gavel size={s} color={RED} strokeWidth={2.2} />
    default:                      return <Bell size={s} color="var(--color-text-muted)" fill="var(--color-text-muted)" strokeWidth={0} />
  }
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function ActorName({ actor }: { actor: NonNullable<NotificationItem['actor']> }) {
  return (
    <Link
      href={`/user/${actor.username}`}
      onClick={e => e.stopPropagation()}
      style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}
      className="notif-name"
    >
      {actor.display_name}
      {actor.verification_tier && actor.verification_tier !== 'none' && (
        <span style={{ display: 'inline-flex', marginLeft: 3, verticalAlign: 'middle' }}>
          <VerifiedBadge tier={actor.verification_tier} size={14} />
        </span>
      )}
    </Link>
  )
}

function NameList({ actors }: { actors: NonNullable<NotificationItem['actor']>[] }) {
  if (actors.length === 0) return <>Someone</>
  if (actors.length === 1) return <ActorName actor={actors[0]} />
  if (actors.length === 2) return <><ActorName actor={actors[0]} /> and <ActorName actor={actors[1]} /></>
  return <><ActorName actor={actors[0]} /> and {actors.length - 1} others</>
}

function Thumb({ url, isVideo }: { url: string | null; isVideo: boolean }) {
  if (!url) return null
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
      border: '1px solid var(--color-border)', background: 'var(--color-surface-3)', position: 'relative',
    }}>
      <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {isVideo && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)', color: 'white', fontSize: 16,
        }}>{'\u25B6'}</div>
      )}
    </div>
  )
}

function RowMenu({ items }: { items: { label: string; icon: ReactNode; danger?: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button
        aria-label="More"
        onClick={() => setOpen(o => !o)}
        className="notif-icon-btn"
        style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent',
          color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 34, right: 0, zIndex: 41, minWidth: 220,
            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 4, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}>
            {items.map(it => (
              <button
                key={it.label}
                onClick={() => { setOpen(false); it.onClick() }}
                className="notif-menu-item"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontFamily: "'DM Sans', sans-serif", textAlign: 'left', borderRadius: 10,
                  color: it.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                }}
              >
                {it.icon}{it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── One row ─────────────────────────────────────────────────────────────── */

function NotificationRow({
  group, username, onOpen, onDelete, onTurnOffPosts,
}: {
  group: Group
  username: string
  onOpen: (g: Group) => void
  onDelete: (g: Group) => void
  onTurnOffPosts: (actorId: string, actorUsername: string) => void
}) {
  const first = group.items[0]
  const actors = uniqueActors(group)
  const href = hrefFor(group, username)
  const fixed = actors.length === 0 ? standaloneText(first) : null

  // Content shown under the sentence. Replies / mentions / quotes show what
  // was actually written (in normal text colour); likes / reposts / new posts
  // show the post they refer to (muted), like X.
  const contentPost =
    first.type === 'post_comment' || first.type === 'post_quote' ? (first.reply ?? first.post)
    : first.post
  const isAuthored = ['post_comment', 'mention', 'post_quote', 'new_post'].includes(first.type)
  const body = contentPost?.body?.trim() || ''
  const showAvatars = actors.length > 0 && first.type !== 'new_message'

  const menuItems = [
    ...(first.type === 'new_post' && first.actor
      ? [{
          label: `Turn off notifications for @${first.actor.username}`,
          icon: <BellOff size={17} />,
          onClick: () => onTurnOffPosts(first.actor!.id, first.actor!.username),
        }]
      : []),
    { label: 'Delete notification', icon: <Trash2 size={17} />, danger: true, onClick: () => onDelete(group) },
  ]

  return (
    <div
      role={href ? 'link' : 'button'}
      tabIndex={0}
      onClick={() => onOpen(group)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(group) }}
      className="notif-row"
      data-unread={group.unread ? '1' : '0'}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '12px 12px 14px 16px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer', position: 'relative',
      }}
    >
      {/* Big type icon */}
      <div style={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 2 }}>
        {iconFor(first.type)}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {showAvatars && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {actors.slice(0, 8).map(a => (
              <Link
                key={a.id}
                href={`/user/${a.username}`}
                onClick={e => e.stopPropagation()}
                aria-label={a.display_name}
                style={{ display: 'flex' }}
              >
                <NotifAvatar name={a.display_name} url={a.avatar_url} size={32} />
              </Link>
            ))}
            {actors.length > 8 && (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>+{actors.length - 8}</span>
            )}
          </div>
        )}

        <p style={{
          margin: 0, fontSize: 15, lineHeight: 1.4,
          color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif",
          wordBreak: 'break-word',
        }}>
          {first.type === 'new_post'
            ? <>Recent post from <NameList actors={actors} /></>
            : fixed
              ? fixed
              : <><NameList actors={actors} />{' '}{verbFor(first)}</>}
          <span style={{ color: 'var(--color-text-muted)' }}> {'\u00B7'} {formatRelativeTime(first.created_at)}</span>
        </p>

        {body && (
          <p style={{
            margin: '4px 0 0', fontSize: 15, lineHeight: 1.4,
            color: isAuthored ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontFamily: "'DM Sans', sans-serif", wordBreak: 'break-word',
            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          }}>
            {body}
          </p>
        )}
        {!body && contentPost?.media_thumb && (
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--color-text-muted)' }}>
            {contentPost.media_type === 'video' ? 'Video' : 'Photo'}
          </p>
        )}
      </div>

      {/* Thumbnail + menu */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexShrink: 0 }}>
        <Thumb url={contentPost?.media_thumb ?? null} isVideo={contentPost?.media_type === 'video'} />
        <RowMenu items={menuItems} />
      </div>
    </div>
  )
}

/* ── "New posts" pane (first section) ────────────────────────────────────── */

function NewPostsPane({ pane, onOpen }: { pane: PaneState; onOpen: () => void }) {
  if (pane.users.length === 0) return null
  const users = pane.users
  const latest = users[0].latest_at

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      className="notif-row"
      data-unread={pane.unread > 0 ? '1' : '0'}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '12px 16px 14px',
        borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
      }}
    >
      <div style={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 2 }}>
        {iconFor('new_post')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {users.slice(0, 5).map(u => (
            <NotifAvatar key={u.id} name={u.display_name} url={u.avatar_url} size={36} />
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: 'var(--color-text-primary)' }}>
          New post notifications for{' '}
          <strong style={{ fontWeight: 700 }}>
            {users[0].display_name}
            {users[0].verification_tier && users[0].verification_tier !== 'none' && (
              <span style={{ display: 'inline-flex', marginLeft: 3, verticalAlign: 'middle' }}>
                <VerifiedBadge tier={users[0].verification_tier} size={14} />
              </span>
            )}
          </strong>
          {users.length === 2 && <> and <strong style={{ fontWeight: 700 }}>{users[1].display_name}</strong></>}
          {users.length > 2 && <> and {users.length - 1} others</>}
          <span style={{ color: 'var(--color-text-muted)' }}> {'\u00B7'} {formatRelativeTime(latest)}</span>
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--color-text-muted)' }}>
          {pane.totalPosts} new post{pane.totalPosts === 1 ? '' : 's'}
          {pane.unread > 0 ? ` \u00B7 ${pane.unread} unread` : ''}
        </p>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function NotificationsClient({ userId, username, initialItems, initialCursor, initialPane }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<NotificationTab>('all')
  const [tabs, setTabs] = useState<Record<NotificationTab, TabState>>({
    all:      { items: initialItems, cursor: initialCursor, hasMore: !!initialCursor, loaded: true },
    priority: { items: [], cursor: null, hasMore: false, loaded: false },
    mentions: { items: [], cursor: null, hasMore: false, loaded: false },
  })
  const [pane, setPane] = useState<PaneState>(initialPane)
  const [loading, startLoad] = useTransition()
  const [, startMutate] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const tabRef = useRef(tab); tabRef.current = tab
  const tabsRef = useRef(tabs); tabsRef.current = tabs
  const current = tabs[tab]

  const flash = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  const patchTab = useCallback((t: NotificationTab, fn: (s: TabState) => TabState) => {
    setTabs(prev => ({ ...prev, [t]: fn(prev[t]) }))
  }, [])

  /* Switch tab (fetch the first page the first time it's opened) */
  function switchTab(next: NotificationTab) {
    if (next === tab) return
    setTab(next)
    if (!tabsRef.current[next].loaded) {
      startLoad(async () => {
        const r = await getNotificationsAction(undefined, 30, next)
        patchTab(next, () => ({ items: r.notifications, cursor: r.nextCursor, hasMore: !!r.nextCursor, loaded: true }))
      })
    }
    window.scrollTo({ top: 0 })
  }

  /* Infinite scroll */
  const loadMore = useCallback(() => {
    const t = tabRef.current
    const s = tabsRef.current[t]
    if (loading || !s.hasMore || !s.cursor) return
    startLoad(async () => {
      const r = await getNotificationsAction(s.cursor!, 30, t)
      patchTab(t, prev => {
        const seen = new Set(prev.items.map(n => n.id))
        return {
          ...prev,
          items: [...prev.items, ...r.notifications.filter(n => !seen.has(n.id))],
          cursor: r.nextCursor, hasMore: !!r.nextCursor,
        }
      })
    })
  }, [loading, patchTab])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  /* Realtime: a new notification lands -> pull the fresh top of the list + pane */
  useEffect(() => {
    if (!userId) return
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, async () => {
        const t = tabRef.current
        const [fresh, freshPane] = await Promise.all([
          getNotificationsAction(undefined, 30, t),
          getNewPostPaneAction(),
        ])
        setPane(freshPane)
        patchTab(t, prev => {
          const seen = new Set(prev.items.map(n => n.id))
          const added = fresh.notifications.filter(n => !seen.has(n.id))
          return added.length ? { ...prev, items: [...added, ...prev.items] } : prev
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, patchTab])

  /* Actions */
  const unreadCount =
    tabs.all.items.filter(n => !n.is_read).length + pane.unread

  function markGroupRead(g: Group) {
    const ids = g.items.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    setTabs(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next) as NotificationTab[]) {
        next[k] = { ...next[k], items: next[k].items.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n) }
      }
      return next
    })
    startMutate(async () => { await markNotificationsReadAction(ids) })
  }

  function openGroup(g: Group) {
    markGroupRead(g)
    const href = hrefFor(g, username)
    if (href) router.push(href)
  }

  function markAllRead() {
    setTabs(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next) as NotificationTab[]) {
        next[k] = { ...next[k], items: next[k].items.map(n => ({ ...n, is_read: true })) }
      }
      return next
    })
    setPane(p => ({ ...p, unread: 0 }))
    startMutate(async () => { await markAllNotificationsReadAction() })
  }

  function deleteGroup(g: Group) {
    const ids = new Set(g.items.map(n => n.id))
    setTabs(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next) as NotificationTab[]) {
        next[k] = { ...next[k], items: next[k].items.filter(n => !ids.has(n.id)) }
      }
      return next
    })
    startMutate(async () => { await Promise.all([...ids].map(id => deleteNotificationAction(id))) })
  }

  function turnOffPosts(actorId: string, actorUsername: string) {
    startMutate(async () => {
      const r = await disablePostNotificationsAction(actorId)
      flash('error' in r ? 'Could not update. Try again.' : `Post notifications off for @${actorUsername}`)
    })
  }

  const groups = groupItems(current.items)
  const showPane = tab !== 'mentions' && pane.users.length > 0
  const isEmpty = current.loaded && groups.length === 0 && !showPane && !loading

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <style>{`
        .notif-row { background: transparent; transition: background 0.12s; }
        .notif-row[data-unread="1"] { background: var(--color-brand-muted); }
        .notif-row:hover { background: var(--color-surface-2) !important; }
        .notif-row:focus-visible { outline-offset: -2px; }
        .notif-name:hover { text-decoration: underline !important; }
        .notif-icon-btn:hover { background: var(--color-surface-2) !important; }
        .notif-menu-item:hover { background: var(--color-surface-2) !important; }
        .notif-tab { transition: background 0.12s; }
        .notif-tab:hover { background: var(--color-surface-2); }
        @media (max-width: 767px) {
          .notif-title-row { justify-content: center !important; }
        }
        @keyframes notifSpin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Sticky header: title + gear, then All / Priority / Mentions */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)',
      }}>
        <div
          className="notif-title-row"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            padding: '0 16px', height: 53, position: 'relative',
          }}
        >
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20,
            color: 'var(--color-text-primary)', margin: 0,
          }}>
            Notifications
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'absolute', right: 8 }}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                aria-label="Mark all as read"
                title="Mark all as read"
                className="notif-icon-btn"
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'transparent',
                  color: 'var(--color-text-primary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CheckCheck size={20} />
              </button>
            )}
            <Link
              href="/notifications/settings"
              aria-label="Notification settings"
              title="Notification settings"
              className="notif-icon-btn"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                color: 'var(--color-text-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Settings size={21} />
            </Link>
          </div>
        </div>

        <div role="tablist" style={{ display: 'flex' }}>
          {TABS.map(({ key, label }) => {
            const active = tab === key
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                className="notif-tab"
                style={{
                  flex: 1, height: 52, background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 15,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                <span style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                  {label}
                  {active && (
                    <span style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, height: 4,
                      borderRadius: 4, background: 'var(--color-brand)',
                    }} />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* First section: people who just posted */}
      {showPane && <NewPostsPane pane={pane} onOpen={() => router.push('/notifications/new-posts')} />}

      {/* List */}
      {groups.map(g => (
        <NotificationRow
          key={g.key}
          group={g}
          username={username}
          onOpen={openGroup}
          onDelete={deleteGroup}
          onTurnOffPosts={turnOffPosts}
        />
      ))}

      {/* Skeleton while a tab loads for the first time */}
      {loading && !current.loaded && Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: 40, height: 26, borderRadius: 8, background: 'var(--color-surface-3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-surface-3)', marginBottom: 10 }} />
            <div style={{ height: 13, width: '70%', borderRadius: 4, background: 'var(--color-surface-3)' }} />
          </div>
        </div>
      ))}

      {isEmpty && (
        <div style={{ padding: '72px 32px', textAlign: 'center' }}>
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24,
            color: 'var(--color-text-primary)', margin: '0 0 8px',
          }}>
            {EMPTY[tab].title}
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 340, fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            {EMPTY[tab].body}
          </p>
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loading && current.loaded && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader size={20} color="var(--color-brand)" style={{ animation: 'notifSpin 0.8s linear infinite' }} />
        </div>
      )}

      {!current.hasMore && groups.length > 0 && !loading && (
        <div style={{ padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-faint)' }}>You&apos;re all caught up</p>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 60,
          background: 'var(--color-brand)', color: 'white', borderRadius: 24,
          padding: '10px 18px', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
