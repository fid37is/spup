// src/app/(main)/post/[id]/nested-replies.tsx
'use client'

// Renders the replies-to-a-reply that page.tsx fetches one level deep
// (`reply.nested`), matching spup-nested-replies-prototype.html exactly:
// one continuous trunk line starting at the PARENT comment's own avatar and
// running down through every visible nested reply, with each individual
// reply getting its own rounded elbow branching off that trunk into its
// own avatar - not a flat line sitting behind identical-looking cards
// (that was the earlier, wrong version). The first (oldest) reply is
// always visible; additional ones sit behind a "Show N more replies"
// toggle, all still inline on this page - never a separate navigation.

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import ReplyToReply from './reply-to-reply'

interface NestedRepliesProps {
  nested: any[]
  viewer: { display_name: string; avatar_url: string | null }
  currentUserId?: string
  postId: string
}

// Geometry, pixel-matched to this app's actual PostCard (42px avatar, 16px
// left padding) rather than the prototype's larger demo proportions:
const PARENT_AVATAR_CENTER = 37   // 16px card padding + half of 42px avatar
const NESTED_INDENT = 44          // left margin applied to each nested row
const NESTED_AVATAR_CENTER = NESTED_INDENT + PARENT_AVATAR_CENTER // = 81

export default function NestedReplies({ nested, viewer, currentUserId, postId }: NestedRepliesProps) {
  const [expanded, setExpanded] = useState(false)

  if (!nested || nested.length === 0) return null

  const [first, ...rest] = nested
  const visible = expanded ? nested : [first]

  return (
    <div style={{ position: 'relative', paddingTop: 2, paddingBottom: 4 }}>
      {/* Trunk - one continuous line reaching up into the parent comment's
          own avatar above, running down through every visible reply here.
          The parent's own border is suppressed (see page.tsx) so nothing
          visually separates the two - they read as one unit, exactly like
          the prototype's note: "no more line/panel edge between a comment
          and its own replies." The upward reach is a fixed estimate (same
          approach the prototype itself uses, not a measured height) since
          the parent's actual height varies with its content. */}
      <div style={{
        position: 'absolute', left: PARENT_AVATAR_CENTER, width: 2,
        top: -40, bottom: 2,
        background: 'var(--color-border)',
      }} />

      {visible.map(n => (
        <div key={n.id} style={{ position: 'relative', marginLeft: NESTED_INDENT }}>
          {/* Elbow - branches off the trunk into this specific reply's
              avatar. Rounded corner, matching the prototype's connector. */}
          <div style={{
            position: 'absolute',
            left: PARENT_AVATAR_CENTER - NESTED_INDENT, top: 14,
            width: NESTED_AVATAR_CENTER - PARENT_AVATAR_CENTER, height: 21,
            borderLeft: '2px solid var(--color-border)',
            borderBottom: '2px solid var(--color-border)',
            borderBottomLeftRadius: 14,
          }} />
          <ReplyToReply reply={n} viewer={viewer} currentUserId={currentUserId} postId={postId} />
        </div>
      ))}

      {rest.length > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginLeft: NESTED_AVATAR_CENTER - 6, marginBottom: 4,
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