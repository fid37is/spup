'use client'

// src/app/(admin)/announcements/announcements-client.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createAnnouncementAction, endAnnouncementAction } from '@/lib/actions/announcements'
import {
  ANNOUNCEMENT_KINDS, ANNOUNCEMENT_LIMITS, KIND_LABELS, REMIND_CHOICES,
  validateAnnouncementInput, type AnnouncementKind,
} from '@/lib/announcements'
import AnnouncementBanner from '@/components/feed/announcement-banner'
import AnnouncementStrip from '@/components/feed/announcement-strip'

const FIELD = 'rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-primary'

// <input type="datetime-local"> gives "2026-10-05T23:00" in the admin's own timezone.
function toIso(local: string): string | undefined {
  if (!local) return undefined
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function Counter({ value, max }: { value: string; max: number }) {
  const over = value.trim().length > max
  return <span className={over ? 'text-error' : 'text-faint'}>{value.trim().length}/{max}</span>
}

export function CreateAnnouncementForm() {
  const [kind, setKind] = useState<AnnouncementKind>('feature')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  // Maintenance notices are easy to miss and have a deadline, so they default to
  // coming back every 6 hours; features default to one-and-done. Changing the
  // choice by hand stops the default following the type.
  const [remind, setRemind] = useState<number | null>(null)
  const [remindTouched, setRemindTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const input = {
    kind, title, body, ctaLabel, ctaUrl,
    startsAt: toIso(startsAt),
    endsAt: toIso(endsAt),
    remindAfterHours: remind,
  }
  const hasContent = title.trim().length > 0 && body.trim().length > 0
  const hasCta = ctaLabel.trim() && ctaUrl.trim()

  function submit() {
    setError(null)
    setDone(false)
    const problem = validateAnnouncementInput(input)
    if (problem) { setError(problem); return }

    startTransition(async () => {
      const result = await createAnnouncementAction(input)
      if ('error' in result && result.error) { setError(result.error); return }
      setTitle(''); setBody(''); setCtaLabel(''); setCtaUrl(''); setStartsAt(''); setEndsAt('')
      setRemindTouched(false); setRemind(kind === 'maintenance' ? 6 : null)
      setDone(true)
      router.refresh()
    })
  }

  function pickKind(k: AnnouncementKind) {
    setKind(k)
    if (!remindTouched) setRemind(k === 'maintenance' ? 6 : null)
  }

  const previewCard = hasContent ? {
    id: 'preview', kind, title: title.trim(), body: body.trim(),
    cta_label: hasCta ? ctaLabel.trim() : null,
    cta_url: hasCta ? ctaUrl.trim() : null,
  } : null

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-3 font-display text-sm font-bold text-primary">New announcement</h2>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-xs text-secondary">
            Type
            <div className="grid grid-cols-2 gap-2">
              {ANNOUNCEMENT_KINDS.map(k => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => pickKind(k)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    kind === k ? 'border-brand bg-brand-muted text-primary' : 'border-border bg-bg text-secondary'
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs text-secondary">
            <span className="flex justify-between">Title <Counter value={title} max={ANNOUNCEMENT_LIMITS.title} /></span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={kind === 'feature' ? 'e.g. Bold text is here' : 'e.g. Scheduled maintenance tonight'}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-secondary">
            <span className="flex justify-between">Message <Counter value={body} max={ANNOUNCEMENT_LIMITS.body} /></span>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder="One or two short sentences - people skim this."
              className={`${FIELD} resize-none`}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-secondary">
              <span className="flex justify-between">Button label <span className="text-faint">(optional)</span></span>
              <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="e.g. Try it" className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-secondary">
              <span className="flex justify-between">Button link <span className="text-faint">(optional)</span></span>
              <input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="/wallet or https://…" className={FIELD} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-secondary">
              Show from <span className="text-faint">(blank = right now)</span>
              <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-secondary">
              Hide after <span className="text-faint">(blank = until you end it)</span>
              <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className={FIELD} />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-secondary">
            If someone dismisses it, bring it back
            <select
              value={remind === null ? '' : String(remind)}
              onChange={e => { setRemind(e.target.value === '' ? null : Number(e.target.value)); setRemindTouched(true) }}
              className={FIELD}
            >
              {REMIND_CHOICES.map(c => (
                <option key={c.label} value={c.value === null ? '' : String(c.value)}>{c.label}</option>
              ))}
            </select>
            <span className="text-faint">
              It only comes back while the announcement is still live, so set &ldquo;Hide after&rdquo; for anything with a deadline.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-secondary">
              Preview - phones and tablets{kind === 'maintenance' ? ' (pinned under the feed tabs; tap the line to expand)' : ' (in the feed, under the tabs)'}
            </span>
            <div className="max-w-[420px] overflow-hidden rounded-xl border border-border bg-bg">
              {previewCard ? (
                kind === 'maintenance'
                  ? <AnnouncementStrip preview announcement={previewCard} />
                  : <AnnouncementBanner preview announcement={previewCard} />
              ) : (
                <p className="px-4 py-8 text-center text-sm text-faint">Add a title and message to see the preview</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-secondary">Preview - desktop (top of the right-hand column)</span>
            <div className="w-[300px] max-w-full rounded-xl border border-border bg-bg p-4">
              {previewCard ? (
                <AnnouncementBanner preview variant="sidebar" announcement={previewCard} />
              ) : (
                <p className="py-4 text-center text-sm text-faint">Add a title and message to see the preview</p>
              )}
            </div>
          </div>

          <p className="text-xs text-faint">
            If more than one is live, maintenance shows first. People can always dismiss it.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={isPending}
          className="rounded-[9px] bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {isPending ? 'Publishing…' : startsAt ? 'Schedule announcement' : 'Publish now'}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
        {done && !error && <p className="text-xs text-brand">Published</p>}
      </div>
    </div>
  )
}

export function EndAnnouncementButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function end() {
    setError(null)
    startTransition(async () => {
      const result = await endAnnouncementAction(id)
      if ('error' in result && result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex justify-end gap-1.5">
          <button
            onClick={end}
            disabled={isPending}
            className="rounded-[7px] bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {isPending ? '…' : 'Confirm'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            className="rounded-[7px] border border-border bg-transparent px-3 py-1.5 text-xs text-secondary"
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
      End now
    </button>
  )
}
