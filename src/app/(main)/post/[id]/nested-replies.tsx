// src/app/(main)/post/[id]/nested-replies.tsx
'use client'

// Renders the replies-to-a-reply that page.tsx already fetches one level
// deep (`reply.nested`). Previously every one of these rendered unconditionally
// under its parent reply with no way to collapse them - fine for one or two,
// but a heavily-replied-to comment turned into a wall of cards. This matches
// the familiar "show N more replies" pattern used across social apps: the
// first (oldest) reply is always visible, the rest sit behind a toggle - all
// still inline, on this same post detail page, never a separate navigation.

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import ReplyToReply from './reply-to-reply'

interface NestedRepliesProps {
  nested: any[]
  viewer: { display_name: string; avatar_url: string | null }
  currentUserId?: string
  postId: string
}

export default function NestedReplies({ nested, viewer, currentUserId, postId }: NestedRepliesProps) {
  const [expanded, setExpanded] = useState(false)

  if (!nested || nested.length === 0) return null

  const [first, ...rest] = nested
  const visible = expanded ? nested : [first]

  return (
    <div style={{ position: 'relative' }}>
      {/* Trunk line - runs behind every visible nested reply, under the
          avatar column, tying them visually to the comment they belong to. */}
      <div style={{ position: 'absolute', left: 36, top: 0, bottom: 0, width: 2, background: 'var(--color-border)' }} />

      {visible.map(n => (
        <div key={n.id} style={{ position: 'relative', marginLeft: 44 }}>
          <ReplyToReply reply={n} viewer={viewer} currentUserId={currentUserId} postId={postId} />
        </div>
      ))}

      {rest.length > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginLeft: 60, marginBottom: 12,
            background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
            color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide replies' : `Show ${rest.length} more ${rest.length === 1 ? 'reply' : 'replies'}`}
        </button>
      )}
    </div>
  )
}