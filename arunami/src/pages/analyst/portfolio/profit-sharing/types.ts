import type {
  Portfolio, PortfolioConfig, InvestorConfigUnion,
  NetProfitShareConfig, FixedYieldConfig, RevenueShareConfig,
  FixedScheduleConfig, AnnualDividendConfig, CustomConfig,
  PercentageBasedConfig, FixedReturnConfig,
} from '@/types'

export interface SectionUser {
  uid: string
  displayName: string
}

export interface SectionProps<T extends InvestorConfigUnion = InvestorConfigUnion> {
  config: PortfolioConfig
  investorConfig: T
  portfolioId: string
  currentUser: SectionUser | null
  nextPeriod: string
  onChanged: () => Promise<void> | void
  portfolio?: Portfolio | null
}

export type InvestorConfigMap = {
  net_profit_share: NetProfitShareConfig
  fixed_yield: FixedYieldConfig
  revenue_share: RevenueShareConfig
  fixed_schedule: FixedScheduleConfig
  annual_dividend: AnnualDividendConfig
  custom: CustomConfig
  percentage_based: PercentageBasedConfig
  fixed_return: FixedReturnConfig
}

export function narrowConfig<K extends keyof InvestorConfigMap>(
  investorConfig: InvestorConfigUnion,
  type: K,
): InvestorConfigMap[K] | null {
  return investorConfig.type === type ? (investorConfig as InvestorConfigMap[K]) : null
}
