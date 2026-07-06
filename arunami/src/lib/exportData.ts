import {
  getAllUsers, getAllPortfolios, getAllAllocations,
  getPortfolioConfig, getFinancialData, getReports, getHealthRules,
  getMilestones, getCovenants,
  getAnnouncements, getAllDocuments, getSystemSettings, getDistributionBatches,
} from './firestore'
import type {
  AppUser, Portfolio, InvestorAllocation,
  PortfolioConfig, FinancialData, PortfolioReport, HealthRules,
  Milestone, Covenant,
  Announcement, LibraryDocument, SystemSettings, DistributionBatch,
} from '@/types'

export interface PortfolioExport extends Portfolio {
  config: PortfolioConfig | null
  financialData: FinancialData | null
  reports: { pnl: PortfolioReport[]; projection: PortfolioReport[] }
  milestones: Milestone[]
  covenants: Covenant[]
}

export interface AdminExport {
  exportedAt: string
  version: number
  users: AppUser[]
  investors: AppUser[]
  allocations: InvestorAllocation[]
  portfolios: PortfolioExport[]
  healthRules: HealthRules
  announcements: Announcement[]
  documents: LibraryDocument[]
  systemSettings: SystemSettings
  distributionBatches: DistributionBatch[]
}

/**
 * Aggregates a full snapshot of all project (portfolio) and investor data.
 * Per-portfolio subcollection fetches are isolated so one failing portfolio
 * does not abort the whole export.
 */
export async function buildAdminExport(): Promise<AdminExport> {
  const [
    users, portfolios, allocations, healthRules,
    announcements, documents, systemSettings, distributionBatches,
  ] = await Promise.all([
    getAllUsers(),
    getAllPortfolios(),
    getAllAllocations(),
    getHealthRules(),
    getAnnouncements(),
    getAllDocuments(),
    getSystemSettings(),
    getDistributionBatches(),
  ])

  const enrichedPortfolios = await Promise.all(
    portfolios.map(async (p): Promise<PortfolioExport> => {
      try {
        const [config, financialData, pnl, projection, milestones, covenants] = await Promise.all([
          getPortfolioConfig(p.id),
          getFinancialData(p.id),
          getReports(p.id, 'pnl'),
          getReports(p.id, 'projection'),
          getMilestones(p.id),
          getCovenants(p.id),
        ])
        return { ...p, config, financialData, reports: { pnl, projection }, milestones, covenants }
      } catch (err) {
        console.error(`Failed to export portfolio ${p.id} (${p.code})`, err)
        return { ...p, config: null, financialData: null, reports: { pnl: [], projection: [] }, milestones: [], covenants: [] }
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
    announcements,
    documents,
    systemSettings,
    distributionBatches,
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
