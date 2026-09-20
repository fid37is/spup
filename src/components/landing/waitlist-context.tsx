'use client'

import { createContext, useContext, useState, useCallback, use, Suspense } from 'react'
import WaitlistModal from './waitlist-modal'

interface WaitlistContextValue {
  openModal: () => void
}

const WaitlistContext = createContext<WaitlistContextValue>({ openModal: () => {} })

export function useWaitlist() {
  return useContext(WaitlistContext)
}

// The open/closed flag arrives as a promise (see app/layout.tsx) so it never
// holds up first paint. It's only read here, once the modal is actually open.
function WaitlistModalGate({ onClose, waitlistOpen }: { onClose: () => void; waitlistOpen: Promise<boolean> }) {
  return <WaitlistModal onClose={onClose} waitlistOpen={use(waitlistOpen)} />
}

export function WaitlistProvider({ children, waitlistOpen }: { children: React.ReactNode; waitlistOpen: Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const openModal = useCallback(() => setOpen(true), [])

  return (
    <WaitlistContext.Provider value={{ openModal }}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <WaitlistModalGate onClose={() => setOpen(false)} waitlistOpen={waitlistOpen} />
        </Suspense>
      )}
    </WaitlistContext.Provider>
  )
}