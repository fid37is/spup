'use client'

// src/app/(admin)/promo-codes/promo-codes-client.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check } from 'lucide-react'
import { generatePromoCodeAction, revokePromoCodeAction } from '@/lib/actions/promo-codes'
import { TIERS } from '@/lib/promotions'

export function GeneratePromoCodeForm() {
  const [tier, setTier] = useState<'any' | keyof typeof TIERS>('any')
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    setNewCode(null)
    startTransition(async () => {
      const result = await generatePromoCodeAction({
        tier,
        label: label || undefined,
        maxUses: Number(maxUses) || 1,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      })
      if ('error' in result) { setError(result.error); return }
      setNewCode(result.code)
      setLabel('')
      setMaxUses('1')
      setExpiresInDays('')
      router.refresh()
    })
  }

  function copy() {
    if (!newCode) return
    navigator.clipboard.writeText(newCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-3 font-display text-sm font-bold text-primary">Generate a code</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Tier
          <select
            value={tier}
            onChange={e => setTier(e.target.value as typeof tier)}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          >
            <option value="any">Any tier</option>
            {Object.entries(TIERS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary sm:col-span-2">
          Label <span className="text-faint">(who this is for)</span>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Instagram affiliate - @xyz"
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Uses
          <input
            type="number" min={1} max={1000}
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Expires in <span className="text-faint">(days, optional)</span>
          <input
            type="number" min={1}
            value={expiresInDays}
            onChange={e => setExpiresInDays(e.target.value)}
            placeholder="Never"
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          />
        </label>
        <div className="flex items-end sm:col-span-3">
          <button
            onClick={submit}
            disabled={isPending}
            className="rounded-[9px] bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {isPending ? 'Generating…' : 'Generate code'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {newCode && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2.5">
          <span className="font-display text-base font-extrabold tracking-widest text-brand">{newCode}</span>
          <button onClick={copy} className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand">
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      )}
    </div>
  )
}

export function RevokePromoCodeButton({ codeId }: { codeId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function revoke() {
    setError(null)
    startTransition(async () => {
      const result = await revokePromoCodeAction(codeId)
      if ('error' in result && result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex justify-end gap-1.5">
          <button
            onClick={revoke}
            disabled={isPending}
            className="rounded-[7px] bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {isPending ? '…' : 'Confirm'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            className="rounded-[7px] border border-[#2A2A30] bg-transparent px-3 py-1.5 text-xs text-secondary"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-[11px] text-error">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-[7px] border border-error/25 bg-transparent px-3 py-1.5 text-xs font-semibold text-error"
    >
      Revoke
    </button>
  )
}
