// src/app/(auth)/verify-otp/page.tsx
// This route is reserved for phone OTP used in KYC / 2FA (settings flow).
// It is NOT part of the email-based registration flow.
// Registration email verification lives at /verify-email.
// If someone lands here directly, redirect them safely.
import { redirect } from 'next/navigation'
export default function VerifyOtpPage() {
  redirect('/verify-email')
}