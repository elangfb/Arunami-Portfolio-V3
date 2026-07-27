import type { FinancialData, InvestorAllocation, Portfolio, PortfolioConfig } from '@/types'
import { calculateDistribution } from './distributionStrategies'
import { resolveInvestorConfigForPeriod, type ConfigVersion } from './configTimeline'
import { getFinancialData, getPortfolioConfigOrDefault, getConfigTimeline } from './firestore'

// Cross-portfolio analytics for the BA-PM (analyst) global views. Reuses the
// distribution engine with a "whole portfolio" allocation (100% ownership on the
// total investment) so a portfolio-level yield falls straight out of the same
// per-investor math used everywhere else.
//
// Analyst views report bagi hasil GROSS — the investor pool's full share of the
// split, before the Arunami fee. That is the figure that reconciles with the
// configured percentage: a 50% split on a 30.739.009 net profit reads
// 15.369.504, not the 13.832.554 an investor nets after a 10% fee. The investor
// pages deliberately differ; they report actual payouts, which are net.

export interface MonthlyMetricRow {
  portfolioId: string
  brandName: string
  month: string
  revenue: number
  netProfit: number
  /** Gross of the Arunami fee — see the note at the top of this file. */
  bagiHasil: number
  monthlyYield: number
  annualizedYield: number
  adjustedAnnualizedYield: number
}

export interface PortfolioMetric {
  portfolio: Portfolio
  latestPeriod?: string
  revenue: number
  netProfit: number
  /** Gross of the Arunami fee — see the note at the top of this file. */
  bagiHasil: number
  monthlyYield: number
  annualizedYield: number
  adjustedAnnualizedYield: number
  /** Whether the portfolio has any actual (reported) month. */
  hasData: boolean
  /** Whether it has an actual for the given "current" period (submission check). */
  hasCurrentPeriod: boolean
  monthly: MonthlyMetricRow[]
}

/** A whole-portfolio stand-in allocation: 100% of the total investment. */
function wholePortfolioAllocation(portfolio: Portfolio): InvestorAllocation {
  return {
    id: '_portfolio',
    investorUid: '', investorName: '', investorEmail: '',
    portfolioId: portfolio.id, portfolioName: portfolio.name, portfolioCode: portfolio.code,
    investedAmount: portfolio.investasiAwal,
    ownershipPercent: 100,
    // joinedAt/updatedAt are unused by the distribution math.
  } as unknown as InvestorAllocation
}

export function computePortfolioMetric(
  portfolio: Portfolio,
  financialData: FinancialData | null,
  config: PortfolioConfig | null,
  currentPeriod?: string,
  configTimeline: ConfigVersion[] = [],
): PortfolioMetric {
  const empty: PortfolioMetric = {
    portfolio, revenue: 0, netProfit: 0, bagiHasil: 0,
    monthlyYield: 0, annualizedYield: 0, adjustedAnnualizedYield: 0,
    hasData: false, hasCurrentPeriod: false, monthly: [],
  }
  if (!financialData || !config) return empty

  const alloc = wholePortfolioAllocation(portfolio)
  const invested = alloc.investedAmount
  const returnsPrincipal = config.returnsPrincipal !== false // default true unless explicitly off
  const adjFactor = returnsPrincipal ? 1 : 0.8

  const revByMonth = new Map(financialData.revenueData.map(r => [r.month, r.aktual]))

  const monthly: MonthlyMetricRow[] = []
  for (const p of financialData.profitData) {
    if (p.aktual === 0) continue // skip months with no reported actual
    const revenue = revByMonth.get(p.month) ?? 0
    const result = calculateDistribution({
      reportData: { period: p.month, revenue, netProfit: p.aktual, grossProfit: 0 },
      // Terms as they stood for this month, not today's.
      config: resolveInvestorConfigForPeriod(config, configTimeline, p.month),
      allocation: alloc,
      portfolio,
    })
    // Gross basis: result.roiPercent/annualRoiPercent are derived from the
    // post-fee amount, so re-derive both from the gross share instead of
    // reusing them. One profitData row is one month, matching the strategy's
    // own annualisation when monthsInPeriod is left at its default of 1.
    const gross = result.grossInvestorAmount
    const monthlyYield = invested > 0 ? (gross / invested) * 100 : 0
    const annualizedYield = monthlyYield * 12
    monthly.push({
      portfolioId: portfolio.id,
      brandName: portfolio.brandName || portfolio.name,
      month: p.month,
      revenue,
      netProfit: p.aktual,
      bagiHasil: gross,
      monthlyYield,
      annualizedYield,
      adjustedAnnualizedYield: annualizedYield * adjFactor,
    })
  }

  const latest = monthly[monthly.length - 1]
  return {
    portfolio,
    latestPeriod: latest?.month,
    revenue: latest?.revenue ?? 0,
    netProfit: latest?.netProfit ?? 0,
    bagiHasil: latest?.bagiHasil ?? 0,
    monthlyYield: latest?.monthlyYield ?? 0,
    annualizedYield: latest?.annualizedYield ?? 0,
    adjustedAnnualizedYield: latest?.adjustedAnnualizedYield ?? 0,
    hasData: monthly.length > 0,
    hasCurrentPeriod: currentPeriod ? monthly.some(m => m.month === currentPeriod) : false,
    monthly,
  }
}

/**
 * Load + compute metrics for a set of portfolios in parallel. One financialData
 * + config read per portfolio; a failing portfolio degrades to an empty metric
 * rather than aborting the batch.
 */
export async function loadPortfolioMetrics(
  portfolios: Portfolio[],
  currentPeriod?: string,
): Promise<PortfolioMetric[]> {
  return Promise.all(
    portfolios.map(async p => {
      try {
        const [fd, cfg, timeline] = await Promise.all([
          getFinancialData(p.id),
          getPortfolioConfigOrDefault(p.id),
          getConfigTimeline(p.id),
        ])
        return computePortfolioMetric(p, fd, cfg, currentPeriod, timeline)
      } catch (err) {
        console.error(`Failed to compute metrics for ${p.code}`, err)
        return computePortfolioMetric(p, null, null, currentPeriod)
      }
    }),
  )
}
