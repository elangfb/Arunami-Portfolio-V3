// Period-aware resolution of a portfolio's return config.
//
// `portfolios/{id}/config/current` holds only the LATEST terms. Calculating an
// old period against it would retroactively restate that period — the exact
// thing the Profit Sharing page promises never happens ("Perubahan hanya
// berlaku untuk laporan mulai periode ...").
//
// Every config change is already recorded in `equityHistory` with the
// `effectiveFromPeriod` the analyst chose, plus full before/after snapshots of
// the investor config. Replaying those rows gives a version timeline, and
// `resolveConfigForPeriod` picks the version in force for a given period.
//
// Legacy safety: rows written before the snapshots existed are skipped, so a
// portfolio with only legacy history resolves to the live config for every
// period — identical to the previous behaviour.

import { isQuarterPeriod, quarterToMonths } from './dateUtils'
import type {
  EquityChangeEntry, InvestorConfigUnion, PortfolioConfig, ReturnModelType,
} from '@/types'

export interface ConfigVersion {
  /** "YYYY-MM" the version takes effect. "" = baseline, covers every earlier period. */
  effectiveFromPeriod: string
  investorConfig: InvestorConfigUnion
  returnModel: ReturnModelType
}

/** Seconds of an equityHistory row's timestamp, for stable tiebreaking. */
function changedAtSeconds(entry: EquityChangeEntry): number {
  return entry.changedAt?.seconds ?? 0
}

/**
 * Turn `equityHistory` rows into an ascending version timeline.
 *
 * The earliest snapshot-bearing row also contributes a baseline version (its
 * `fromInvestorConfig`, effective from "") so periods predating the first
 * recorded change resolve to the terms that applied back then, not to today's.
 */
export function buildConfigTimeline(history: EquityChangeEntry[]): ConfigVersion[] {
  const withSnapshots = history
    .filter(e => !!e.toInvestorConfig && !!e.effectiveFromPeriod)
    .sort((a, b) => {
      const cmp = a.effectiveFromPeriod.localeCompare(b.effectiveFromPeriod)
      return cmp !== 0 ? cmp : changedAtSeconds(a) - changedAtSeconds(b)
    })

  if (withSnapshots.length === 0) return []

  // Baseline: what was in force before the earliest recorded change.
  const earliest = withSnapshots[0]
  const versions: ConfigVersion[] = []
  if (earliest.fromInvestorConfig) {
    versions.push({
      effectiveFromPeriod: '',
      investorConfig: earliest.fromInvestorConfig,
      returnModel: earliest.fromReturnModel ?? earliest.fromInvestorConfig.type,
    })
  }

  for (const e of withSnapshots) {
    const investorConfig = e.toInvestorConfig!
    versions.push({
      effectiveFromPeriod: e.effectiveFromPeriod,
      investorConfig,
      returnModel: e.toReturnModel ?? investorConfig.type,
    })
  }

  return versions
}

/**
 * The month a period is anchored to for version lookup. Quarterly reports
 * ("2026-Q3") resolve on the quarter's first month, so a change effective
 * mid-quarter applies from the following quarter rather than restating one
 * already under way.
 */
export function periodAnchorMonth(period: string): string | null {
  if (isQuarterPeriod(period)) return quarterToMonths(period)[0] ?? null
  return /^\d{4}-\d{2}$/.test(period) ? period : null
}

/**
 * The version in force for `period`, or null when the timeline can't answer
 * (empty, unparseable period, or the period predates the baseline).
 */
export function findConfigVersionForPeriod(
  timeline: ConfigVersion[],
  period: string,
): ConfigVersion | null {
  if (timeline.length === 0) return null
  const anchor = periodAnchorMonth(period)
  if (!anchor) return null

  let match: ConfigVersion | null = null
  for (const v of timeline) {
    if (v.effectiveFromPeriod === '' || v.effectiveFromPeriod <= anchor) match = v
    else break // ascending — nothing further can apply
  }
  return match
}

/**
 * The portfolio config as it stood for `period` — `investorConfig` and
 * `returnModel` swapped for the version in force, everything else untouched.
 *
 * Returns `config` unchanged when the timeline can't answer, or when the match
 * is the newest version (which is what `config/current` already holds).
 */
export function resolveConfigForPeriod(
  config: PortfolioConfig,
  timeline: ConfigVersion[],
  period: string,
): PortfolioConfig {
  const match = findConfigVersionForPeriod(timeline, period)
  if (!match || match === timeline[timeline.length - 1]) return config
  return { ...config, investorConfig: match.investorConfig, returnModel: match.returnModel }
}

/** Convenience for callers that only need the investor config for a period. */
export function resolveInvestorConfigForPeriod(
  config: PortfolioConfig,
  timeline: ConfigVersion[],
  period: string,
): InvestorConfigUnion {
  return resolveConfigForPeriod(config, timeline, period).investorConfig
}
