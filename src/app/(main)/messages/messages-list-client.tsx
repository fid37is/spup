'use client'

// src/app/(main)/messages/messages-list-client.tsx
// Wraps the conversation list with realtime updates + unread badge refresh.

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { getConversationsAction } from '@/lib/actions/messages'
import { formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'

const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']

interface Conversation {
  id: string
  other: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string } | null
  last_message_preview: string | null
  last_message_at: string | null
  unread_count: number
}

interface Props {
  initialConversations: Conversation[]
  currentUserId: string
}

export default function MessagesListClient({ initialConversations, currentUserId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const supabase = useRef(createBrowserClient())

  // ── Realtime: refresh list when any message arrives ────────────────────────
  useEffect(() => {
    const sb = supabase.current

    async function refresh() {
      const fresh = await getConversationsAction()
      setConversations(fresh as Conversation[])
    }

    const channel = sb
      .channel('conversations-list')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => refresh())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => refresh())
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [currentUserId])

  if (conversations.length === 0) return null

  return (
    <div>
      {conversations.map((conv) => {
        const other    = conv.other
        const initials = other?.display_name?.slice(0, 2).toUpperCase() ?? '??'
        const color    = AVATAR_COLORS[(other?.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
        const preview  = conv.last_message_preview === '[Encrypted message]'
          ? '🔒 Encrypted message'
          : (conv.last_message_preview ?? 'No messages yet')

        return (
          <Link key={conv.id} href={`/messages/${conv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border)',
              transition: 'background 0.1s',
              background: conv.unread_count > 0 ? 'var(--color-surface-2)' : 'transparent',
            }}>
              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                background: other?.avatar_url ? 'transparent' : color,
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: 'white',
              }}>
                {other?.avatar_url
                  ? <img src={other.avatar_url} alt={other.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{
                    fontSize: 15, fontWeight: conv.unread_count > 0 ? 700 : 500,
                    color: 'var(--color-text-primary)',
                    fontFamily: "'Syne', sans-serif",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {other?.display_name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                    {conv.last_message_at ? formatRelativeTime(conv.last_message_at) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 13,
                    color: conv.unread_count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: conv.unread_count > 0 ? 600 : 400,
                  }}>
                    {preview}
                  </span>
                  {conv.unread_count > 0 && (
                    <div style={{
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: 'var(--color-brand)', color: 'white',
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px', flexShrink: 0, marginLeft: 8,
                    }}>
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
