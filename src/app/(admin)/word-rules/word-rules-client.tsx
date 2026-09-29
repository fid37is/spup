'use client'

// src/app/(admin)/word-rules/word-rules-client.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { adminAddRulesAction, adminUpdateRuleAction, adminDeleteRuleAction } from '@/lib/actions/admin'

const CATEGORIES = ['abuse', 'hate', 'threat', 'scam', 'spam', 'sexual', 'self_harm', 'other'] as const

const categoryLabel = (c: string) => c.replace('_', ' ')

export function AddRulesForm() {
  const [terms, setTerms] = useState('')
  const [matchType, setMatchType] = useState<'word' | 'contains'>('word')
  const [action, setAction] = useState<'flag' | 'block' | 'support'>('flag')
  const [category, setCategory] = useState<string>('abuse')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await adminAddRulesAction({ terms, match_type: matchType, action, category })
      if ('error' in result && result.error) { setError(result.error); return }
      if ('added' in result) {
        setNotice(`Added ${result.added}${result.skipped ? ` (${result.skipped} already in the list)` : ''}.`)
      }
      setTerms('')
      router.refresh()
    })
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-3 font-display text-sm font-bold text-primary">Add words or phrases</h2>

      <label className="mb-3 flex flex-col gap-1 text-xs text-secondary">
        Words or phrases <span className="text-faint">(one per line, or separated by commas)</span>
        <textarea
          value={terms}
          onChange={e => setTerms(e.target.value)}
          rows={3}
          className="resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          When it appears
          <select
            value={action}
            onChange={e => setAction(e.target.value as 'flag' | 'block' | 'support')}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          >
            <option value="flag">Flag for review (post still publishes)</option>
            <option value="block">Block the post</option>
            <option value="support">Show support resources (post still publishes)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          Match
          <select
            value={matchType}
            onChange={e => setMatchType(e.target.value as 'word' | 'contains')}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary"
          >
            <option value="word">Whole word / phrase only</option>
            <option value="contains">Anywhere, even inside other words</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          Category
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2.5 py-2 text-sm capitalize text-primary"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={isPending || !terms.trim()}
          className="rounded-[9px] bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {isPending ? 'Adding…' : 'Add to list'}
        </button>
        {error && <span className="text-xs text-error">{error}</span>}
        {notice && <span className="text-xs text-brand">{notice}</span>}
      </div>
    </div>
  )
}

export function RuleRowActions({ id, isActive, action }: { id: string; isActive: boolean; action: 'flag' | 'block' | 'support' }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if ('error' in r && r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
      {action !== 'support' && (
        <button
          onClick={() => run(() => adminUpdateRuleAction(id, { action: action === 'block' ? 'flag' : 'block' }))}
          disabled={isPending}
          title={action === 'block' ? 'Switch to flag for review' : 'Switch to block'}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-secondary disabled:opacity-60"
        >
          {action === 'block' ? 'Make flag-only' : 'Make block'}
        </button>
      )}
      <button
        onClick={() => run(() => adminUpdateRuleAction(id, { is_active: !isActive }))}
        disabled={isPending}
        className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-secondary disabled:opacity-60"
      >
        {isActive ? 'Pause' : 'Resume'}
      </button>
      <button
        onClick={() => { if (window.confirm('Delete this rule?')) run(() => adminDeleteRuleAction(id)) }}
        disabled={isPending}
        aria-label="Delete rule"
        className="rounded-lg border border-error/25 bg-error/10 p-1.5 text-error disabled:opacity-60"
      >
        <Trash2 size={14} />
      </button>
      {error && <span className="w-full text-right text-[11px] text-error">{error}</span>}
    </div>
  )
}
