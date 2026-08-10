import { Parser } from 'expr-eval'
import type {
  ReturnModelType, InvestorConfigUnion, InvestorAllocation, Portfolio,
  FixedYieldConfig, RevenueShareConfig, FixedScheduleConfig,
  AnnualDividendConfig, CustomConfig,
} from '@/types'

// ─── Core Interfaces ──────────────────────────────────────────────────────

export interface DistributionResult {
  totalDistribution: number
  /**
   * The slice of `totalDistribution` funded by Arunami's own investors —
   * `totalDistribution × arunamiPoolPercent/100`. Equals `totalDistribution`
   * when the portfolio has no outside co-investors. Absent for fixed_yield,
   * where no pool is divided at all.
   */
  arunamiPoolAmount?: number
  perInvestorAmount: number
  grossInvestorAmount: number
  arunamiFeeAmount: number
  /**
   * Optional social-fund (dana sosial) deducted from this investor's share, in
   * addition to the Arunami fee: net = gross − fee − social. Absent/0 unless the
   * caller passes `socialFundPercent`. Applied uniformly across all strategies.
   */
  socialFundAmount?: number
  isFeeExempt: boolean
  roiPercent: number
  annualRoiPercent: number
  breakdown: Record<string, number>
  label: string
}

export interface DistributionInput {
  reportData: {
    period: string
    revenue: number
    netProfit: number
    grossProfit: number
  } | null
  config: InvestorConfigUnion
  allocation: InvestorAllocation
  portfolio: Portfolio
  isArunamiTeam?: boolean
  /**
   * Number of months covered by this distribution. Defaults to 1 (monthly).
   * Set to 3 for quarterly. Affects time-based strategies (fixed_yield) and
   * extrapolation factors (annualRoiPercent), and instructs fixed_schedule
   * to sum payments across the period rather than match a single month.
   */
  monthsInPeriod?: number
  /**
   * Months whose schedule entries should be aggregated for `fixed_schedule`.
   * Optional; when omitted falls back to single-period match using reportData.period.
   */
  scheduleMonths?: string[]
  /**
   * Optional dana-sosial deduction as a % of the investor's gross share, applied
   * on top of the Arunami fee. Omit/0 to disable (default). Ad-hoc per calc — not
   * persisted in portfolio config.
   */
  socialFundPercent?: number
}

export interface DistributionStrategy {
  calculate(input: DistributionInput): DistributionResult
  requiredReportFields: ('revenue' | 'netProfit' | 'grossProfit' | 'none')[]
  displayName: string
  description: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export function ownershipFraction(allocation: InvestorAllocation, portfolio: Portfolio): number {
  if (allocation.ownershipPercent != null) return allocation.ownershipPercent / 100
  if (portfolio.investasiAwal > 0) return allocation.investedAmount / portfolio.investasiAwal
  return 0
}

/**
 * A stored `ownershipPercent` may sit this far from nominal ÷ target and still
 * be the same number — it is written rounded to 2 decimals, so it carries up to
 * ±0.005 of rounding. Anything beyond that is a deliberate admin override.
 */
const OWNERSHIP_DISPLAY_TOLERANCE = 0.01

/**
 * Ownership share for DISPLAY, in percent.
 *
 * Prefer this over reading `allocation.ownershipPercent` directly. The stored
 * value is a rounded copy of nominal ÷ target, so summing it across a cap table
 * drifts: 18 equal slices of 5.5555…%, each stored as 5.56%, total 100.05%.
 * Recomputing from the nominal keeps every row and every total exact.
 *
 * When the stored value differs from nominal by more than rounding, an admin
 * overrode it on purpose — and `ownershipFraction()` pays that override, so it
 * wins here too. The display must never quote a share the money contradicts.
 */
export function displayOwnershipPercent(
  allocation: InvestorAllocation,
  portfolio: Pick<Portfolio, 'investasiAwal'> | null | undefined,
): number {
  const stored = allocation.ownershipPercent
  const target = portfolio?.investasiAwal ?? 0
  // No target to divide by: the stored value is all we have.
  if (target <= 0) return stored ?? 0
  const computed = (allocation.investedAmount / target) * 100
  if (stored == null) return computed
  return Math.abs(stored - computed) > OWNERSHIP_DISPLAY_TOLERANCE ? stored : computed
}

/**
 * Fraction of the whole investor pool that belongs to Arunami's own investors.
 * Deals co-funded by investors outside Arunami set this below 1; the remainder
 * of the pool is theirs and is settled off this platform entirely.
 *
 * Anything that is not a number in (0, 100] resolves to 1 — absent (legacy
 * portfolios, and every equityHistory snapshot frozen before this field
 * existed), null, NaN, negative, >100, and 0. Failing to 1 is deliberate and
 * one-directional: an unset or corrupt value pays exactly what the pre-pool
 * code paid, and can never silently pay zero. A literal 0 is unreachable in
 * practice — `AdminPortfolioOverride`'s `num()` yields 0 for any unparseable
 * input, and `buildInvestorConfig` force-writes 0 percentages for two models.
 * Forms reject 0 up front so a genuine intent to zero cannot be swallowed here.
 */
export function arunamiPoolFraction(config: { arunamiPoolPercent?: number }): number {
  const pct = config.arunamiPoolPercent
  return typeof pct === 'number' && pct > 0 && pct <= 100 ? pct / 100 : 1
}

function emptyResult(label: string): DistributionResult {
  return {
    totalDistribution: 0,
    perInvestorAmount: 0,
    grossInvestorAmount: 0,
    arunamiFeeAmount: 0,
    isFeeExempt: false,
    roiPercent: 0,
    annualRoiPercent: 0,
    breakdown: {},
    label,
  }
}

// ─── Strategy Implementations ─────────────────────────────────────────────

const netProfitShareStrategy: DistributionStrategy = {
  displayName: 'Net Profit Share',
  description: 'Bagi hasil berdasarkan persentase dari laba bersih, dihitung dan dibagikan setiap bulan.',
  requiredReportFields: ['netProfit'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    if (!reportData) return emptyResult(this.displayName)

    const netProfit = reportData.netProfit
    const investorPoolShare = config.investorSharePercent / 100
    const arunamiFeeRate = config.arunamiFeePercent / 100
    const ownership = ownershipFraction(allocation, portfolio)
    const poolFraction = arunamiPoolFraction(config)
    const isFeeExempt = input.isArunamiTeam === true

    const investorPool = netProfit * investorPoolShare
    // Carve out Arunami's slice before ownership applies: `investorPool` funds
    // every investor in the deal, including those outside Arunami.
    const arunamiPool = investorPool * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * arunamiFeeRate
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: investorPool,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        netProfit,
        investorPool,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        ownership: ownership * 100,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const fixedReturnStrategy: DistributionStrategy = {
  displayName: 'Fixed Return',
  description: 'Return tetap berdasarkan target persentase return.',
  requiredReportFields: ['netProfit'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    if (!reportData) return emptyResult(this.displayName)
    const isFeeExempt = input.isArunamiTeam === true

    const netProfit = reportData.netProfit
    const investorPoolShare = config.investorSharePercent / 100
    const arunamiFeeRate = config.arunamiFeePercent / 100
    const ownership = ownershipFraction(allocation, portfolio)
    const poolFraction = arunamiPoolFraction(config)

    const investorPool = netProfit * investorPoolShare
    const arunamiPool = investorPool * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * arunamiFeeRate
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: investorPool,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        netProfit,
        investorPool,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const fixedYieldStrategy: DistributionStrategy = {
  displayName: 'Fixed Yield on Principal',
  description: 'Persentase tetap dari modal investasi awal, dibagikan setiap bulan.',
  requiredReportFields: ['none'],

  calculate(input) {
    const { config, allocation, portfolio } = input
    const c = config as FixedYieldConfig
    const isFeeExempt = input.isArunamiTeam === true
    const months = input.monthsInPeriod ?? 1
    const principal = c.principalReference === 'investasi_awal'
      ? portfolio.investasiAwal
      : allocation.investedAmount
    const ownership = ownershipFraction(allocation, portfolio)

    // No arunamiPoolFraction here, by design. On `invested_amount` the yield is
    // a percentage of the investor's own principal — there is no pool to split,
    // and scaling it would underpay a contractually fixed yield. On
    // `investasi_awal` the principal is already Arunami's portion only, so
    // `totalYield × ownership` (ownership summing to 100% across Arunami
    // investors) distributes exactly the Arunami pot with no remainder;
    // applying the pool fraction again would double-discount it.
    const totalYield = principal * (c.fixedYieldPercent / 100) * months
    const grossPerInvestor = c.principalReference === 'investasi_awal'
      ? totalYield * ownership
      : totalYield
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : c.fixedYieldPercent * months

    return {
      totalDistribution: totalYield,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        principal,
        fixedYieldPercent: c.fixedYieldPercent,
        totalYield,
        grossPerInvestor,
        arunamiFee,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const revenueShareStrategy: DistributionStrategy = {
  displayName: 'Revenue Share (Royalty)',
  description: 'Persentase tetap dari pendapatan bruto, dibagikan setiap bulan.',
  requiredReportFields: ['revenue'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    if (!reportData) return emptyResult(this.displayName)
    const c = config as RevenueShareConfig
    const isFeeExempt = input.isArunamiTeam === true

    const revenue = reportData.revenue
    const ownership = ownershipFraction(allocation, portfolio)
    const poolFraction = arunamiPoolFraction(c)

    const totalShare = revenue * (c.revenueSharePercent / 100)
    const arunamiPool = totalShare * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: totalShare,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        revenue,
        revenueSharePercent: c.revenueSharePercent,
        totalShare,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        ownership: ownership * 100,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const fixedScheduleStrategy: DistributionStrategy = {
  displayName: 'Custom Fixed Schedule',
  description: 'Jumlah tetap yang dibagikan pada jadwal kustom sesuai kontrak.',
  requiredReportFields: ['none'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    const c = config as FixedScheduleConfig
    const isFeeExempt = input.isArunamiTeam === true
    const period = reportData?.period ?? ''
    const ownership = ownershipFraction(allocation, portfolio)

    const targetMonths = input.scheduleMonths ?? (period ? [period] : [])
    const matchedPayments = c.scheduledPayments.filter(
      p => targetMonths.includes(p.dueDate) && p.status === 'paid',
    )
    if (matchedPayments.length === 0) return emptyResult(this.displayName)
    const totalScheduled = matchedPayments.reduce((s, p) => s + p.amount, 0)

    const poolFraction = arunamiPoolFraction(c)
    const arunamiPool = totalScheduled * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: totalScheduled,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        scheduledAmount: totalScheduled,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        ownership: ownership * 100,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const annualDividendStrategy: DistributionStrategy = {
  displayName: 'Discretionary Annual Dividend',
  description: 'Dividen tahunan yang ditetapkan setelah RUPS, dibagikan per tahun.',
  requiredReportFields: ['none'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    const c = config as AnnualDividendConfig
    const isFeeExempt = input.isArunamiTeam === true
    const period = reportData?.period ?? ''
    const year = parseInt(period.split('-')[0], 10)
    const ownership = ownershipFraction(allocation, portfolio)

    const dividend = c.dividendHistory.find(d => d.year === year)
    if (!dividend) return emptyResult(this.displayName)

    const poolFraction = arunamiPoolFraction(c)
    const arunamiPool = dividend.totalAmount * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: dividend.totalAmount,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI,
      breakdown: {
        declaredDividend: dividend.totalAmount,
        year,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        ownership: ownership * 100,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

const customStrategy: DistributionStrategy = {
  displayName: 'Custom',
  description: 'Model kustom dengan variabel dan formula yang ditentukan pengguna.',
  requiredReportFields: ['revenue', 'netProfit', 'grossProfit'],

  calculate(input) {
    const { reportData, config, allocation, portfolio } = input
    const c = config as CustomConfig
    const isFeeExempt = input.isArunamiTeam === true
    const ownership = ownershipFraction(allocation, portfolio)

    const variableValues: Record<string, number> = {}
    for (const v of c.variables) {
      switch (v.source) {
        case 'from_pnl_revenue':
          variableValues[v.id] = reportData?.revenue ?? v.defaultValue; break
        case 'from_pnl_net_profit':
          variableValues[v.id] = reportData?.netProfit ?? v.defaultValue; break
        case 'from_pnl_gross_profit':
          variableValues[v.id] = reportData?.grossProfit ?? v.defaultValue; break
        case 'from_invested_amount':
          variableValues[v.id] = allocation.investedAmount; break
        case 'from_investasi_awal':
          variableValues[v.id] = portfolio.investasiAwal; break
        case 'manual':
        default:
          variableValues[v.id] = v.defaultValue; break
      }
    }

    let totalDistribution = 0
    try {
      const parser = new Parser()
      const expr = parser.parse(c.formula)
      totalDistribution = expr.evaluate(variableValues)
      if (!isFinite(totalDistribution)) totalDistribution = 0
    } catch {
      totalDistribution = 0
    }

    const poolFraction = arunamiPoolFraction(c)
    const arunamiPool = totalDistribution * poolFraction
    const grossPerInvestor = arunamiPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution,
      arunamiPoolAmount: arunamiPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: (monthlyROI / (input.monthsInPeriod ?? 1)) * 12,
      breakdown: {
        ...variableValues,
        formulaResult: totalDistribution,
        arunamiPoolPercent: poolFraction * 100,
        arunamiPool,
        grossPerInvestor,
        arunamiFee,
        perInvestor,
      },
      label: this.displayName,
    }
  },
}

// ─── Strategy Registry ────────────────────────────────────────────────────

export const DISTRIBUTION_STRATEGIES: Record<ReturnModelType, DistributionStrategy> = {
  net_profit_share: netProfitShareStrategy,
  percentage_based: netProfitShareStrategy,
  fixed_return: fixedReturnStrategy,
  fixed_yield: fixedYieldStrategy,
  revenue_share: revenueShareStrategy,
  fixed_schedule: fixedScheduleStrategy,
  annual_dividend: annualDividendStrategy,
  custom: customStrategy,
}

/**
 * Deduct an optional dana-sosial (% of the investor's gross share) from a
 * computed result, in addition to the Arunami fee, and re-derive ROI. Pure —
 * returns the same object unchanged when no social fund applies.
 */
function applySocialFund(result: DistributionResult, input: DistributionInput): DistributionResult {
  const pct = input.socialFundPercent ?? 0
  if (!(pct > 0) || result.grossInvestorAmount === 0) return result

  const socialFundAmount = result.grossInvestorAmount * (pct / 100)
  const perInvestorAmount = result.perInvestorAmount - socialFundAmount
  const invested = input.allocation.investedAmount
  const months = input.monthsInPeriod ?? 1
  const roiPercent = invested > 0 ? (perInvestorAmount / invested) * 100 : result.roiPercent
  const annualRoiPercent = invested > 0 ? (roiPercent / months) * 12 : result.annualRoiPercent

  return {
    ...result,
    perInvestorAmount,
    socialFundAmount,
    roiPercent,
    annualRoiPercent,
    breakdown: { ...result.breakdown, socialFundAmount },
  }
}

export function calculateDistribution(input: DistributionInput): DistributionResult {
  // Grace period overrides the configured return model. A project that has not
  // produced PnL yet pays only its grace return — a fixed yield on principal,
  // or nothing — and never reaches a PnL-based strategy (which could otherwise
  // publish a profit share before any profit exists).
  if (input.portfolio.isGracePeriod) {
    const grace = input.portfolio.graceConfig
    if (grace?.returnMode === 'fixed_yield') {
      // arunamiPoolPercent is deliberately not carried across: grace pays a
      // yield on principal, not a share of a pool, so there is nothing for the
      // Arunami pool fraction to scale. Revisit only if a pool-divided grace
      // mode is ever added.
      const graceConfig: FixedYieldConfig = {
        type: 'fixed_yield',
        investorSharePercent: 0,
        arunamiFeePercent: grace.arunamiFeePercent ?? 0,
        fixedYieldPercent: grace.fixedYieldPercent ?? 0,
        principalReference: grace.principalReference ?? 'invested_amount',
      }
      return applySocialFund(fixedYieldStrategy.calculate({ ...input, config: graceConfig }), input)
    }
    return emptyResult('Grace Period — Tanpa Payout')
  }

  const strategy =
    DISTRIBUTION_STRATEGIES[input.config.type] ??
    DISTRIBUTION_STRATEGIES.net_profit_share
  return applySocialFund(strategy.calculate(input), input)
}

/** True when a grace-period portfolio still pays investors (fixed yield). */
export function gracePaysReturn(portfolio: Portfolio): boolean {
  return portfolio.isGracePeriod && portfolio.graceConfig?.returnMode === 'fixed_yield'
}

/** Model metadata for UI (setup wizard model selector, etc.) */
export const DISTRIBUTION_MODEL_OPTIONS: {
  value: ReturnModelType
  label: string
  description: string
}[] = [
  { value: 'net_profit_share', label: 'Net Profit Share', description: 'Bagi hasil dari laba bersih proyek, dihitung bulanan.' },
  { value: 'fixed_yield', label: 'Fixed Yield on Principal', description: 'Persentase tetap dari modal investasi, dibagikan bulanan.' },
  { value: 'revenue_share', label: 'Revenue Share (Royalty)', description: 'Persentase dari pendapatan bruto, dibagikan bulanan.' },
  { value: 'fixed_schedule', label: 'Custom Fixed Schedule', description: 'Jumlah tetap pada jadwal kustom sesuai kontrak.' },
  { value: 'annual_dividend', label: 'Discretionary Annual Dividend', description: 'Dividen tahunan yang ditetapkan setelah RUPS.' },
  { value: 'custom', label: 'Custom Variables', description: 'Model kustom dengan variabel dan formula sendiri.' },
]
