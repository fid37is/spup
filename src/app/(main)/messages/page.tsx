// src/app/(main)/messages/page.tsx

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getConversationsAction } from '@/lib/actions/messages'
import PinGate from '@/components/chat/pin-gate'
import MessagesListClient from './messages-list-client'
import { MessageSquarePlus, MessageSquare } from 'lucide-react'
import Link from 'next/link'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

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
          <MessagesListClient
            initialConversations={conversations as any}
            currentUserId={profile.id}
          />
        )}
      </div>
    </PinGate>
  )
}
