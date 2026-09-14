// src/app/(admin)/testimonials/testimonial-actions.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdateTestimonialAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

export default function TestimonialActions({ testimonialId }: { testimonialId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function update(status: 'approved' | 'rejected') {
    startTransition(async () => {
      await adminUpdateTestimonialAction(testimonialId, status)
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => update('rejected')}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg border border-error/25 bg-error/10 px-4 py-2 font-display text-[13px] font-semibold text-error disabled:opacity-60"
      >
        <XCircle size={15} /> Reject
      </button>
      <button
        onClick={() => update('approved')}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand-muted px-4 py-2 font-display text-[13px] font-semibold text-brand disabled:opacity-60"
      >
        <CheckCircle size={15} /> {isPending ? 'Approving…' : 'Approve & publish'}
      </button>
    </div>
  )
}
