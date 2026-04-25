'use client'

import { useState, useEffect, useTransition } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { markNotificationReadAction, markAllNotificationsReadAction } from '@/lib/actions'
import { formatRelativeTime } from '@/lib/utils'
import { Heart, UserPlus, MessageCircle, Repeat2, DollarSign, Bell } from 'lucide-react'

const ICONS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  new_follower:      { icon: UserPlus,      color: '#1A7A4A', label: 'followed you' },
  post_like:         { icon: Heart,         color: '#E24B4A', label: 'liked your post' },
  post_comment:      { icon: MessageCircle, color: '#378ADD', label: 'replied to your post' },
  post_repost:       { icon: Repeat2,       color: '#22A861', label: 'reposted your post' },
  tip_received:      { icon: DollarSign,    color: '#D4A017', label: 'sent you a tip' },
  mention:           { icon: MessageCircle, color: '#378ADD', label: 'mentioned you' },
  earning_milestone: { icon: DollarSign,    color: '#D4A017', label: 'Earnings milestone reached' },
  system:            { icon: Bell,          color: '#9A9A90', label: 'Spup update' },
}

function NotifItem({ notif, onRead }: { notif: any; onRead: (id: string) => void }) {
  const cfg = ICONS[notif.type] || ICONS.system
  const Icon = cfg.icon
  const actor = notif.actor
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A']

  return (
    <div
      onClick={() => !notif.is_read && onRead(notif.id)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 20px', borderBottom: '1px solid #141414',
        background: notif.is_read ? 'transparent' : 'rgba(26,122,74,0.04)',
        cursor: notif.is_read ? 'default' : 'pointer',
        transition: 'background 0.15s', position: 'relative',
      }}
    >
      {!notif.is_read && (
        <div style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#22A861' }} />
      )}

      <div style={{ position: 'relative', flexShrink: 0 }}>
        {actor ? (
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: colors[actor.display_name.charCodeAt(0) % colors.length],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: 'white',
          }}>
            {actor.display_name.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#181818', border: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={cfg.color} />
          </div>
        )}
        {actor && (
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0A0A0A' }}>
            <Icon size={9} color="white" />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, color: '#D0D0C8', lineHeight: 1.5, marginBottom: 4 }}>
          {actor && <span style={{ fontWeight: 700, color: '#F5F5F0', fontFamily: "'Syne', sans-serif" }}>{actor.display_name} </span>}
          <span style={{ color: '#9A9A90' }}>{cfg.label}</span>
        </p>
        <span style={{ fontSize: 12, color: '#3A3A35' }}>{formatRelativeTime(notif.created_at)}</span>
      </div>
    </div>
  )
}

interface NotificationsListProps {
  initialNotifications: any[]
  initialCursor: string | null
  userId: string
}

export default function NotificationsList({ initialNotifications, initialCursor, userId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [, startTransition] = useTransition()
  const supabase = createBrowserClient()

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    startTransition(async () => { await markNotificationReadAction(id) })
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    startTransition(async () => { await markAllNotificationsReadAction() })
  }

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    const channel = supabase
      .channel(`notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new as any, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (notifications.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <Bell size={40} color="#2A2A2A" style={{ marginBottom: 16 }} />
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#F5F5F0', marginBottom: 8 }}>No notifications yet</h3>
        <p style={{ fontSize: 14, color: '#555' }}>When people engage with your posts, you&apos;ll see it here.</p>
      </div>
    )
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D' }}>
          <span style={{ fontSize: 13, color: '#9A9A90' }}>
            <span style={{ color: '#22A861', fontWeight: 700 }}>{unreadCount}</span> unread
          </span>
          <button onClick={markAllRead} style={{ background: 'none', border: 'none', fontSize: 13, color: '#22A861', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Mark all read
          </button>
        </div>
      )}
      {notifications.map(n => <NotifItem key={n.id} notif={n} onRead={markRead} />)}
    </div>
  )
}