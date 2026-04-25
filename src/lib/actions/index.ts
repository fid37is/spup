/**
 * Barrel export for all server actions.
 *
 * Import like:
 *   import { createPostAction, toggleLikeAction } from '@/lib/actions'
 *   import { toggleFollowAction } from '@/lib/actions'
 *
 * Each file stays focused on one domain. This barrel makes
 * it convenient for consumers without coupling the files to each other.
 */

export * from './auth'
export * from './posts'
export * from './follows'
export * from './notifications'
export * from './profiles'
export * from './feed'
export * from './admin'
export * from './waitlist'