// src/app/(main)/notifications/notifications-list.tsx
'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { markNotificationReadAction, markAllNotificationsReadAction, getNotificationsAction } from '@/lib/actions'
import { formatRelativeTime } from '@/lib/utils'
import { Heart, UserPlus, MessageCircle, Repeat2, DollarSign, Bell, Loader } from 'lucide-react'

/* ── Config ──────────────────────────────────────────────────────────────── */
const TYPES: Record<string, { icon: React.ElementType; color: string; label: string; href?: (n: any) => string }> = {
  new_follower:      { icon: UserPlus,      color: 'var(--color-brand)',        label: 'followed you',            href: n => `/user/${n.actor?.username}` },
  post_like:         { icon: Heart,         color: '#E24B4A',                   label: 'liked your post',         href: n => n.entity_id ? `/post/${n.entity_id}` : '#' },
  post_comment:      { icon: MessageCircle, color: '#378ADD',                   label: 'replied to your post',    href: n => n.entity_id ? `/post/${n.entity_id}` : '#' },
  post_repost:       { icon: Repeat2,       color: 'var(--color-brand)',        label: 'reposted your post',      href: n => n.entity_id ? `/post/${n.entity_id}` : '#' },
  tip_received:      { icon: DollarSign,    color: 'var(--color-gold)',         label: 'sent you a tip',          href: () => '/wallet' },
  mention:           { icon: MessageCircle, color: '#378ADD',                   label: 'mentioned you',           href: n => n.entity_id ? `/post/${n.entity_id}` : '#' },
  earning_milestone: { icon: DollarSign,    color: 'var(--color-gold)',         label: 'Earnings milestone',      href: () => '/wallet' },
  system:            { icon: Bell,          color: 'var(--color-text-muted)',   label: 'Spup update' },
}

/* ── Avatar ──────────────────────────────────────────────────────────────── */
function NotifAvatar({ actor, cfg }: { actor: any; cfg: typeof TYPES[string] }) {
  const Icon = cfg.icon
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']

  if (!actor) {
    return (
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={cfg.color} />
      </div>
    )
  }

  const bg = colors[actor.display_name?.charCodeAt(0) % colors.length]

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: 42, height: 42, borderRadius: '50%', overflow: 'hidden',
        background: actor.avatar_url ? 'transparent' : bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
      }}>
        {actor.avatar_url
          ? <img src={actor.avatar_url} alt={actor.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : actor.display_name?.slice(0, 2).toUpperCase()
        }
      </div>
      {/* Type badge */}
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: 18, height: 18, borderRadius: '50%',
        background: cfg.color,
        border: '2px solid var(--color-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={9} color="white" />
      </div>
    </div>
  )
}

/* ── Single notification row ─────────────────────────────────────────────── */
function NotifItem({ notif, onRead }: { notif: any; onRead: (id: string) => void }) {
  const router = useRouter()
  // Supabase returns joined relations as arrays — normalize to single object
  const normalized = { ...notif, actor: Array.isArray(notif.actor) ? (notif.actor[0] ?? null) : notif.actor }
  const cfg = TYPES[normalized.type] || TYPES.system
  const href = cfg.href?.(normalized)

  function handleClick() {
    if (!notif.is_read) onRead(notif.id)
    if (href && href !== '#') router.push(href)
  }

  return (
    <div
      onClick={handleClick}
      role={href ? 'button' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: notif.is_read ? 'transparent' : 'var(--color-surface-2)',
        cursor: href ? 'pointer' : 'default',
        transition: 'background 0.1s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (href) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = notif.is_read ? 'transparent' : 'var(--color-surface-2)' }}
    >
      {/* Unread dot */}
      {!notif.is_read && (
        <div style={{
          position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
          width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand)', flexShrink: 0,
        }} />
      )}

      <NotifAvatar actor={normalized.actor} cfg={cfg} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, marginBottom: 3 }}>
          {normalized.actor && (
            <span style={{ fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
              {normalized.actor.display_name}{''}
            </span>
          )}
          <span style={{ color: 'var(--color-text-secondary)' }}>{cfg.label}</span>
        </p>
        {notif.metadata?.post_body && (
          <p style={{
            fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.45,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            marginBottom: 3,
          }}>
            "{normalized.metadata.post_body}"
          </p>
        )}
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {formatRelativeTime(notif.created_at)}
        </span>
      </div>
    </div>
  )
}

/* ── List ────────────────────────────────────────────────────────────────── */
interface NotificationsListProps {
  initialNotifications: any[]
  initialCursor: string | null
  userId: string
}

export default function NotificationsList({ initialNotifications, initialCursor, userId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [hasMore, setHasMore] = useState(!!initialCursor)
  const [isPending, startTransition] = useTransition()
  const [, startMarkTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()

  const unreadCount = notifications.filter(n => !n.is_read).length

  /* ── Load more ──────────────────────────────────────────────────────────── */
  const loadMore = useCallback(() => {
    if (isPending || !hasMore || !cursor) return
    startTransition(async () => {
      const result = await getNotificationsAction(cursor)
      const { notifications: more, nextCursor } = result
      setNotifications(prev => {
        const seen = new Set(prev.map((n: any) => n.id))
        return [...prev, ...more.filter((n: any) => !seen.has(n.id))]
      })
      setCursor(nextCursor)
      setHasMore(!!nextCursor)
    })
  }, [isPending, hasMore, cursor])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      e => { if (e[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  /* ── Realtime ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, async payload => {
        // Fetch the full notification with actor join since realtime gives raw row
        const { data } = await supabase
          .from('notifications')
          .select(`
            id, type, entity_id, entity_type, metadata, is_read, created_at,
            actor:users!notifications_actor_id_fkey(id, username, display_name, avatar_url, verification_tier)
          `)
          .eq('id', payload.new.id)
          .single()
        if (data) setNotifications(prev => [data, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line

  /* ── Actions ────────────────────────────────────────────────────────────── */
  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    startMarkTransition(async () => { await markNotificationReadAction(id) })
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    startMarkTransition(async () => { await markAllNotificationsReadAction() })
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */
  if (notifications.length === 0 && !isPending) {
    return (
      <div style={{ padding: '64px 20px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--color-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Bell size={24} color="var(--color-text-muted)" />
        </div>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          No notifications yet
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          When people like, reply to, or follow you, it shows up here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      {unreadCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 20px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-2)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{unreadCount}</span> unread
          </span>
          <button
            onClick={markAllRead}
            style={{
              background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--color-brand)', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", padding: '4px 0',
            }}
          >
            Mark all read
          </button>
        </div>
      )}

      {/* List */}
      {notifications.map(n => (
        <NotifItem key={n.id} notif={n} onRead={markRead} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {isPending && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader size={20} color="var(--color-brand)" style={{ animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!hasMore && notifications.length > 0 && (
        <div style={{ padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>You&apos;re all caught up</p>
        </div>
      )}
    </div>
  )
}