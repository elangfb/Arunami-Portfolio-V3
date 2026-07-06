import {
  getAllUsers, getAllPortfolios, getAllAllocations,
  getPortfolioConfig, getFinancialData, getReports, getHealthRules,
} from './firestore'
import type {
  AppUser, Portfolio, InvestorAllocation,
  PortfolioConfig, FinancialData, PortfolioReport, HealthRules,
} from '@/types'

export interface PortfolioExport extends Portfolio {
  config: PortfolioConfig | null
  financialData: FinancialData | null
  reports: { pnl: PortfolioReport[]; projection: PortfolioReport[] }
}

export interface AdminExport {
  exportedAt: string
  version: number
  users: AppUser[]
  investors: AppUser[]
  allocations: InvestorAllocation[]
  portfolios: PortfolioExport[]
  healthRules: HealthRules
}

/**
 * Aggregates a full snapshot of all project (portfolio) and investor data.
 * Per-portfolio subcollection fetches are isolated so one failing portfolio
 * does not abort the whole export.
 */
export async function buildAdminExport(): Promise<AdminExport> {
  const [users, portfolios, allocations, healthRules] = await Promise.all([
    getAllUsers(),
    getAllPortfolios(),
    getAllAllocations(),
    getHealthRules(),
  ])

  const enrichedPortfolios = await Promise.all(
    portfolios.map(async (p): Promise<PortfolioExport> => {
      try {
        const [config, financialData, pnl, projection] = await Promise.all([
          getPortfolioConfig(p.id),
          getFinancialData(p.id),
          getReports(p.id, 'pnl'),
          getReports(p.id, 'projection'),
        ])
        return { ...p, config, financialData, reports: { pnl, projection } }
      } catch (err) {
        console.error(`Failed to export portfolio ${p.id} (${p.code})`, err)
        return { ...p, config: null, financialData: null, reports: { pnl: [], projection: [] } }
      }
    }),
  )

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    users,
    investors: users.filter(u => u.role === 'investor'),
    allocations,
    portfolios: enrichedPortfolios,
    healthRules,
  }
}

/** Serializes `data` to a pretty JSON file and triggers a browser download. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
