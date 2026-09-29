// src/app/(main)/settings/verify-phone/loading.tsx
//
// The route always mounts into its initial 'enter-phone' stage first (OTP
// entry only appears after a client-side action), which is structurally
// identical to the verify-bvn/verify-nin template - same shared skeleton.
import { KycFormLoading } from '@/components/shared/kyc-form-skeleton'

export default function VerifyPhoneLoading() {
  return <KycFormLoading />
}