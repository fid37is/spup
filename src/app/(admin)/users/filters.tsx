'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import Link from 'next/link'

export function AdminUserFilters({ initialQuery, initialStatus }: {
  initialQuery: string
  initialStatus: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updateUrl(next: { q?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString())

    const q = next.q !== undefined ? next.q : query
    const status = next.status !== undefined ? next.status : (searchParams.get('status') || '')

    if (q) params.set('q', q); else params.delete('q')
    if (status) params.set('status', status); else params.delete('status')
    params.delete('page') // reset to page 1 whenever filters change

    router.push(`${pathname}?${params.toString()}`)
  }

  // Debounce the text search so it doesn't navigate on every keystroke
  useEffect(() => {
    if (query === initialQuery) return // skip on mount / after a URL-driven update
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateUrl({ q: query }), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const status = searchParams.get('status') || ''

  return (
    <div className="mb-5 flex flex-col gap-2.5 sm:flex-row">
      <div className="relative flex-1 sm:max-w-[360px]">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or username…"
          className="w-full rounded-[9px] border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-primary outline-none"
        />
      </div>
      <div className="flex gap-2.5">
        <select
          value={status}
          onChange={e => updateUrl({ status: e.target.value })}
          className="flex-1 rounded-[9px] border border-border bg-surface px-3 py-2.5 text-sm text-primary outline-none sm:flex-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="pending_verification">Pending verification</option>
        </select>
        {(query || status) && (
          <Link
            href={pathname}
            className="flex items-center rounded-[9px] bg-[color:var(--color-surface-3)] px-3.5 py-2.5 text-sm text-secondary no-underline"
          >
            Clear
          </Link>
        )}
      </div>
    </div>
  )
}