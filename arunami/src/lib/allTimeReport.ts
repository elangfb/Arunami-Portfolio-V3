// All-time investor report computation.
//
// Aggregates an investor's lifetime performance across ALL portfolios, summing
// earnings over ONLY the periods that have a published report. Reuses the exact
// per-period engine (`calculateDistribution`) so all-time totals reconcile with
// the per-period accumulated reports, AdminInvestorDetail, and InvestorReturnsPage.
//
// Double-count safety: published periods (monthly "YYYY-MM" and quarterly
// "YYYY-Qn") are collapsed to a deduped set of constituent months before
// summing — a month covered by both a monthly and an overlapping quarterly
// report is counted once.

import { calculateDistribution } from './distributionStrategies'
import { resolveInvestorConfigForPeriod } from './configTimeline'
import { isQuarterPeriod, quarterToMonths, comparePeriods } from './dateUtils'
import type { InvestorReportSource } from './firestore'
import {
  ALL_TIME_PERIOD,
  type InvestorReportDoc,
  type InvestorConfigUnion,
} from '@/types'

export interface AllTimePeriodLine {
  period: string // "YYYY-MM"
  netProfit: number
  earnings: number
  roi: number
}

export interface AllTimePortfolioLine {
  portfolioName: string
  brandName?: string
  portfolioCode: string
  invested: number
  cumulativeEarnings: number
  /** cumulativeEarnings / invested * 100 (uses the current invested amount). */
  allTimeROI: number
  monthsCounted: number
  byPeriod: AllTimePeriodLine[]
}

export interface AllTimeReportSummary {
  investorName: string
  lines: AllTimePortfolioLine[]
  totalInvested: number
  totalCumulativeEarnings: number
  overallROI: number
  coverage: { firstMonth: string | null; latestMonth: string | null; monthsCounted: number }
}

/** Expand a published-report period (monthly or quarterly) to its YYYY-MM months. */
function periodToMonths(period: string): string[] {
  if (period === ALL_TIME_PERIOD) return []
  return isQuarterPeriod(period) ? quarterToMonths(period) : [period]
}

/**
 * Compute an investor's all-time report from their report sources and the set
 * of published reports. Only published periods count; for each portfolio the
 * published months are intersected with the months that actually have a P&L
 * (mirrors how per-period accumulated reports include a portfolio only when it
 * has data for that period).
 */
export function computeAllTimeReport(args: {
  investorName: string
  sources: InvestorReportSource[]
  publishedReports: InvestorReportDoc[]
  isArunamiTeam?: boolean
}): AllTimeReportSummary {
  const { investorName, sources, publishedReports, isArunamiTeam } = args

  // Published periods, excluding the all-time doc itself.
  const published = publishedReports.filter(
    r => r.scope !== 'all_time' && r.period !== ALL_TIME_PERIOD,
  )

  // Accumulated (all-portfolio) report months apply to every portfolio.
  const accumulatedMonths = new Set<string>()
  // Portfolio-scoped report months apply only to their own portfolio.
  const portfolioMonths = new Map<string, Set<string>>()
  for (const r of published) {
    if (r.scope === 'accumulated') {
      for (const m of periodToMonths(r.period)) accumulatedMonths.add(m)
    } else {
      const set = portfolioMonths.get(r.portfolioId) ?? new Set<string>()
      for (const m of periodToMonths(r.period)) set.add(m)
      portfolioMonths.set(r.portfolioId, set)
    }
  }

  const lines: AllTimePortfolioLine[] = []
  const coverageMonths = new Set<string>()

  for (const src of sources) {
    if (!src.portfolio || !src.allocation) continue
    const { portfolio, allocation } = src

    // Months this portfolio has a P&L for.
    const pnlMonths = new Set(src.pnlReports.map(r => r.period).filter(Boolean))

    // Published months relevant to this portfolio = accumulated ∪ its own.
    // Normally restricted to months that actually have a P&L — but a grace
    // project has no P&L, so its published grace months count directly
    // (otherwise a fixed-yield grace payout would be dropped from all-time).
    const isGrace = portfolio.isGracePeriod === true
    const candidate = new Set<string>(accumulatedMonths)
    const own = portfolioMonths.get(allocation.portfolioId)
    if (own) for (const m of own) candidate.add(m)
    const months = (isGrace ? [...candidate] : [...candidate].filter(m => pnlMonths.has(m)))
      .sort(comparePeriods)
    if (months.length === 0) continue

    const fallbackConfig: InvestorConfigUnion = {
      type: 'percentage_based',
      investorSharePercent: src.investorSharePercent,
      arunamiFeePercent: 0,
    }
    // The terms in force for a given month — a later change to the split must
    // not restate months already counted.
    const configFor = (month: string): InvestorConfigUnion =>
      src.config
        ? resolveInvestorConfigForPeriod(src.config, src.configTimeline ?? [], month)
        : fallbackConfig

    // Aggregation shape (per-month vs per-year vs whole-range) follows the
    // portfolio's current model; only the terms vary per period.
    const modelType = src.config?.investorConfig?.type ?? 'percentage_based'

    const byPeriod: AllTimePeriodLine[] = []
    let cumulativeEarnings = 0

    if (isGrace) {
      // Grace distribution is the grace return (fixed yield or none), per month,
      // independent of the post-grace model. calculateDistribution is grace-aware.
      for (const m of months) {
        const res = calculateDistribution({
          reportData: null, config: configFor(m), allocation, portfolio, isArunamiTeam, monthsInPeriod: 1,
        })
        if (res.perInvestorAmount !== 0) {
          cumulativeEarnings += res.perInvestorAmount
          byPeriod.push({ period: m, netProfit: 0, earnings: res.perInvestorAmount, roi: res.roiPercent })
        }
      }
    } else if (modelType === 'annual_dividend') {
      // The declared dividend is per-year; calling per month would multiply it.
      // Sum once per distinct year among the published months.
      const years = [...new Set(months.map(m => m.split('-')[0]))].sort()
      for (const y of years) {
        const res = calculateDistribution({
          reportData: { period: `${y}-01`, revenue: 0, netProfit: 0, grossProfit: 0 },
          config: configFor(`${y}-01`), allocation, portfolio, isArunamiTeam, monthsInPeriod: 1,
        })
        if (res.perInvestorAmount !== 0) {
          cumulativeEarnings += res.perInvestorAmount
          byPeriod.push({ period: `${y}-01`, netProfit: 0, earnings: res.perInvestorAmount, roi: res.roiPercent })
        }
      }
    } else if (modelType === 'fixed_schedule') {
      // Scheduled payments are matched against the whole published range at once
      // (only `paid` entries in range count) to avoid double counting.
      // One call over the whole range, so it can only carry one config: use the
      // terms in force at the start of the published range.
      const res = calculateDistribution({
        reportData: null, config: configFor(months[0]), allocation, portfolio, isArunamiTeam,
        monthsInPeriod: months.length, scheduleMonths: months,
      })
      cumulativeEarnings += res.perInvestorAmount
      // Per-period breakdown for the trend table: attribute each paid month.
      for (const m of months) {
        const one = calculateDistribution({
          reportData: { period: m, revenue: 0, netProfit: 0, grossProfit: 0 },
          config: configFor(m), allocation, portfolio, isArunamiTeam, monthsInPeriod: 1, scheduleMonths: [m],
        })
        if (one.perInvestorAmount !== 0) {
          byPeriod.push({ period: m, netProfit: 0, earnings: one.perInvestorAmount, roi: one.roiPercent })
        }
      }
    } else {
      // net_profit_share / fixed_return / fixed_yield / revenue_share / custom — additive per month.
      for (const m of months) {
        const pnl = src.pnlReports.find(r => r.period === m) ?? null
        const reportData = pnl
          ? { period: m, revenue: pnl.revenue, netProfit: pnl.netProfit, grossProfit: pnl.grossProfit }
          : null
        const res = calculateDistribution({
          reportData, config: configFor(m), allocation, portfolio, isArunamiTeam, monthsInPeriod: 1,
        })
        cumulativeEarnings += res.perInvestorAmount
        byPeriod.push({ period: m, netProfit: pnl?.netProfit ?? 0, earnings: res.perInvestorAmount, roi: res.roiPercent })
      }
    }

    for (const m of months) coverageMonths.add(m)

    const invested = allocation.investedAmount
    lines.push({
      portfolioName: portfolio.name,
      brandName: portfolio.brandName,
      portfolioCode: allocation.portfolioCode,
      invested,
      cumulativeEarnings,
      allTimeROI: invested > 0 ? (cumulativeEarnings / invested) * 100 : 0,
      monthsCounted: months.length,
      byPeriod,
    })
  }

  lines.sort((a, b) => b.cumulativeEarnings - a.cumulativeEarnings)

  const totalInvested = lines.reduce((s, l) => s + l.invested, 0)
  const totalCumulativeEarnings = lines.reduce((s, l) => s + l.cumulativeEarnings, 0)
  const sortedCoverage = [...coverageMonths].sort(comparePeriods)

  return {
    investorName,
    lines,
    totalInvested,
    totalCumulativeEarnings,
    overallROI: totalInvested > 0 ? (totalCumulativeEarnings / totalInvested) * 100 : 0,
    coverage: {
      firstMonth: sortedCoverage[0] ?? null,
      latestMonth: sortedCoverage[sortedCoverage.length - 1] ?? null,
      monthsCounted: coverageMonths.size,
    },
  }
}
