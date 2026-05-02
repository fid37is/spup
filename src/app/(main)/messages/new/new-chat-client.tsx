'use client'

// src/app/(main)/messages/new/new-chat-client.tsx

import { useState, useTransition } from 'react'
import { getOrCreateConversationAction } from '@/lib/actions/messages'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Loader2, UserPlus } from 'lucide-react'
import Link from 'next/link'

const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']

interface FollowUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
}

export default function NewChatClient({ following }: { following: FollowUser[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [startingId, setStartingId] = useState<string | null>(null)

  const filtered = following.filter(u =>
    u.display_name.toLowerCase().includes(query.toLowerCase()) ||
    u.username.toLowerCase().includes(query.toLowerCase())
  )

  function startChat(userId: string) {
    setStartingId(userId)
    startTransition(async () => {
      const result = await getOrCreateConversationAction(userId)
      if ('conversationId' in result) {
        router.push(`/messages/${result.conversationId}`)
      }
    })
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <Link href="/messages" style={{ color: 'var(--color-text-primary)', display: 'flex', flexShrink: 0 }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-text-primary)', margin: 0 }}>
          New Chat
        </h1>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{
            position: 'absolute', left: 14, top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-secondary)', pointerEvents: 'none',
          }} />
          <input
            type="search"
            placeholder="Search people you follow…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              background: 'var(--color-surface-2)',
              border: '1.5px solid var(--color-border-light)',
              borderRadius: 24,
              padding: '10px 16px 10px 40px',
              color: 'var(--color-text-primary)',
              fontSize: 14,
              outline: 'none',
              fontFamily: "'DM Sans', sans-serif",
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Empty following state */}
      {following.length === 0 && (
        <div style={{ padding: '80px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <UserPlus size={24} color="var(--color-text-secondary)" />
          </div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            Follow people first
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            You can only chat with people you follow. Start following some creators to message them.
          </p>
        </div>
      )}

      {/* No search results */}
      {following.length > 0 && filtered.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            No one found matching &ldquo;{query}&rdquo;
          </p>
        </div>
      )}

      {/* User list */}
      {filtered.map(u => {
        const initials = u.display_name?.slice(0, 2).toUpperCase() ?? '??'
        const color = AVATAR_COLORS[(u.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
        const loading = isPending && startingId === u.id

        return (
          <button
            key={u.id}
            onClick={() => startChat(u.id)}
            disabled={isPending}
            style={{
              width: '100%', background: 'none', border: 'none',
              borderBottom: '1px solid var(--color-border)',
              padding: '14px 20px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending && startingId !== u.id ? 0.5 : 1,
              textAlign: 'left',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              background: u.avatar_url ? 'transparent' : color,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
            }}>
              {u.avatar_url
                ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  fontSize: 15, fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  fontFamily: "'Syne', sans-serif",
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {u.display_name}
                </span>
                {u.verification_tier !== 'none' && (
                  <span style={{
                    width: 15, height: 15, borderRadius: '50%',
                    background: u.verification_tier === 'gold' ? '#D4A017' : 'var(--color-brand)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, color: 'white', flexShrink: 0,
                  }}>✓</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                @{u.username}
              </div>
            </div>

            {/* Loading spinner */}
            {loading && <Loader2 size={18} color="var(--color-brand)" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
          </button>
        )
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}