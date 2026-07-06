import type { FinancialData, InvestorAllocation, Portfolio, PortfolioConfig } from '@/types'
import { calculateDistribution } from './distributionStrategies'
import { getFinancialData, getPortfolioConfigOrDefault } from './firestore'

// Cross-portfolio analytics for the BA-PM (analyst) global views. Reuses the
// distribution engine with a "whole portfolio" allocation (100% ownership on the
// total investment) so a portfolio-level yield falls straight out of the same
// per-investor math used everywhere else.

export interface MonthlyMetricRow {
  portfolioId: string
  brandName: string
  month: string
  revenue: number
  netProfit: number
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
): PortfolioMetric {
  const empty: PortfolioMetric = {
    portfolio, revenue: 0, netProfit: 0, bagiHasil: 0,
    monthlyYield: 0, annualizedYield: 0, adjustedAnnualizedYield: 0,
    hasData: false, hasCurrentPeriod: false, monthly: [],
  }
  if (!financialData || !config) return empty

  const alloc = wholePortfolioAllocation(portfolio)
  const returnsPrincipal = config.returnsPrincipal !== false // default true unless explicitly off
  const adjFactor = returnsPrincipal ? 1 : 0.8

  const revByMonth = new Map(financialData.revenueData.map(r => [r.month, r.aktual]))

  const monthly: MonthlyMetricRow[] = []
  for (const p of financialData.profitData) {
    if (p.aktual === 0) continue // skip months with no reported actual
    const revenue = revByMonth.get(p.month) ?? 0
    const result = calculateDistribution({
      reportData: { period: p.month, revenue, netProfit: p.aktual, grossProfit: 0 },
      config: config.investorConfig,
      allocation: alloc,
      portfolio,
    })
    monthly.push({
      portfolioId: portfolio.id,
      brandName: portfolio.brandName || portfolio.name,
      month: p.month,
      revenue,
      netProfit: p.aktual,
      bagiHasil: result.perInvestorAmount,
      monthlyYield: result.roiPercent,
      annualizedYield: result.annualRoiPercent,
      adjustedAnnualizedYield: result.annualRoiPercent * adjFactor,
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
        const [fd, cfg] = await Promise.all([
          getFinancialData(p.id),
          getPortfolioConfigOrDefault(p.id),
        ])
        return computePortfolioMetric(p, fd, cfg, currentPeriod)
      } catch (err) {
        console.error(`Failed to compute metrics for ${p.code}`, err)
        return computePortfolioMetric(p, null, null, currentPeriod)
      }
    }),
  )
}
