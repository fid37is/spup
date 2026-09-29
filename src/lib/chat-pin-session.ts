// src/lib/chat-pin-session.ts
//
// PinGate (src/components/chat/pin-gate.tsx) and chat-crypto's
// recoverOrCreateKeyPair() need to share the PIN+pepper material for
// wrapping/unwrapping the E2E key, but PinGate is mounted independently on
// three separate pages (messages/page.tsx, messages/[id]/page.tsx,
// messages/new/page.tsx) — no shared layout, so no natural place for React
// context. A module-level singleton is the simplest bridge.
//
// Deliberately in-memory only, not sessionStorage/localStorage: this holds
// the PIN itself, which is materially more sensitive than the derived
// wrapped-key blob (see 022_chat_pin_pepper.sql), so it shouldn't linger in
// any inspectable storage. It's cleared on a full page reload - PinGate is
// the ONE and only PIN prompt in this app (see pin-gate.tsx), so if this is
// empty when chat-crypto's recoverOrCreateKeyPair() wants it, it just does
// without rather than asking again; the common case (device already has a
// cached key in localStorage) never needs this at all.

let material: { pin: string; pepper: string } | null = null

export function setSessionPinMaterial(pin: string, pepper: string) {
  material = { pin, pepper }
}

export function getSessionPinMaterial(): { pin: string; pepper: string } | null {
  return material
}

export function clearSessionPinMaterial() {
  material = null
}