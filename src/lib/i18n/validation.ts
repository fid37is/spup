// Zod schemas (lib/validations/schemas.ts) are shared with server actions, so
// their messages stay plain English. Forms translate them at display time:
//   {tv(t, errors.email?.message)}
// Unknown messages pass through unchanged, so nothing ever renders blank.
type T = (key: string, vars?: Record<string, string | number>) => string

const EXACT: Record<string, string> = {
  'Email is required': 'validation.email_required',
  'Enter a valid email address': 'auth.invalid_email',
  'Date of birth is required': 'validation.dob_required',
  'Enter a valid date': 'validation.invalid_date',
  'Invalid date': 'validation.invalid_date',
  'You must be at least 13 years old': 'validation.min_age_13',
  'Must be at least 13': 'validation.min_age_13',
  'Must contain an uppercase letter': 'validation.password_uppercase',
  'Must contain a number': 'validation.password_number',
  "Passwords don't match": 'auth.passwords_dont_match',
  'Email or username is required': 'validation.identifier_required',
  'Password is required': 'validation.password_required',
  'Required': 'validation.required',
  'Add a name, not just emojis': 'validation.name_not_emoji',
}

export function tv(t: T, message?: string): string {
  if (!message) return ''
  const key = EXACT[message]
  if (key) return t(key)
  let m = /^At least (\d+) characters$/.exec(message)
  if (m) return t('validation.min_chars', { min: m[1] })
  m = /^Max (\d+) characters$/.exec(message)
  if (m) return t('validation.max_chars', { max: m[1] })
  return message
}
