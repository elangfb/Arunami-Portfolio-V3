import type { InvestorConfig } from '@/types'

export interface ROIResult {
  investorShare: number
  arunamiFee: number
  netForInvestor: number
  returnPerSlot: number
  monthlyROI: number
  annualROI: number
}

export function calculateROI(netProfit: number, config: InvestorConfig): ROIResult {
  const investorShare = netProfit * (config.investorSharePercent / 100)
  const arunamiFee = investorShare * (config.arunamiFeePercent / 100)
  const netForInvestor = investorShare - arunamiFee
  const returnPerSlot = config.totalSlots > 0 ? netForInvestor / config.totalSlots : 0
  const monthlyROI = config.nominalPerSlot > 0 ? (returnPerSlot / config.nominalPerSlot) * 100 : 0
  const annualROI = monthlyROI * 12
  return { investorShare, arunamiFee, netForInvestor, returnPerSlot, monthlyROI, annualROI }
}
