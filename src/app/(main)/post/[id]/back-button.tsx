// src/app/(main)/post/[id]/back-button.tsx
'use client'

import { useRouter } from 'next/navigation'

export default function BackButton({
  parentPostId, children,
}: {
  parentPostId: string | null
  children: React.ReactNode
}) {
  const router = useRouter()

  function handleBack() {
    // Reply / comment: go to its parent. replace (not push) so history reads
    // "notifications -> parent" and the parent's own back returns there,
    // instead of bouncing back down into the reply.
    if (parentPostId) {
      router.replace(`/post/${parentPostId}`)
      return
    }
    // Top-level post: back to wherever they came from; feed if opened directly.
    if (window.history.length > 1) router.back()
    else router.replace('/feed')
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Back"
      style={{
        color: 'var(--color-text-primary)', display: 'flex',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
