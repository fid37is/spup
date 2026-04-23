'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import WaitlistModal from './waitlist-modal'

interface WaitlistContextValue {
  openModal: () => void
}

const WaitlistContext = createContext<WaitlistContextValue>({ openModal: () => {} })

export function useWaitlist() {
  return useContext(WaitlistContext)
}

export function WaitlistProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const openModal = useCallback(() => setOpen(true), [])

  return (
    <WaitlistContext.Provider value={{ openModal }}>
      {children}
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </WaitlistContext.Provider>
  )
}