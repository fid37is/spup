// src/app/(main)/notifications/notifications-client.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Heart, MessageCircle, Repeat2, UserPlus,
  ThumbsUp, AtSign, DollarSign, Star, CheckCheck, Loader2,
} from 'lucide-react'
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
  getNotificationsAction,
} from '@/lib/actions/notifications'
import { formatRelativeTime } from '@/lib/utils'

type ActorShape = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
}

// Supabase returns joined relations as arrays — we normalize to single object
type RawNotification = {
  id: string
  type: string
  entity_id: string | null
  entity_type: string | null
  metadata: Record<string, any>
  is_read: boolean
  created_at: string
  actor: ActorShape[] | ActorShape | null
}

type Notification = Omit<RawNotification, 'actor'> & {
  actor: ActorShape | null
}

function normalizeNotification(n: RawNotification): Notification {
  return {
    ...n,
    actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : n.actor,
  }
}

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A']

function getAvatarColor(name: string) {
  return AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
}

function NotifIcon({ type }: { type: string }) {
  const size = 14
  const map: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    new_follower:          { icon: <UserPlus size={size} />,      bg: '#1A7A4A22', color: '#1A7A4A' },
    post_like:             { icon: <ThumbsUp size={size} />,      bg: 'var(--color-brand)22', color: 'var(--color-brand)' },
    post_comment:          { icon: <MessageCircle size={size} />, bg: '#A855F722', color: '#A855F7' },
    post_repost:           { icon: <Repeat2 size={size} />,       bg: '#10B98122', color: '#10B981' },
    comment_like:          { icon: <Heart size={size} />,         bg: '#EF444422', color: '#EF4444' },
    mention:               { icon: <AtSign size={size} />,        bg: '#378ADD22', color: '#378ADD' },
    tip_received:          { icon: <DollarSign size={size} />,    bg: '#F59E0B22', color: '#F59E0B' },
    subscription_new:      { icon: <Star size={size} />,          bg: '#F59E0B22', color: '#F59E0B' },
    earning_milestone:     { icon: <Star size={size} />,          bg: '#F59E0B22', color: '#F59E0B' },
    monetisation_approved: { icon: <CheckCheck size={size} />,    bg: '#10B98122', color: '#10B981' },
    system:                { icon: <Bell size={size} />,           bg: 'var(--color-surface-3)', color: 'var(--color-text-muted)' },
  }
  const cfg = map[type] ?? map.system
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: cfg.bg, color: cfg.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'absolute', bottom: -2, right: -2,
      border: '2px solid var(--color-bg)',
    }}>
      {cfg.icon}
    </div>
  )
}

function notifText(n: Notification): string {
  const name = n.actor?.display_name ?? 'Someone'
  switch (n.type) {
    case 'new_follower':          return `${name} started following you`
    case 'post_like':             return `${name} liked your post`
    case 'post_comment':          return `${name} replied to your post`
    case 'post_repost':           return `${name} reposted your post`
    case 'comment_like':          return `${name} liked your reply`
    case 'mention':               return `${name} mentioned you`
    case 'tip_received':          return `${name} sent you a tip`
    case 'subscription_new':      return `${name} subscribed to you`
    case 'earning_milestone':     return n.metadata?.message ?? 'You hit an earnings milestone'
    case 'monetisation_approved': return 'Your account has been approved for monetisation 🎉'
    case 'system':                return n.metadata?.message ?? 'System notification'
    default:                      return 'New notification'
  }
}

function notifHref(n: Notification): string | null {
  if (n.entity_type === 'post' && n.entity_id) return `/post/${n.entity_id}`
  if (n.type === 'new_follower' && n.actor?.username) return `/user/${n.actor.username}`
  return null
}

export default function NotificationsClient({
  initialNotifications,
  initialCursor,
}: {
  initialNotifications: RawNotification[]
  initialCursor: string | null
}) {
  const [notifications, setNotifications] = useState<Notification[]>(
    (initialNotifications as RawNotification[]).map(normalizeNotification)
  )
  const [cursor, setCursor] = useState(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const unreadCount = notifications.filter(n => !n.is_read).length

  function handleMarkRead(id: string) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    )
    startTransition(async () => {
      await markNotificationReadAction(id)
    })
  }

  function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    startTransition(async () => {
      await markAllNotificationsReadAction()
    })
  }

  async function handleLoadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const { notifications: more, nextCursor } = await getNotificationsAction(cursor)
    setNotifications(prev => [...prev, ...(more as RawNotification[]).map(normalizeNotification)])
    setCursor(nextCursor)
    setLoadingMore(false)
  }

  function handleClick(n: Notification) {
    if (!n.is_read) handleMarkRead(n.id)
    const href = notifHref(n)
    if (href) router.push(href)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 20, color: 'var(--color-text-primary)', margin: 0,
          }}>
            Notifications
          </h1>
          {unreadCount > 0 && (
            <div style={{
              minWidth: 20, height: 20, borderRadius: 10,
              background: 'var(--color-brand)', color: 'white',
              fontSize: 11, fontWeight: 700, padding: '0 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: '7px 14px', cursor: 'pointer',
              fontSize: 13, color: 'var(--color-text-secondary)',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <div style={{ padding: '80px 20px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Bell size={28} color="var(--color-text-muted)" />
          </div>
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8,
          }}>
            No notifications yet
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
            When someone likes, replies, or follows you, it'll show up here.
          </p>
        </div>
      )}

      {/* List */}
      {notifications.map(n => {
        const actor = n.actor
        const initials = actor?.display_name?.slice(0, 2).toUpperCase() ?? '??'
        const avatarColor = getAvatarColor(actor?.display_name ?? '')
        const href = notifHref(n)

        return (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border)',
              background: n.is_read ? 'transparent' : 'var(--color-surface-2)',
              cursor: href || !n.is_read ? 'pointer' : 'default',
              transition: 'background 0.12s',
              position: 'relative',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--color-surface-2)' }}
          >
            {/* Unread dot */}
            {!n.is_read && (
              <div style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand)',
                flexShrink: 0,
              }} />
            )}

            {/* Avatar + icon badge */}
            <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: actor?.avatar_url ? 'transparent' : avatarColor,
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800,
                fontSize: 15, color: 'white',
              }}>
                {actor?.avatar_url
                  ? <img src={actor.avatar_url} alt={actor.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
                }
              </div>
              <NotifIcon type={n.type} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <p style={{
                  margin: 0, fontSize: 14, lineHeight: 1.45,
                  color: 'var(--color-text-primary)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: n.is_read ? 400 : 600,
                }}>
                  {actor && (
                    <Link
                      href={`/user/${actor.username}`}
                      onClick={e => e.stopPropagation()}
                      style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}
                    >
                      {actor.display_name}
                      {actor.verification_tier !== 'none' && (
                        <span style={{
                          display: 'inline-block', fontSize: 9,
                          background: 'var(--color-brand)', color: 'white',
                          padding: '1px 4px', borderRadius: 4, fontWeight: 700,
                          marginLeft: 4, verticalAlign: 'middle',
                        }}>✓</span>
                      )}
                    </Link>
                  )}{' '}
                  {/* Strip the actor name from the full text since we render it as a link above */}
                  {notifText(n).replace(actor?.display_name ?? '\x00', '').trimStart()}
                </p>
                <span style={{
                  fontSize: 11, color: 'var(--color-text-muted)',
                  fontFamily: "'DM Sans', sans-serif", flexShrink: 0, marginTop: 2,
                }}>
                  {formatRelativeTime(n.created_at)}
                </span>
              </div>

              {/* Metadata preview — e.g. post body snippet */}
              {n.metadata?.post_body && (
                <p style={{
                  margin: '5px 0 0', fontSize: 13,
                  color: 'var(--color-text-muted)',
                  fontFamily: "'DM Sans', sans-serif",
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', maxWidth: '100%',
                }}>
                  "{n.metadata.post_body}"
                </p>
              )}
            </div>
          </div>
        )
      })}

      {/* Load more */}
      {cursor && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'none', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: '10px 24px', cursor: loadingMore ? 'default' : 'pointer',
              fontSize: 14, color: 'var(--color-text-secondary)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {loadingMore
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</>
              : 'Load more'
            }
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}