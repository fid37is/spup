// src/app/(main)/settings/verify-nin/page.tsx
'use client'

import KycFlow from '@/components/settings/kyc-flow'

// Premium gate -> phone -> ID + selfie lives in the shared component.
export default function VerifyNinPage() {
  return <KycFlow kind="nin" />
}
