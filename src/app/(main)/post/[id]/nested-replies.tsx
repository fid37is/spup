// src/app/(main)/post/[id]/nested-replies.tsx
'use client'

// Renders the replies-to-a-reply that page.tsx now fetches to full depth
// (`reply.nested`, recursively), matching spup-nested-replies-prototype.html:
// one continuous trunk line starting at the PARENT comment's own avatar and
// running down through every visible nested reply, with each individual
// reply getting its own rounded elbow branching off that trunk into its
// own avatar - not a flat line sitting behind identical-looking cards
// (that was the earlier, wrong version). The first (oldest) reply is
// always visible; additional ones sit behind a "Show N more replies"
// toggle, all still inline on this page - never a separate navigation.
//
// This component is RECURSIVE: a reply-to-a-reply can itself have replies,
// at any depth, not just one level down. Every depth reuses the exact same
// geometry constants below rather than compounding an offset per level -
// that works because each level re-establishes its own position:relative
// origin via the marginLeft wrapper it renders inside, so the trunk/elbow
// pattern is self-similar all the way down: depth 3 looks, locally, exactly
// like depth 1 did.

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
const CARD_PADDING = 16
const PARENT_AVATAR_CENTER = 37   // 16px card padding + half of 42px avatar
const NESTED_INDENT = 48          // left margin applied to each nested row
// Where the elbow's horizontal stroke should actually stop: the LEFT EDGE
// of the nested avatar circle, not its center. The previous version ended
// the stroke at the avatar's center - widening NESTED_INDENT alone (the
// earlier attempted fix) never fixed the overlap because a longer line
// still finished in the same wrong place, just after a longer run-up.
const NESTED_AVATAR_EDGE = NESTED_INDENT + CARD_PADDING  // = 64
// Used only to center the "Show N more" toggle visually under the avatar
// column - not for the connector geometry itself.
const NESTED_AVATAR_CENTER = NESTED_INDENT + PARENT_AVATAR_CENTER // = 85

export default function NestedReplies({ nested, viewer, currentUserId, postId }: NestedRepliesProps) {
  const [expanded, setExpanded] = useState(false)

  if (!nested || nested.length === 0) return null

  const [first, ...rest] = nested
  const visible = expanded ? nested : [first]

  return (
    <div style={{ position: 'relative', paddingTop: 2, paddingBottom: 4 }}>
      {/* Trunk - one continuous line reaching up into the parent comment's
          own avatar above, running down through every visible reply here.
          The parent's own border is suppressed (see hideBorder below and
          in page.tsx) so nothing visually separates the two - they read as
          one unit, exactly like the prototype's note: "no more line/panel
          edge between a comment and its own replies." The upward reach is
          a fixed estimate (same approach the prototype itself uses, not a
          measured height) since the parent's actual height varies with its
          content. */}
      <div style={{
        position: 'absolute', left: PARENT_AVATAR_CENTER, width: 2,
        top: -40, bottom: 2,
        background: 'var(--color-border)',
      }} />

      {visible.map(n => {
        const hasChildren = !!(n.nested && n.nested.length > 0)
        return (
          <div key={n.id} style={{ position: 'relative', marginLeft: NESTED_INDENT }}>
            {/* Elbow - branches off the trunk and stops right at the LEFT
                EDGE of this reply's avatar (not its center - see
                NESTED_AVATAR_EDGE above), so it reads as touching the
                circle's rim rather than cutting across it. z-index left
                at the implicit stacking default (0) - the row below is
                explicitly raised above it so paint order can't put this
                behind... in front of... the avatar again. */}
            <div style={{
              position: 'absolute',
              left: PARENT_AVATAR_CENTER - NESTED_INDENT, top: 14,
              width: NESTED_AVATAR_EDGE - PARENT_AVATAR_CENTER, height: 21,
              borderLeft: '2px solid var(--color-border)',
              borderBottom: '2px solid var(--color-border)',
              borderBottomLeftRadius: 14,
            }} />
            {/* Border suppressed whenever this reply has its own replies
                below it, same reasoning as the top-level parent: it and its
                children read as one continuous unit, not separate cards.
                Wrapped in its own positioned, higher-stacked layer: an
                absolutely-positioned sibling (the elbow above) paints above
                a plain static one regardless of DOM order, which is why
                the connector was drawing over the avatar even where the
                geometry itself looked right on paper. Giving this row its
                own stacking order (zIndex 1 vs. the elbow's implicit 0)
                fixes that for good, independent of any pixel math. */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <ReplyToReply reply={n} viewer={viewer} currentUserId={currentUserId} postId={postId} hideBorder={hasChildren} />
            </div>
            {/* Recurse one more generation down. Rendered as a normal
                sibling (not absolutely positioned) inside this same
                marginLeft wrapper, so its own trunk's upward reach lands on
                THIS reply's avatar directly above it - the same relationship
                the top-level trunk has with the top-level parent comment. */}
            {hasChildren && (
              <NestedReplies nested={n.nested} viewer={viewer} currentUserId={currentUserId} postId={postId} />
            )}
          </div>
        )
      })}

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