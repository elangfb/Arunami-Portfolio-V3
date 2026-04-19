import { Parser } from 'expr-eval'
import type {
  ReturnModelType, InvestorConfigUnion, InvestorAllocation, Portfolio,
  FixedYieldConfig, RevenueShareConfig, FixedScheduleConfig,
  AnnualDividendConfig, CustomConfig,
} from '@/types'

// ─── Core Interfaces ──────────────────────────────────────────────────────

export interface DistributionResult {
  totalDistribution: number
  perInvestorAmount: number
  grossInvestorAmount: number
  arunamiFeeAmount: number
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
    const isFeeExempt = input.isArunamiTeam === true

    const investorPool = netProfit * investorPoolShare
    const grossPerInvestor = investorPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * arunamiFeeRate
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: investorPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
      breakdown: {
        netProfit,
        investorPool,
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

    const investorPool = netProfit * investorPoolShare
    const grossPerInvestor = investorPool * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * arunamiFeeRate
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: investorPool,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
      breakdown: { netProfit, investorPool, grossPerInvestor, arunamiFee, perInvestor },
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
    const principal = c.principalReference === 'investasi_awal'
      ? portfolio.investasiAwal
      : allocation.investedAmount
    const ownership = ownershipFraction(allocation, portfolio)

    const totalYield = principal * (c.fixedYieldPercent / 100)
    const grossPerInvestor = c.principalReference === 'investasi_awal'
      ? totalYield * ownership
      : totalYield
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : c.fixedYieldPercent

    return {
      totalDistribution: totalYield,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
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

    const totalShare = revenue * (c.revenueSharePercent / 100)
    const grossPerInvestor = totalShare * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: totalShare,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
      breakdown: {
        revenue,
        revenueSharePercent: c.revenueSharePercent,
        totalShare,
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

    const scheduled = c.scheduledPayments.find(
      p => p.dueDate === period && p.status === 'paid',
    )
    if (!scheduled) return emptyResult(this.displayName)

    const grossPerInvestor = scheduled.amount * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: scheduled.amount,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
      breakdown: {
        scheduledAmount: scheduled.amount,
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

    const grossPerInvestor = dividend.totalAmount * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution: dividend.totalAmount,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI,
      breakdown: {
        declaredDividend: dividend.totalAmount,
        year,
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

    const grossPerInvestor = totalDistribution * ownership
    const arunamiFee = isFeeExempt ? 0 : grossPerInvestor * (c.arunamiFeePercent / 100)
    const perInvestor = grossPerInvestor - arunamiFee

    const monthlyROI = allocation.investedAmount > 0
      ? (perInvestor / allocation.investedAmount) * 100
      : 0

    return {
      totalDistribution,
      perInvestorAmount: perInvestor,
      grossInvestorAmount: grossPerInvestor,
      arunamiFeeAmount: arunamiFee,
      isFeeExempt,
      roiPercent: monthlyROI,
      annualRoiPercent: monthlyROI * 12,
      breakdown: { ...variableValues, formulaResult: totalDistribution, grossPerInvestor, arunamiFee, perInvestor },
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

export function calculateDistribution(input: DistributionInput): DistributionResult {
  const strategy = DISTRIBUTION_STRATEGIES[input.config.type]
  return strategy.calculate(input)
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
