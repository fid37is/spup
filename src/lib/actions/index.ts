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

// './auth' and './profiles' both export checkUsernameAvailableAction —
// this explicit re-export resolves the ambiguity in auth.ts's favor, since
// it's the version with the documented Supabase query-builder immutability
// fix (forgetting to reassign .neq() there previously made every username
// look available). If profiles.ts's version has since diverged with newer,
// intentional changes, swap this to './profiles' instead.
export { checkUsernameAvailableAction } from './auth'