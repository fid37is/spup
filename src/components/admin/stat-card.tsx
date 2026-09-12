// src/components/admin/stat-card.tsx
import { cn } from '@/lib/utils'

export function StatCard({ icon: Icon, label, value, sub, color = '#1A9E5F', danger = false }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string; danger?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface p-4 sm:p-5',
        danger ? 'border-error/20' : 'border-border'
      )}
    >
      <div className="mb-3 flex items-start justify-between sm:mb-3.5">
        <div className="text-[11px] font-medium tracking-wide text-secondary sm:text-xs">{label}</div>
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px]',
            danger && 'bg-error/10'
          )}
          style={danger ? undefined : { background: `${color}18` }}
        >
          <Icon size={15} color={danger ? 'var(--color-error)' : color} />
        </div>
      </div>
      <div className="font-display text-2xl font-extrabold tracking-tight text-primary sm:text-[28px]">
        {value}
      </div>
      {sub && (
        <div className={cn('mt-1 text-xs', danger ? 'text-error' : 'text-faint')}>{sub}</div>
      )}
    </div>
  )
}
