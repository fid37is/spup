// src/app/(main)/premium/page.tsx
//
// The separate dark Premium page is gone - subscribing and managing Premium now
// happens on the wallet (src/components/wallet/premium-card.tsx). This stays only
// so old links, bookmarks and in-flight Paystack returns don't 404.

import { redirect } from 'next/navigation'

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams
  redirect(paid === '1' || paid === 'failed' ? `/wallet?premium=${paid}` : '/wallet')
}