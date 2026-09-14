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

export function WaitlistProvider({ children, waitlistOpen }: { children: React.ReactNode; waitlistOpen: boolean }) {
  const [open, setOpen] = useState(false)
  const openModal = useCallback(() => setOpen(true), [])

  return (
    <WaitlistContext.Provider value={{ openModal }}>
      {children}
      {open && <WaitlistModal onClose={() => setOpen(false)} waitlistOpen={waitlistOpen} />}
    </WaitlistContext.Provider>
  )
}