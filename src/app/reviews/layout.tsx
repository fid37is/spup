// src/app/reviews/layout.tsx
//
// reviews/page.tsx is a client component, so it can't export metadata. This
// segment layout carries the page's own canonical (without it the page would
// inherit another URL's canonical and be dropped from Google's index).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Share a Review',
  description: 'Tell Nigeria what Spup has done for you. Share your Spup review.',
  alternates: { canonical: '/reviews' },
}

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}