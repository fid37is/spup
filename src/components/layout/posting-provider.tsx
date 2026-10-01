'use client'

// src/components/layout/posting-provider.tsx
//
// Owns posts that are being sent. Mounted once in the (main) layout - which
// stays mounted while the person moves between pages - so a post keeps
// uploading and publishing after its composer has closed and the screen
// underneath has changed. That is the whole point: tapping Post never blocks
// the app. See lib/posting/poster.ts for what actually happens to a post.
//
//   const { startPost } = usePosting()
//   startPost({ body, media })   // returns immediately; the composer can close

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/layout/toast'
import { useTranslation } from '@/lib/i18n/language-context'
import PostingProgressBar from '@/components/layout/posting-progress-bar'
import { ProgressStore } from '@/lib/posting/progress-store'
import { createPoster, type PostJob, type PostJobInput } from '@/lib/posting/poster'

interface PostingContextValue {
  /** Hands a post to the background and returns straight away. */
  startPost: (input: PostJobInput) => void
}

const PostingContext = createContext<PostingContextValue | null>(null)

export function usePosting(): PostingContextValue {
  const ctx = useContext(PostingContext)
  if (!ctx) throw new Error('usePosting must be used within PostingProvider')
  return ctx
}

export default function PostingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const { t } = useTranslation()

  // A post outlives the render that started it, so it reads these through
  // refs to always see the current router, page, toast and language.
  const routerRef = useRef(router)
  const pathnameRef = useRef(pathname)
  const toastRef = useRef(toast)
  const tRef = useRef(t)
  routerRef.current = router
  pathnameRef.current = pathname
  toastRef.current = toast
  tRef.current = t

  const [store] = useState(() => new ProgressStore<PostJob>())
  const poster = useMemo(() => createPoster(store, {
    router: () => routerRef.current,
    pathname: () => pathnameRef.current,
    toast: () => toastRef.current,
    t: () => tRef.current,
  }), [store])
  const value = useMemo<PostingContextValue>(() => ({ startPost: poster.startPost }), [poster])

  // Closing the tab mid-upload would silently lose the post - ask first. Only
  // while something is actually sending.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!store.hasRunning()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [store])

  return (
    <PostingContext.Provider value={value}>
      {children}
      <PostingProgressBar store={store} />
    </PostingContext.Provider>
  )
}
