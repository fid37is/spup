// src/lib/native-google.ts
//
// Native "Sign in with Google" for the Android app.
//
// Why: opening Google in Chrome and returning through a deep link depends on
// the app surviving in the background, a cookie being saved, and a link being
// handed back - any one of which can fail. Here Google's own account sheet
// opens INSIDE the app (Android Credential Manager), Google hands back an ID
// token, and Supabase signs the person in with it directly. No browser, no
// deep link.
//
// Needs (see the setup notes):
//   - the plugin:  npm i @capgo/capacitor-social-login@8
//   - NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = the Web OAuth client ID that is
//     already set in Supabase > Authentication > Providers > Google
//   - an Android OAuth client in Google Cloud (package com.spup.app + SHA-1)

import { Capacitor } from '@capacitor/core'

const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID

/** True only inside the Android/iOS app AND when the Web client ID is configured. */
export function nativeGoogleAvailable(): boolean {
  return Capacitor.isNativePlatform() && !!WEB_CLIENT_ID
}

interface SupabaseAuthLike {
  auth: {
    signInWithIdToken(credentials: {
      provider: 'google'
      token: string
      nonce?: string
    }): Promise<{ error: { message: string } | null }>
  }
}

export type NativeGoogleResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string }

let initialised = false

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

export async function signInWithGoogleNative(supabase: SupabaseAuthLike): Promise<NativeGoogleResult> {
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login')

    if (!initialised) {
      await SocialLogin.initialize({
        google: {
          webClientId: WEB_CLIENT_ID!,
          mode: 'online', // "online" is what returns an ID token
        },
      })
      initialised = true
    }

    // Nonce pair (Supabase's documented pattern): Google gets the SHA-256
    // digest and puts it in the ID token; Supabase gets the raw value and
    // checks it hashes to the same thing.
    const rawNonce = randomHex(32)
    const nonceDigest = await sha256Hex(rawNonce)

    const res = await SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'], nonce: nonceDigest },
    })

    const idToken = (res as { result?: { idToken?: string | null } }).result?.idToken
    if (!idToken) {
      return { ok: false, cancelled: false, message: 'Google did not return an ID token' }
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: rawNonce,
    })
    if (error) return { ok: false, cancelled: false, message: error.message }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // The person closing the account sheet is not an error worth showing.
    return { ok: false, cancelled: /cancel/i.test(message), message }
  }
}
