import { formatCurrencyCompact } from '@/lib/utils'

/**
 * Read-only cap-table fill indicator: how much of a portfolio's target
 * investment is covered by current allocations, with an oversubscription
 * (>100%) warning. Purely additive — surfaces the spec's "oversubscription is
 * surfaced" behavior without changing the surrounding editors.
 */
export function CapTableFillBar({ raised, target }: { raised: number; target: number }) {
  const pct = target > 0 ? (raised / target) * 100 : 0
  const over = pct > 100
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Terisi vs Target</span>
        <span className={over ? 'font-semibold text-red-600' : 'font-medium'}>
          {formatCurrencyCompact(raised)} / {target > 0 ? formatCurrencyCompact(target) : '—'} · {pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-[#38a169]'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {over && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Oversubscribed — total alokasi melebihi target investasi ({(pct - 100).toFixed(1)}% di atas).
        </p>
      )}
    </div>
  )
}
