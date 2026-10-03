// src/app/contact/layout.tsx
//
// contact/page.tsx is a client component, so it can't export metadata. This
// segment layout carries the page's own canonical (without it the page would
// inherit another URL's canonical and be dropped from Google's index).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Questions, ideas or issues? Get in touch with the Spup team.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}