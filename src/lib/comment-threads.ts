// src/lib/comment-threads.ts
//
// Ordering and on-screen updates for a FLAT comment list - the direct replies
// to whatever post is currently focused (the main post, or, when you've
// tapped into a comment, that comment itself). Spup's comment pages are
// recursive the same way Threads' are: every post and every comment uses the
// exact same page template, so there is never more than one level of
// "replies" to lay out at once - no nesting, no indentation, no connector
// lines. To see the replies to a reply, you open that reply's own page.
//
// Order: newest first ("Recent") or most liked ("Top"), with the viewer's own
// comments pinned to the top either way, so they can always see what they
// just wrote.

export interface ThreadPost {
  id: string
  created_at: string
  likes_count: number
  author: { id: string; username: string }
}

export type CommentSort = 'recent' | 'top'

export function orderComments<T extends ThreadPost>(comments: T[], viewerId: string | null | undefined, sort: CommentSort): T[] {
  const byNewest = (a: T, b: T) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
  const ordered = [...comments].sort(sort === 'top'
    ? (a, b) => b.likes_count - a.likes_count || byNewest(a, b)
    : byNewest)
  if (!viewerId) return ordered
  const own = ordered.filter(c => c.author.id === viewerId)
  const others = ordered.filter(c => c.author.id !== viewerId)
  return [...own, ...others]
}

export type LocalChange<T> = { kind: 'comment'; post: T } | { kind: 'delete'; id: string }

/** Layer what the viewer just did (posted / deleted) on top of what the server sent. */
export function applyLocalChanges<T extends ThreadPost>(server: T[], changes: LocalChange<T>[]): T[] {
  let list = server
  for (const ch of changes) {
    if (ch.kind === 'delete') {
      list = list.filter(c => c.id !== ch.id)
    } else if (!list.some(c => c.id === ch.post.id)) {
      list = [ch.post, ...list]
    }
  }
  return list
}
