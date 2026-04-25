// src/lib/feed/scoring.ts
// ─── Feed Scoring Algorithm v1 ───────────────────────────────────────────────
// Each factor has a named weight constant — easy to tune without touching logic.
// To improve the algorithm, adjust weights or add new signals below.

export const SCORE_WEIGHTS = {
  // Engagement signals
  LIKE:      1.0,
  COMMENT:   2.0,   // comments signal deeper interest than likes
  REPOST:    1.5,
  BOOKMARK:  2.5,   // bookmarks = high intent

  // Relationship signals
  IS_FOLLOWING: 5.0,   // boost posts from people you follow
  IS_MUTUAL:    8.0,   // boost mutuals even more
  IS_MONETISED: 1.5,   // slight boost for creator accounts

  // Recency decay — posts lose score as they age
  // score *= e^(-DECAY_RATE * hours_old)
  DECAY_RATE: 0.05,    // at 24h old: score * ~0.30, at 48h: ~0.09

  // Penalty
  SENSITIVE_CONTENT: 0.5,  // multiply score by this if is_sensitive
}

export interface ScoringContext {
  followingIds: Set<string>
  mutualIds: Set<string>
}

export function scorePost(post: any, ctx: ScoringContext): number {
  const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / 3_600_000

  // Base engagement score
  let score =
    post.likes_count      * SCORE_WEIGHTS.LIKE     +
    post.comments_count   * SCORE_WEIGHTS.COMMENT   +
    post.reposts_count    * SCORE_WEIGHTS.REPOST    +
    post.bookmarks_count  * SCORE_WEIGHTS.BOOKMARK

  // Relationship boosts
  const authorId = post.author?.id || post.user_id
  if (ctx.mutualIds.has(authorId))    score += SCORE_WEIGHTS.IS_MUTUAL
  else if (ctx.followingIds.has(authorId)) score += SCORE_WEIGHTS.IS_FOLLOWING

  // Creator boost
  if (post.author?.is_monetised) score *= SCORE_WEIGHTS.IS_MONETISED

  // Recency decay — exponential
  score *= Math.exp(-SCORE_WEIGHTS.DECAY_RATE * hoursOld)

  // Sensitivity penalty
  if (post.is_sensitive) score *= SCORE_WEIGHTS.SENSITIVE_CONTENT

  return score
}