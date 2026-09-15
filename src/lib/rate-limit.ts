// src/lib/rate-limit.ts
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Checks and records an attempt against a rate limit key, atomically.
 * Call this BEFORE doing the work you want limited.
 *
 * @param key         Unique identifier for what's being limited, e.g.
 *                     `withdraw:${userId}` or `login:${ip}`. Different
 *                     actions should use different prefixes so they don't
 *                     share a counter.
 * @param maxAttempts  How many calls are allowed per window.
 * @param windowSeconds Length of the fixed window, in seconds.
 * @returns true if this call is allowed, false if the limit was hit.
 *          Fails OPEN (returns true) on an unexpected error — a rate
 *          limiter outage should degrade to "unlimited", not take down
 *          the feature it's protecting.
 */
export async function checkRateLimit(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('checkRateLimit failed, failing open:', error)
      return true
    }
    return data === true
  } catch (err) {
    console.error('checkRateLimit threw, failing open:', err)
    return true
  }
}
