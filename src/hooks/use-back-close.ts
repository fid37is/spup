'use client'

import { useEffect, useRef } from 'react'
import { registerBackHandler } from '@/lib/native-back'

/**
 * Makes the Android back button close this popup.
 *
 *   useBackClose(true, onClose)        // popup that is mounted only while open
 *   useBackClose(open, onCancel)       // popup that stays mounted and has an `open` prop
 *
 * Call it at the top of the component, before any early `return`.
 * Harmless on the web.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  // Always call the latest onClose without re-registering on every render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    return registerBackHandler(() => closeRef.current())
  }, [open])
}
