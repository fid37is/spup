// src/lib/content-scan.ts
// Pure text matching for the admin-managed word rules. No imports on purpose:
// it runs the same anywhere and is easy to test in isolation.

// flag    = publish + queue for review
// block   = reject the post
// support = publish, show the author help resources (never queued as a violation)
export type RuleAction = 'flag' | 'block' | 'support'
export type RuleMatchType = 'word' | 'contains'

export interface ContentRule {
  id: string
  term: string
  match_type: RuleMatchType
  action: RuleAction
  category: string
}

export interface RuleMatch {
  term: string
  action: RuleAction
  category: string
}

// Digits/symbols people swap in to dodge filters (s3x, k1ll, @ss). Only used
// for a second pass over the text, so normal text is still matched as written.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
}

/** Lowercase, strip accents and hidden characters, unify apostrophes and whitespace. */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // zero-width characters people slip into words to dodge filters
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    // phone keyboards type curly apostrophes: "don’t" must equal "don't"
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// "killlll" -> "kill": 3+ repeats of a character are squeezed to 2.
function squeezeRepeats(s: string): string {
  return s.replace(/(.)\1{2,}/gu, '$1$1')
}

function deLeet(s: string): string {
  return s.replace(/[013457@$]/g, ch => LEET[ch] ?? ch)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const regexCache = new Map<string, RegExp>()

// Builds the pattern for a whole-word rule. Each letter may be stretched
// ("fooollow") and each vowel may be starred out ("c*nt"). Working per letter
// (instead of squashing the text) keeps real words safe: "nigger" needs two g's,
// so "Niger" the country never matches.
function termPattern(term: string): string {
  let out = ''
  for (const ch of term) {
    if (ch === ' ') out += '\\s+'
    else if (/[aeiou]/.test(ch)) out += `[${ch}*]+`
    else if (/[\p{L}\p{N}]/u.test(ch)) out += `${ch}+`
    else out += escapeRegExp(ch)
  }
  return out
}

function wordRegex(term: string): RegExp {
  let re = regexCache.get(term)
  if (!re) {
    const body = termPattern(term)
    // Unicode-aware boundaries: not preceded/followed by a letter or number.
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u')
    regexCache.set(term, re)
  }
  return re
}

export function scanText(text: string, rules: ContentRule[]): RuleMatch[] {
  if (!text || rules.length === 0) return []

  const plain = squeezeRepeats(normalize(text))
  const leet = squeezeRepeats(deLeet(normalize(text)))
  const variants = plain === leet ? [plain] : [plain, leet]

  const hits = new Map<string, RuleMatch>()
  for (const rule of rules) {
    const term = normalize(rule.term)
    if (!term) continue

    const re = rule.match_type === 'word' ? wordRegex(term) : null
    const found = variants.some(v => (re ? re.test(v) : v.includes(term)))
    if (found && !hits.has(term)) {
      hits.set(term, { term: rule.term, action: rule.action, category: rule.category })
    }
  }
  return [...hits.values()]
}

export function hasBlock(matches: RuleMatch[]): boolean {
  return matches.some(m => m.action === 'block')
}
