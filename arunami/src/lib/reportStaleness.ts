// Which already-published investor reports a backdated profit-sharing change
// has invalidated.
//
// This is DERIVED, never stored. A stored flag was the obvious design and it
// doesn't work: accumulated and all-time reports live only in the top-level
// `investorReports` collection, which `firestore.rules` lets analysts write but
// not read or list. An analyst backdating a change therefore cannot discover
// those docs to mark them, and blind writes would either invent junk documents
// or fire hundreds of speculative updates.
//
// Deriving instead is also simply more correct: it covers changes recorded
// before this existed, it can't drift out of sync with `equityHistory`, and
// re-publishing clears it for free by moving `publishedAt` past the change.

import { periodAnchorMonth } from './configTimeline'
import { isReportingPeriodKey, comparePeriods } from './dateUtils'
import { ALL_TIME_PERIOD } from '@/types'
import type { EquityChangeEntry, InvestorReportDoc } from '@/types'

/**
 * Would a change effective from `fromPeriod` invalidate this report? True for
 * published reports whose own period is `fromPeriod` or later.
 *
 * The *forward-looking* question the Profit Sharing dialog asks before a
 * backdate is committed — distinct from {@link reportStaleness}, which answers
 * whether an already-recorded change has invalidated a report after the fact.
 */
export function wouldBackdateInvalidate(
  report: InvestorReportDoc,
  fromPeriod: string,
): boolean {
  return report.status === 'published'
    && isReportingPeriodKey(report.period)
    && isReportingPeriodKey(fromPeriod)
    && comparePeriods(report.period, fromPeriod) >= 0
}

/**
 * What a change effective from `fromPeriod` would restate: how many published
 * reports, and the distinct periods they cover (several investors share one).
 */
export function backdateImpact(
  reports: InvestorReportDoc[],
  fromPeriod: string,
): { reportCount: number; periods: string[] } {
  const affected = reports.filter(r => wouldBackdateInvalidate(r, fromPeriod))
  return {
    reportCount: affected.length,
    periods: [...new Set(affected.map(r => r.period))].sort(comparePeriods),
  }
}

export interface StaleVerdict {
  /** Earliest period whose terms changed after this report went out. */
  since: string
  /** The changes responsible, newest first — enough to explain the badge. */
  changes: EquityChangeEntry[]
}

/**
 * When the report was last put in front of the investor. Falls back to
 * `updatedAt` for legacy docs written before `publishedAt` was recorded, so
 * those get judged on real evidence rather than silently never going stale.
 */
function issuedAtSeconds(report: InvestorReportDoc): number | null {
  return report.publishedAt?.seconds ?? report.updatedAt?.seconds ?? null
}

/**
 * Does `change` govern the period `report` covers?
 *
 * All-time reports span every period, so any change touches them. Everything
 * else is compared on the same anchor `resolveConfigForPeriod` uses — a quarter
 * resolves on its FIRST month, so a change effective mid-quarter belongs to the
 * next quarter and must not flag this one.
 */
function changeCoversReport(change: EquityChangeEntry, report: InvestorReportDoc): boolean {
  if (!isReportingPeriodKey(change.effectiveFromPeriod)) return false
  if (report.period === ALL_TIME_PERIOD || report.scope === 'all_time') return true
  const anchor = periodAnchorMonth(report.period)
  return anchor !== null && change.effectiveFromPeriod <= anchor
}

/**
 * Why `report` is out of date, or null if it isn't.
 *
 * Stale means: published, and some config change governing its period was
 * recorded *after* it was issued. Pass every change from every portfolio the
 * report draws on — one portfolio for a per-portfolio report, all of the
 * investor's portfolios for an accumulated or all-time one.
 */
export function reportStaleness(
  report: InvestorReportDoc,
  changes: EquityChangeEntry[],
): StaleVerdict | null {
  if (report.status !== 'published') return null
  const issuedAt = issuedAtSeconds(report)
  if (issuedAt === null) return null

  const invalidating = changes.filter(c =>
    (c.changedAt?.seconds ?? 0) > issuedAt && changeCoversReport(c, report),
  )
  if (invalidating.length === 0) return null

  return {
    since: invalidating.reduce(
      (min, c) => c.effectiveFromPeriod < min ? c.effectiveFromPeriod : min,
      invalidating[0].effectiveFromPeriod,
    ),
    changes: [...invalidating].sort(
      (a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0),
    ),
  }
}

/**
 * Staleness for a batch of reports, keyed by report id. `changesByPortfolio`
 * maps a portfolio id to its `equityHistory`; accumulated and all-time reports
 * are judged against every portfolio in the map, since that is what they span.
 */
export function staleReportMap(
  reports: InvestorReportDoc[],
  changesByPortfolio: Record<string, EquityChangeEntry[]>,
): Record<string, StaleVerdict> {
  const allChanges = Object.values(changesByPortfolio).flat()
  const out: Record<string, StaleVerdict> = {}
  for (const r of reports) {
    const spansEverything = r.scope === 'accumulated' || r.scope === 'all_time'
    const changes = spansEverything ? allChanges : (changesByPortfolio[r.portfolioId] ?? [])
    const verdict = reportStaleness(r, changes)
    if (verdict) out[r.id] = verdict
  }
  return out
}
