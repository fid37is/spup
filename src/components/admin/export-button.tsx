// src/components/admin/export-button.tsx
'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

/**
 * Downloads a file from an /api/admin/export/* endpoint.
 *
 * Uses fetch + a temporary object URL instead of a plain <a href download>
 * so that failures (expired session, moderator without export rights, server
 * error) show as an inline message here rather than navigating the admin
 * away to a raw JSON error page.
 */
export function ExportButton({ href, label }: { href: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function handleClick() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(href, { credentials: 'same-origin', cache: 'no-store' })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setMessage({ tone: 'error', text: body?.error || `Export failed (${res.status})` })
        return
      }

      const blob = await res.blob()
      const filename =
        /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'export'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      const count = res.headers.get('X-Export-Count')
      const skipped = Number(res.headers.get('X-Export-Skipped') || 0)
      setMessage({
        tone: 'ok',
        text: count === null
          ? 'Downloaded'
          : `${Number(count).toLocaleString()} email${count === '1' ? '' : 's'} exported`
            + (skipped > 0 ? ` · ${skipped.toLocaleString()} skipped (no email)` : ''),
      })
    } catch {
      setMessage({ tone: 'error', text: 'Network error - please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-secondary transition-colors hover:text-primary disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {busy ? 'Preparing…' : label}
      </button>
      {message && (
        <span
          role="status"
          className={`max-w-[260px] text-[11px] ${message.tone === 'error' ? 'text-error' : 'text-faint'}`}
        >
          {message.text}
        </span>
      )}
    </div>
  )
}
