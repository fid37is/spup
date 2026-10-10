'use client'

// src/components/chat/conversation-row.tsx
//
// One row of the chat list. Shared by the live list (messages-list-client.tsx)
// and the route's loading state (messages/loading.tsx) so the cached list shown
// instantly while the page loads looks exactly like the real one.

import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import MessageStatusIcon from '@/components/chat/message-status'
import { isEncrypted } from '@/lib/chat-crypto'
import { decryptedPreviews, type ChatListConversation } from '@/lib/chat-list-cache'
import { formatRelativeTime } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/language-context'

const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']

interface Props {
  conv: ChatListConversation
  hiddenRow?: boolean
  onUnhide?: (id: string) => void
}

export default function ConversationRow({ conv, hiddenRow = false, onUnhide }: Props) {
  const { t } = useTranslation()
  const other = conv.other
  const initials = other?.display_name?.slice(0, 2).toUpperCase() ?? '??'
  const color = AVATAR_COLORS[(other?.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  const raw = conv.last_message_preview
  const unread = conv.unread_count > 0

  // Encryption is an implementation detail - it's only ever surfaced inside an
  // open conversation. The list never mentions it: a preview we can't decrypt
  // (yet) just falls back to a plain, generic label.
  const decrypted = isEncrypted(raw) ? decryptedPreviews.get(raw!) : undefined
  const preview = decrypted !== undefined
    ? decrypted
    : isEncrypted(raw) || raw === '[Encrypted message]'
      ? t('chat.message_label')
      : raw === 'Message deleted'
        ? t('chat.message_deleted')
        : (raw ?? t('chat.no_messages_yet'))

  // Ticks next to the preview when the newest message is mine (sent / delivered / read).
  const showTick = conv.last_message_mine && !!conv.last_message_status && raw !== 'Message deleted'

  return (
    <Link href={`/messages/${conv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        transition: 'background 0.1s',
        background: unread ? 'var(--color-surface-2)' : 'transparent',
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
            : initials}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{
              fontSize: 15, fontWeight: unread ? 700 : 500,
              color: 'var(--color-text-primary)',
              fontFamily: "'Syne', sans-serif",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {other?.display_name}
            </span>
            <span style={{
              fontSize: 11, flexShrink: 0, marginLeft: 8,
              color: unread ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              fontWeight: unread ? 700 : 400,
            }}>
              {conv.last_message_at ? formatRelativeTime(conv.last_message_at) : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
              fontSize: 13,
              color: unread ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: unread ? 600 : 400,
            }}>
              {showTick && <MessageStatusIcon status={conv.last_message_status!} size={15} />}
              {raw === 'Message deleted' && <Trash2 size={12} style={{ flexShrink: 0, opacity: 0.7 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</span>
            </span>
            {hiddenRow && onUnhide && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onUnhide(conv.id) }}
                style={{ flexShrink: 0, marginLeft: 8, background: 'none', border: '1px solid var(--color-border)', borderRadius: 14, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                Unhide
              </button>
            )}
            {unread && (
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
}
