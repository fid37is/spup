// src/lib/profile-diff.ts
//
// The edit-profile form used to send EVERY field on EVERY save. That meant:
//   - "Save" with nothing changed still wrote to the database, and
//   - any single unsupported column (e.g. birthday_visibility before its
//     migration ran) made every save fail, changed or not.
// Now only the fields that actually changed are sent, and a save with no
// changes doesn't touch the server at all.

export interface ProfileFormValues {
  display_name: string
  bio: string | null
  occupation: string | null
  location: string | null
  website_url: string | null
  date_of_birth: string | null
  birthday_visibility: 'everyone' | 'followers' | 'only_me'
}

/** "yoursite.com" -> "https://yoursite.com"; blank -> null. */
export function normaliseWebsite(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`
}

/** Only the fields whose value differs from what the form opened with. */
export function buildProfileChanges(before: ProfileFormValues, next: ProfileFormValues): Partial<ProfileFormValues> {
  const changes: Partial<ProfileFormValues> = {}
  const keys = Object.keys(next) as Array<keyof ProfileFormValues>
  for (const key of keys) {
    if (next[key] !== before[key]) (changes as Record<string, unknown>)[key] = next[key]
  }
  return changes
}
