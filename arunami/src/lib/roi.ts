import type { InvestorConfig, InvestorConfigUnion } from '@/types'

export interface ROIResult {
  investorShare: number
  arunamiFee: number
  netForInvestor: number
  returnPerSlot: number
  monthlyROI: number
  annualROI: number
}

export function calculateROI(netProfit: number, config: InvestorConfig | InvestorConfigUnion): ROIResult {
  const investorShare = netProfit * (config.investorSharePercent / 100)
  const arunamiFee = investorShare * (config.arunamiFeePercent / 100)
  const netForInvestor = investorShare - arunamiFee

  // Determine slot-based values
  const hasSlots = 'totalSlots' in config && 'nominalPerSlot' in config
  const totalSlots: number = hasSlots ? (config as InvestorConfig).totalSlots ?? 0 : 0
  const nominalPerSlot: number = hasSlots ? (config as InvestorConfig).nominalPerSlot ?? 0 : 0

  const returnPerSlot = totalSlots > 0 ? netForInvestor / totalSlots : netForInvestor
  const monthlyROI = nominalPerSlot > 0 ? (returnPerSlot / nominalPerSlot) * 100 : 0
  const annualROI = monthlyROI * 12
  return { investorShare, arunamiFee, netForInvestor, returnPerSlot, monthlyROI, annualROI }
}

/** Calculate ROI for a specific investor based on their slot count. */
export function calculateInvestorROI(
  netProfit: number,
  investorSlots: number,
  totalSlots: number,
  investorSharePercent: number,
  arunamiFeePercent: number,
  nominalPerSlot: number,
) {
  const projectInvestorShare = netProfit * (investorSharePercent / 100)
  const projectArunamiFee = projectInvestorShare * (arunamiFeePercent / 100)
  const projectNetForInvestors = projectInvestorShare - projectArunamiFee

  const ownershipPct = totalSlots > 0 ? (investorSlots / totalSlots) * 100 : 0
  const earnings = totalSlots > 0 ? projectNetForInvestors * (investorSlots / totalSlots) : 0
  const invested = investorSlots * nominalPerSlot
  const monthlyROI = invested > 0 ? (earnings / invested) * 100 : 0
  const annualROI = monthlyROI * 12

  return { ownershipPct, earnings, invested, monthlyROI, annualROI }
}
