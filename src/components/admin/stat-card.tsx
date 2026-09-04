
// src/components/admin/stat-card.tsx
export function StatCard({ icon: Icon, label, value, sub, color = '#1A9E5F', danger = false }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string; danger?: boolean
}) {
  return (
    <div style={{
      background: '#0D0D12', border: `1px solid ${danger ? 'rgba(229,57,53,0.2)' : '#1E1E26'}`,
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#6A6A60', fontWeight: 500, letterSpacing: '0.04em' }}>{label}</div>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: danger ? 'rgba(229,57,53,0.1)' : `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={danger ? '#E53935' : color} />
        </div>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: '#F0F0EC', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: danger ? '#E53935' : '#44444A', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}