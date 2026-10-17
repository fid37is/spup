'use server'

// Server action behind the analytics page's range switcher: the audience
// breakdown (states, ages, active times) for one range. Premium is checked
// inside getAudience(), so calling this without Premium just returns null.

import { cookies } from 'next/headers'
import { getAuthUser } from '@/lib/supabase/server'
import { getProfileByAuthId } from '@/lib/queries'
import { getAudience } from '@/lib/analytics'
import { ANALYTICS_RANGES, type Audience, type AnalyticsRange } from '@/lib/analytics-shared'
import { TZ_COOKIE, pickTimeZone } from '@/lib/timezone'

export async function getAudienceAction(days: number): Promise<Audience | null> {
  if (!(ANALYTICS_RANGES as readonly number[]).includes(days)) return null
  const user = await getAuthUser()
  if (!user) return null
  const profile = await getProfileByAuthId(user.id)
  if (!profile) return null
  const tz = pickTimeZone((await cookies()).get(TZ_COOKIE)?.value)
  return getAudience(profile.id, days as AnalyticsRange, tz)
}
