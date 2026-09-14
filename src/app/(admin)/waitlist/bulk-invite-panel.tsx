// src/app/(admin)/waitlist/bulk-invite-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, ChevronDown, ChevronUp } from 'lucide-react'
import { adminBulkInviteWaitlistAction, adminSetWaitlistOpenAction } from '@/lib/actions/admin'

interface BulkInvitePanelProps {
  waitingCount: number
  waitlistOpen: boolean
}

const DEFAULT_SUBJECT = "You're in — Spup is live"
const DEFAULT_MESSAGE = `You've been waiting for this — Spup is ready, and you're one of the first to know.

Here's why now matters: the earlier you're active, the more it counts. Real usage is what gets us eligible for ad monetisation, which speeds up how fast everyone on the platform starts earning. And being an early voice here means more reach right now than you'll get once it's crowded.

Two things worth doing in your first week:
1. Post something — even a quick intro goes a long way.
2. Invite a few people you'd actually want to see on here.

We'll see you on the inside.`

export default function BulkInvitePanel({ waitingCount, waitlistOpen }: BulkInvitePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [closeAfter, setCloseAfter] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ sending: number; skippedNoEmail: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isTogglePending, startToggleTransition] = useTransition()
  const router = useRouter()

  function handleSend() {
    setError(null)
    startTransition(async () => {
      const res = await adminBulkInviteWaitlistAction({ subject, message, closeWaitlistAfter: closeAfter })
      if (res.error) { setError(res.error); setConfirming(false); return }
      setResult({ sending: res.sending!, skippedNoEmail: res.skippedNoEmail! })
      setConfirming(false)
      router.refresh()
    })
  }

  function toggleWaitlistOpen() {
    startToggleTransition(async () => {
      await adminSetWaitlistOpenAction(!waitlistOpen)
      router.refresh()
    })
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5 sm:px-5"
      >
        <div className="flex items-center gap-2.5">
          <Send size={15} className="text-brand" />
          <span className="font-display text-sm font-bold text-primary">
            Send launch message to everyone waiting
          </span>
          <span className="rounded-lg bg-[color:var(--color-surface-3)] px-1.5 py-0.5 text-[11px] font-bold text-secondary">
            {waitingCount}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 sm:px-5">
          {/* Waitlist form visibility toggle — independent of sending */}
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-[color:var(--color-surface-2)] px-3.5 py-3">
            <div>
              <div className="text-[13px] font-semibold text-primary">Public waitlist form</div>
              <div className="text-[11px] text-faint">
                {waitlistOpen ? 'Live — people can still join the waitlist' : 'Closed — landing page shows "we\'re live" instead'}
              </div>
            </div>
            <button
              onClick={toggleWaitlistOpen}
              disabled={isTogglePending}
              className={`rounded-[7px] border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                waitlistOpen
                  ? 'border-error/25 bg-error/10 text-error'
                  : 'border-brand/25 bg-brand-muted text-brand'
              }`}
            >
              {isTogglePending ? '…' : waitlistOpen ? 'Close form' : 'Reopen form'}
            </button>
          </div>

          {result ? (
            <div className="rounded-lg border border-brand/25 bg-brand-muted px-4 py-4 text-center">
              <p className="font-display text-sm font-bold text-primary">
                Sending to {result.sending} {result.sending === 1 ? 'person' : 'people'}
              </p>
              <p className="mt-1 text-[12px] text-faint">
                Emails are going out in the background — refresh this page in a minute to see rows flip to &quot;Invited&quot; as each one lands.
                {result.skippedNoEmail > 0 && ` ${result.skippedNoEmail} entr${result.skippedNoEmail === 1 ? 'y has' : 'ies have'} no email on file and were skipped.`}
              </p>
              <button
                onClick={() => setResult(null)}
                className="mt-3 rounded-[7px] border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-secondary"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <label className="mb-1.5 block text-[12px] font-semibold text-secondary">Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-[9px] border border-border bg-[color:var(--color-surface-2)] px-3 py-2.5 text-sm text-primary outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="mb-1.5 block text-[12px] font-semibold text-secondary">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-[9px] border border-border bg-[color:var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed text-primary outline-none"
                />
                <p className="mt-1 text-[11px] text-faint">
                  Sent as-is to every waiting entry with an email on file. Blank lines start a new paragraph.
                </p>
              </div>

              <label className="mb-4 flex items-center gap-2 text-[13px] text-secondary">
                <input type="checkbox" checked={closeAfter} onChange={e => setCloseAfter(e.target.checked)} className="h-4 w-4" />
                Also close the public waitlist form once this sends
              </label>

              {error && <p className="mb-3 text-[12px] text-error">{error}</p>}

              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!subject.trim() || !message.trim() || waitingCount === 0}
                  className="flex items-center gap-2 rounded-[9px] bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Send size={14} />
                  Send to {waitingCount} waiting
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-secondary">
                    Send to all {waitingCount}{closeAfter ? ' and close the form' : ''}?
                  </span>
                  <button onClick={handleSend} disabled={isPending} className="rounded-[7px] bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                    {isPending ? 'Sending…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirming(false)} className="rounded-[7px] border border-border bg-transparent px-3 py-1.5 text-xs text-secondary">
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
