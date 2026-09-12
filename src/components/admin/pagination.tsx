// src/components/admin/pagination.tsx
import Link from 'next/link'

export function AdminPagination({ page, totalPages, basePath, extraParams = '' }: {
  page: number; totalPages: number; basePath: string; extraParams?: string
}) {
  if (totalPages <= 1) return null
  const sep = extraParams ? '&' : ''

  const btnClass =
    'rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] text-secondary no-underline transition-colors hover:text-primary'

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={`${basePath}?page=${page - 1}${sep}${extraParams}`} className={btnClass}>
          ← Previous
        </Link>
      )}
      <span className="px-3 py-2.5 text-[13px] text-faint">Page {page} of {totalPages}</span>
      {page < totalPages && (
        <Link href={`${basePath}?page=${page + 1}${sep}${extraParams}`} className={btnClass}>
          Next →
        </Link>
      )}
    </div>
  )
}
