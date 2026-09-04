// src/components/admin/data-table.tsx
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
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
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#44444A' }}>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1E1E26' }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.align || 'left', padding: '12px 20px',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                    color: '#44444A', width: col.width, whiteSpace: 'nowrap',
                  }}
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
                style={{ borderBottom: i < rows.length - 1 ? '1px solid #141418' : 'none' }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '14px 20px', textAlign: col.align || 'left', verticalAlign: 'middle' }}>
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