import { cn } from '@/lib/utils'
import {
  contractStatus, CONTRACT_LABELS, CONTRACT_BADGE_CLASSES, daysRemainingLabel,
  type ContractSeverity,
} from '@/lib/contracts'

/** Small severity pill (Aman / Segera / Kritis / Tanpa Kontrak). */
export function ContractBadge({
  severity,
  size = 'sm',
}: {
  severity: ContractSeverity
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        CONTRACT_BADGE_CLASSES[severity],
      )}
    >
      {CONTRACT_LABELS[severity]}
    </span>
  )
}

/**
 * Contract-duration progress bar + days-remaining caption. Derives everything
 * from the portfolio's start/end dates; renders a muted "Tanpa kontrak" note
 * when no end date is set. Additive — drops into any card/table cell.
 */
export function ContractDurationBar({
  start,
  end,
  className,
}: {
  start?: string
  end?: string
  className?: string
}) {
  const { severity, daysRemaining, elapsedFraction } = contractStatus(start, end)

  if (severity === 'unknown') {
    return <p className={cn('text-xs text-muted-foreground', className)}>Tanpa kontrak</p>
  }

  const pct = elapsedFraction !== null ? Math.round(elapsedFraction * 100) : null
  const barColor =
    severity === 'kritis' ? 'bg-red-500' : severity === 'segera' ? 'bg-yellow-500' : 'bg-[#38a169]'

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[11px]">
        <ContractBadge severity={severity} />
        <span className={cn('font-medium', severity === 'kritis' ? 'text-red-600' : 'text-muted-foreground')}>
          {daysRemainingLabel(daysRemaining)}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
