// src/components/admin/data-table.tsx
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  /** Skip this column in the mobile card view (e.g. a secondary/verbose field). */
  mobileHidden?: boolean
}

export function DataTable<T>({
  columns, rows, keyField, emptyMessage = 'No records found',
}: {
  columns: Column<T>[]
  rows: T[]
  keyField: keyof T
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-5 py-16 text-center">
        <p className="text-sm text-faint">{emptyMessage}</p>
      </div>
    )
  }

  const [headerCol, ...restCols] = columns
  const cardCols = restCols.filter(c => !c.mobileHidden)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Mobile: stacked cards */}
      <div className="divide-y divide-[color:var(--color-border)] md:hidden">
        {rows.map(row => (
          <div key={String(row[keyField])} className="p-4">
            <div className="mb-2">{headerCol.render(row)}</div>
            {cardCols.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {cardCols.map(col => (
                  <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-xs font-bold tracking-wide text-faint">{col.header.toUpperCase()}</span>
                    <span className="text-right text-primary">{col.render(row)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop / tablet: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {columns.map(col => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-5 py-3 text-[11px] font-bold tracking-wide text-faint"
                  style={{ textAlign: col.align || 'left', width: col.width }}
                >
                  {col.header.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={String(row[keyField])}
                className={i < rows.length - 1 ? 'border-b border-[color:var(--color-border)]/60' : ''}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-5 py-3.5 align-middle" style={{ textAlign: col.align || 'left' }}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}