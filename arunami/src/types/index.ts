import type { Timestamp } from 'firebase/firestore'

// ─── Roles ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'investor'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  createdBy: string
  createdAt: Timestamp
}

// ─── Portfolio ─────────────────────────────────────────────────────────────

export interface Portfolio {
  id: string
  name: string
  code: string
  stage: string
  periode: string
  investasiAwal: number
  description: string
  assignedInvestors: string[]
  assignedAnalysts: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Financial Data ────────────────────────────────────────────────────────

export interface MonthlyDataPoint {
  month: string
  proyeksi: number
  aktual: number
}

export interface CostItem {
  name: string
  amount: number
  percentage: number
}

export interface TransactionDataPoint {
  month: string
  laptop: number
  service: number
  aksesoris: number
}

export interface AovDataPoint {
  category: string
  value: number
}

export interface RevenueMixItem {
  name: string
  value: number
  percentage: number
}

export interface ProjectionPoint {
  month: string
  revenue: number
  profit: number
  type: 'actual' | 'forecast'
}

export interface RadarDataPoint {
  metric: string
  value: number
  fullMark: number
}

export interface InvestorConfig {
  totalSlots: number
  nominalPerSlot: number
  investorSharePercent: number
  arunamiFeePercent: number
}

export interface FinancialData {
  revenueData: MonthlyDataPoint[]
  profitData: MonthlyDataPoint[]
  costStructure: CostItem[]
  transactionData: TransactionDataPoint[]
  aovData: AovDataPoint[]
  revenueMix: RevenueMixItem[]
  projections: ProjectionPoint[]
  radarData: RadarDataPoint[]
  investorConfig: InvestorConfig
}

// ─── Reports ───────────────────────────────────────────────────────────────

export interface OpexItem {
  name: string
  amount: number
}

export interface PnLExtractedData {
  period: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: OpexItem[]
  totalOpex: number
  netProfit: number
  transactionCount: number
  unitBreakdown: { laptop: number; service: number; aksesoris: number }
  notes: string
}

export interface ProjectionExtractedData {
  period: string
  projectedRevenue: number
  projectedCogs: number
  projectedGrossProfit: number
  projectedOpex: OpexItem[]
  projectedTotalOpex: number
  projectedNetProfit: number
  assumptions: string
}

export interface PortfolioReport {
  id: string
  type: 'pnl' | 'projection'
  fileName: string
  fileUrl: string
  period: string
  extractedData: PnLExtractedData | ProjectionExtractedData
  uploadedBy: string
  createdAt: Timestamp
}

// ─── Management Report ────────────────────────────────────────────────────

export type IssueSeverity = 'high' | 'medium' | 'low'
export type ActionStatus = 'pending' | 'in_progress' | 'done'
export type ActionCategory = 'business' | 'operational' | 'financial'

export interface Issue {
  id: string
  title: string
  severity: IssueSeverity
  description: string
}

export interface ActionItem {
  id: string
  title: string
  status: ActionStatus
  assignee: string
  dueDate: string
  category: ActionCategory
}

export interface ManagementReport {
  id: string
  period: string
  businessSummary: string
  issues: Issue[]
  actionItems: ActionItem[]
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Notes ────────────────────────────────────────────────────────────────

export interface NoteAttachment {
  id: string
  type: string
  fileName: string
  fileUrl: string
  fileSize: number
}

export interface Note {
  id: string
  content: string
  attachments: NoteAttachment[]
  createdBy: string
  createdAt: Timestamp
}

// ─── Transfer Proof ───────────────────────────────────────────────────────

export interface TransferProof {
  id: string
  period: string
  investorUid: string
  investorName: string
  amount: number
  fileUrl: string
  fileName: string
  notes: string
  createdAt: Timestamp
}
