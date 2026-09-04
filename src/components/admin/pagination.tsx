// src/components/admin/pagination.tsx
export function AdminPagination({ page, totalPages, basePath, extraParams = '' }: {
  page: number; totalPages: number; basePath: string; extraParams?: string
}) {
  if (totalPages <= 1) return null
  const sep = extraParams ? '&' : ''

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
      {page > 1 && (
        <a href={`${basePath}?page=${page - 1}${sep}${extraParams}`} style={{ padding: '8px 16px', background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 8, color: '#8A8A85', textDecoration: 'none', fontSize: 13 }}>
          ← Previous
        </a>
      )}
      <span style={{ padding: '8px 16px', fontSize: 13, color: '#44444A' }}>Page {page} of {totalPages}</span>
      {page < totalPages && (
        <a href={`${basePath}?page=${page + 1}${sep}${extraParams}`} style={{ padding: '8px 16px', background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 8, color: '#8A8A85', textDecoration: 'none', fontSize: 13 }}>
          Next →
        </a>
      )}
    </div>
  )
}