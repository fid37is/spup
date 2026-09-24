// src/lib/username.ts
//
// Turns a person's name into real username candidates - "johndoe",
// "john_doe", "johnd" - instead of the "user_a1b2c3d4" placeholder that
// used to be written wherever a profile is created without the person
// picking a username themselves.

import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

const MIN_LEN = 3
const MAX_LEN = 20 // matches the cap saveUsernameAction enforces

/** Same character rule saveUsernameAction enforces: lowercase letters and digits (no underscore here - added explicitly where wanted). */
function clean(s: string): string {
  return s
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents: "José" -> "jose"
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function splitName(fullName: string): { first: string; last: string } {
  const words = fullName.trim().split(/\s+/).map(clean).filter(Boolean)
  if (words.length === 0) return { first: '', last: '' }
  if (words.length === 1) return { first: words[0], last: '' }
  return { first: words[0], last: words[words.length - 1] }
}

const fit = (base: string) => base.slice(0, MAX_LEN)

/**
 * Ordered, de-duplicated base username candidates (no numeric suffix) built
 * from a person's name. Falls back to "user" when the name has no usable
 * letters (e.g. an OAuth provider that supplied no name).
 */
export function nameBasedCandidates(fullName: string): string[] {
  const { first, last } = splitName(fullName)
  const out: string[] = []
  const add = (s: string) => { if (s.length >= MIN_LEN && !out.includes(s)) out.push(fit(s)) }

  if (first && last) {
    add(first + last)        // johndoe
    add(first + '_' + last)  // john_doe
    add(first + last[0])     // johnd
    add(last + first[0])     // doej
  } else if (first) {
    add(first)                // john
  }
  // Name existed but every candidate was under 3 chars (e.g. "Jo").
  if (out.length === 0 && (first || last)) add((first || last).padEnd(MIN_LEN, '0'))
  if (out.length === 0) add('user')
  return out
}

const randomDigits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')

async function isTaken(admin: AdminClient, username: string): Promise<boolean> {
  const { data } = await admin.from('users').select('id').eq('username', username).maybeSingle()
  return !!data
}

/**
 * Picks one available username for a brand-new account, preferring a clean
 * name-based handle and falling back to name+digits, then a fully random
 * one. Use wherever a profile is created without the person choosing a
 * username themselves.
 */
export async function generateUniqueUsername(admin: AdminClient, fullName: string): Promise<string> {
  const bases = nameBasedCandidates(fullName)

  for (const base of bases) {
    if (!(await isTaken(admin, base))) return base
  }

  // Every clean form of the name is taken - try it with a short random suffix.
  const base = bases[0]
  for (let digits = 2; digits <= 4; digits++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = fit(base.slice(0, MAX_LEN - digits) + randomDigits(digits))
      if (!(await isTaken(admin, candidate))) return candidate
    }
  }

  // Astronomically unlikely to be reached - guarantees termination anyway.
  return fit(base.slice(0, MAX_LEN - 6) + randomDigits(6))
}

/**
 * A few available username options for the onboarding username picker, so
 * the person can tap one instead of typing from scratch. Always tries to
 * return `count` - the last resort is name+digits, so there's always
 * something fresh even if every clean variant of their name is taken.
 */
export async function suggestUsernames(admin: AdminClient, fullName: string, count = 3): Promise<string[]> {
  const bases = nameBasedCandidates(fullName)
  const out: string[] = []

  for (const base of bases) {
    if (out.length >= count) break
    if (!(await isTaken(admin, base))) out.push(base)
  }

  const primary = bases[0]
  let guard = 0
  while (out.length < count && guard < 20) {
    guard++
    const candidate = fit(primary.slice(0, MAX_LEN - 3) + randomDigits(3))
    if (!out.includes(candidate) && !(await isTaken(admin, candidate))) out.push(candidate)
  }

  return out
}
