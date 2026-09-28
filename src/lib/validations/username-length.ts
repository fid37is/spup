// src/lib/validations/username-length.ts
//
// Length rules for usernames. Does NOT touch which characters are allowed -
// that stays exactly as it is today. An emoji counts as 1 character.
//
//   - 5 to 12 characters in total
//   - at least 4 of them must be non-emoji (letters / digits / underscore),
//     so "abcd😀" is fine but "😀😀😀😀😀" and "a😀😀😀😀" are not

export const USERNAME_MIN_LENGTH = 5
export const USERNAME_MAX_LENGTH = 12
export const USERNAME_MIN_NON_EMOJI = 4

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u

/** User-perceived characters: a 👨‍👩‍👧 or 🇳🇬 is one, not several. */
function characters(value: string): string[] {
  const Seg = (Intl as any).Segmenter
  if (Seg) {
    return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(value), (s: any) => s.segment as string)
  }
  return Array.from(value) // older runtimes: still counts an emoji as 1 (except joined sequences)
}

/** Cuts a username to the max length without splitting an emoji. Use in inputs instead of maxLength. */
export function clampUsername(value: string): string {
  const chars = characters(value ?? '')
  return chars.length > USERNAME_MAX_LENGTH ? chars.slice(0, USERNAME_MAX_LENGTH).join('') : value
}

/** Returns an error message, or null when the username length is valid. */
export function usernameLengthError(value: string): string | null {
  const chars = characters(value ?? '')
  if (chars.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or less.`
  }
  const emoji = chars.filter(c => EMOJI_RE.test(c)).length
  if (chars.length < USERNAME_MIN_LENGTH || chars.length - emoji < USERNAME_MIN_NON_EMOJI) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters (an emoji counts as 1), and at least ${USERNAME_MIN_NON_EMOJI} of them must be letters, numbers or underscores.`
  }
  return null
}