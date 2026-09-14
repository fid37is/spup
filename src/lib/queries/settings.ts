// src/lib/queries/settings.ts
import { createAdminClient } from '@/lib/supabase/server'

// Reads go through the admin client, same as the `waitlist` table itself —
// platform_settings has no anon/authenticated RLS policies (see
// 017_platform_settings.sql), so this is the only way to read it.

export async function getWaitlistOpenStatus(): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'waitlist_open')
    .single()

  // Default to open if the row is somehow missing — fails safe toward
  // "keep collecting signups" rather than silently hiding the form.
  if (!data) return true
  return data.value === true
}
