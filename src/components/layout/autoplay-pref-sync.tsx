// src/components/layout/autoplay-pref-sync.tsx
'use client'

import { useEffect } from 'react'
import { AUTOPLAY_STORAGE_KEY, isAutoplayPreference } from '@/lib/autoplay'

/**
 * The saved Autoplay preference lives on the profile so it follows the person
 * to a new phone or browser. The feed reads it from localStorage (instant, no
 * fetch), so this copies the profile value across whenever it changes.
 */
export default function AutoplayPrefSync({ value }: { value?: string | null }) {
  useEffect(() => {
    if (!isAutoplayPreference(value)) return
    try { window.localStorage.setItem(AUTOPLAY_STORAGE_KEY, value) } catch { /* private mode */ }
  }, [value])
  return null
}