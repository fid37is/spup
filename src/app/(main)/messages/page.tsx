// src/app/(main)/messages/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getConversationsAction } from '@/lib/actions/messages'
import { formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import PinGate from '@/components/chat/pin-gate'
import { MessageSquarePlus, MessageSquare } from 'lucide-react'

const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const conversations = await getConversationsAction()

  return (
    <PinGate>
      <div>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', margin: 0 }}>
            Chat
          </h1>
          <Link href="/messages/new" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--color-brand)', color: 'white',
            borderRadius: 20, padding: '8px 16px',
            textDecoration: 'none', fontSize: 13,
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
          }}>
            <MessageSquarePlus size={14} />
            New chat
          </Link>
        </div>

        {conversations.length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <MessageSquare size={28} color="var(--color-text-secondary)" />
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              No chats yet
            </h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              Start a conversation with someone you follow
            </p>
            <Link href="/messages/new" style={{
              background: 'var(--color-brand)', color: 'white',
              borderRadius: 20, padding: '11px 24px',
              textDecoration: 'none', fontSize: 14,
              fontFamily: "'Syne', sans-serif", fontWeight: 700,
            }}>
              Start a chat
            </Link>
          </div>
        ) : (
          conversations.map((conv: any) => {
            const other = conv.other
            const initials = other?.display_name?.slice(0, 2).toUpperCase() ?? '??'
            const color = AVATAR_COLORS[(other?.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
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
                    position: 'relative',
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
                        fontSize: 13, color: conv.unread_count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: conv.unread_count > 0 ? 600 : 400,
                      }}>
                        {conv.last_message_preview ?? 'No messages yet'}
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
          })
        )}
      </div>
    </PinGate>
  )
}