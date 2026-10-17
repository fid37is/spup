// src/app/(main)/settings/verify-bvn/page.tsx
'use client'

import KycFlow from '@/components/settings/kyc-flow'

// Premium gate -> phone -> ID + selfie lives in the shared component.
export default function VerifyBvnPage() {
  return <KycFlow kind="bvn" />
}
