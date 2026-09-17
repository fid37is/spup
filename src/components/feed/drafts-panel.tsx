'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Clock, FileText, Trash2, Loader2, ImageIcon } from 'lucide-react'
import { getScheduledPostsAction, cancelScheduledPostAction } from '@/lib/actions'
import { loadDrafts, deleteDraft, type LocalDraft } from '@/lib/local-drafts'
import { formatScheduled } from './schedule-picker'
import { useToast } from '@/components/layout/toast'

interface ScheduledPost {
  id: string
  body: string | null
  created_at: string
  is_selling: boolean
  media: Array<{ id: string }>
}

interface DraftsPanelProps {
  userId: string
  onClose: () => void
  onEditDraft: (draft: LocalDraft) => void
}

type Tab = 'scheduled' | 'drafts'

export default function DraftsPanel({ userId, onClose, onEditDraft }: DraftsPanelProps) {
  const [tab, setTab] = useState<Tab>('scheduled')
  const [drafts, setDrafts] = useState<LocalDraft[]>([])
  const [scheduled, setScheduled] = useState<ScheduledPost[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const { success: toastSuccess, error: toastError } = useToast()

  useEffect(() => {
    setDrafts(loadDrafts(userId))
    startTransition(async () => {
      const { posts } = await getScheduledPostsAction()
      setScheduled(posts as ScheduledPost[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function handleDeleteDraft(id: string) {
    deleteDraft(userId, id)
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  function handleCancelScheduled(id: string) {
    setCancellingId(id)
    startTransition(async () => {
      const result = await cancelScheduledPostAction(id)
      setCancellingId(null)
      if ('error' in result && result.error) { toastError(result.error); return }
      setScheduled(prev => (prev || []).filter(p => p.id !== id))
      toastSuccess('Scheduled post cancelled')
    })
  }

  return createPortal(
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 64,
      }}
    >
      <div style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        width: '100%', maxWidth: 480, margin: '0 16px',
        maxHeight: 'calc(100vh - 96px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
            Drafts
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: 4, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', flexShrink: 0 }}>
          <TabBtn label="Scheduled" active={tab === 'scheduled'} onClick={() => setTab('scheduled')} />
          <TabBtn label="Unsent drafts" active={tab === 'drafts'} onClick={() => setTab('drafts')} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 12px' }}>
          {tab === 'scheduled' ? (
            scheduled === null ? (
              <LoadingRow />
            ) : scheduled.length === 0 ? (
              <EmptyState icon={<Clock size={22} />} text="No scheduled posts yet" />
            ) : (
              scheduled.map(post => (
                <div key={post.id} style={rowStyle}>
                  <Link
                    href={`/post/${post.id}`}
                    onClick={onClose}
                    style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-brand)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={13} />
                      {formatScheduled(post.created_at)}
                    </div>
                    <RowPreview body={post.body} mediaCount={post.media?.length || 0} />
                  </Link>
                  <button
                    onClick={() => handleCancelScheduled(post.id)}
                    disabled={cancellingId === post.id}
                    title="Cancel scheduled post"
                    style={iconBtnStyle}
                  >
                    {cancellingId === post.id ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Trash2 size={16} />}
                  </button>
                </div>
              ))
            )
          ) : (
            drafts.length === 0 ? (
              <EmptyState icon={<FileText size={22} />} text="Anything you close without sending will show up here" />
            ) : (
              drafts.map(draft => (
                <div key={draft.id} style={rowStyle}>
                  <button
                    onClick={() => onEditDraft(draft)}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  >
                    <RowPreview body={draft.body} mediaCount={draft.media.length} />
                  </button>
                  <button
                    onClick={() => handleDeleteDraft(draft.id)}
                    title="Delete draft"
                    style={iconBtnStyle}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--color-brand-muted)' : 'none',
        color: active ? 'var(--color-brand)' : 'var(--color-text-muted)',
        border: 'none', borderRadius: 8, padding: '7px 12px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        fontFamily: "'Syne', sans-serif",
      }}
    >
      {label}
    </button>
  )
}

function RowPreview({ body, mediaCount }: { body: string | null; mediaCount: number }) {
  return (
    <p style={{
      fontSize: 13.5, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4,
      display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {body?.trim() || (mediaCount > 0 ? 'Media post' : 'Empty draft')}
      </span>
      {mediaCount > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, color: 'var(--color-text-faint)', fontSize: 12 }}>
          <ImageIcon size={12} />{mediaCount}
        </span>
      )}
    </p>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--color-text-faint)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{icon}</div>
      <p style={{ fontSize: 13, margin: 0 }}>{text}</p>
    </div>
  )
}

function LoadingRow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--color-text-faint)' }} />
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 8px', borderRadius: 10,
}

const iconBtnStyle: React.CSSProperties = {
  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-faint)', display: 'flex', padding: 6, borderRadius: 8,
}