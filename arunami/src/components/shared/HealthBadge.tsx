import { cn } from '@/lib/utils'
import { HEALTH_LABELS, healthFreshness } from '@/lib/health'
import type { HealthLevel } from '@/types'

/** Per-level pill colouring — greens for healthy, escalating amber → red. */
const LEVEL_CLASSES: Record<HealthLevel, string> = {
  sehat: 'bg-green-100 text-green-800',
  siaga_3: 'bg-yellow-100 text-yellow-800',
  siaga_2: 'bg-orange-100 text-orange-800',
  siaga_1: 'bg-red-100 text-red-800',
}

/**
 * Reusable Siaga health pill with an on-hover tooltip listing the reasons the
 * portfolio reached that level. Self-contained (CSS group-hover) so it drops
 * into any list/card without extra wiring. Defaults to `sehat` when the level
 * is absent (older portfolios with no computed health).
 *
 * Pass `computedAt` — explicitly as `null` when the portfolio has none — to
 * stamp the badge with how current the level is; a level that was saved too
 * long ago gets an amber dot, because "Sehat" from six months back is a stale
 * reading, not a clean bill of health. Omitting the prop hides freshness
 * entirely (for surfaces where the age isn't actionable).
 */
export function HealthBadge({
  level,
  reasons,
  computedAt,
  size = 'sm',
}: {
  level?: HealthLevel
  reasons?: string[]
  computedAt?: { seconds: number } | Date | null
  size?: 'sm' | 'md'
}) {
  const l = level ?? 'sehat'
  const hasReasons = (reasons?.length ?? 0) > 0
  const freshness = computedAt !== undefined ? healthFreshness(computedAt) : null
  const showTooltip = hasReasons || freshness !== null
  return (
    <span className="group relative inline-flex">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-semibold',
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
          LEVEL_CLASSES[l],
        )}
      >
        {HEALTH_LABELS[l]}
        {freshness?.isStale && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          />
        )}
      </span>
      {showTooltip && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-max max-w-xs rounded-md border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md group-hover:block">
          {hasReasons && (
            <>
              <span className="mb-1 block font-semibold">Alasan</span>
              <ul className="list-disc space-y-0.5 pl-4">
                {reasons!.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}
          {freshness && (
            <span
              className={cn(
                'block',
                hasReasons && 'mt-2 border-t pt-1.5',
                freshness.isStale ? 'text-amber-600' : 'text-muted-foreground',
              )}
            >
              {freshness.label}
              {freshness.isStale && ' — perlu ditinjau ulang'}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
