import type { Timestamp } from 'firebase/firestore'

// ─── Roles ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'investor'

// ─── Portfolio Configuration ──────────────────────────────────────────────

export type IndustryType = 'retail' | 'saas' | 'fnb' | 'jasa' | 'manufaktur' | 'lainnya'
export type ReturnModelType = 'slot_based' | 'percentage_based' | 'fixed_return'
export type ReportingFrequency = 'bulanan' | 'kuartalan' | 'semesteran'

export interface RevenueCategory {
  id: string
  name: string
  color: string
}

export interface KpiMetric {
  id: string
  name: string
  targetValue: number
  unit: 'currency' | 'percentage' | 'count' | 'ratio'
}

export interface InvestorConfigBase {
  investorSharePercent: number
  arunamiFeePercent: number
}

export interface SlotBasedConfig extends InvestorConfigBase {
  type: 'slot_based'
  totalSlots: number
  nominalPerSlot: number
}

export interface PercentageBasedConfig extends InvestorConfigBase {
  type: 'percentage_based'
}

export interface FixedReturnConfig extends InvestorConfigBase {
  type: 'fixed_return'
  targetReturnPercent: number
  payoutFrequency: ReportingFrequency
}

export type InvestorConfigUnion = SlotBasedConfig | PercentageBasedConfig | FixedReturnConfig

export interface PortfolioConfig {
  industryType: IndustryType
  revenueCategories: RevenueCategory[]
  returnModel: ReturnModelType
  investorConfig: InvestorConfigUnion
  reportingFrequency: ReportingFrequency
  kpiMetrics: KpiMetric[]
  createdAt: Timestamp
}

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
  industryType: IndustryType
  isGracePeriod: boolean
  assignedInvestors: string[]
  assignedAnalysts: string[]
  slotsSummary?: SlotsSummary
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
  categories: Record<string, number>
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
  percentage?: number
}

export interface PnLExtractedData {
  period: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: OpexItem[]
  totalOpex: number
  operatingProfit: number
  interest: number
  taxes: number
  netProfit: number
  transactionCount: number
  unitBreakdown: Record<string, number>
  notes: string
}

export interface ProjectionExtractedData {
  period: string
  projectedRevenue: number
  projectedCogsPercent: number
  projectedCogs: number
  projectedGrossProfit: number
  projectedOpex: OpexItem[]
  projectedTotalOpex: number
  projectedNetProfit: number
  assumptions: string
}

export type ReportType = 'pnl' | 'projection' | 'management_report' | 'arunami_note'

export interface PortfolioReport {
  id: string
  type: ReportType
  fileName: string
  fileUrl: string
  period: string
  extractedData: PnLExtractedData | ProjectionExtractedData | Record<string, never>
  uploadedBy: string
  createdAt: Timestamp
}

// ─── AI Extraction with Classification ───────────────────────────────────

// ─── Monthly Projection (Analyst Review) ────────────────────────────────

export interface MonthlyProjectionRow {
  month: string
  projectedRevenue: number
  projectedCogs: number
  projectedGrossProfit: number
  opexBreakdown: OpexItem[]
  totalOpex: number
  projectedNetProfit: number
}

export interface ProjectionUploadPending {
  period: string
  assumptions: string
  cogsPercent: number
  monthlyData: MonthlyProjectionRow[]
  status: 'pending_review' | 'confirmed'
}

// ─── AI Extraction with Classification ───────────────────────────────────

export interface ClassifiedOpexItem extends OpexItem {
  isStandard: boolean
}

export interface RevenueBreakdownItem {
  name: string
  amount: number
  unitCount: number
  isStandard: boolean
}

export interface DiscoveredVariable {
  name: string
  category: 'opex' | 'revenue' | 'kpi' | 'other'
  value: number
  description: string
  included: boolean
}

export interface SuggestedKpi {
  name: string
  value: number
  unit: 'currency' | 'percentage' | 'count' | 'ratio'
  derivedFrom: string
}

export interface ClassifiedPnLData {
  period: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: ClassifiedOpexItem[]
  totalOpex: number
  operatingProfit: number
  interest: number
  taxes: number
  netProfit: number
  transactionCount: number
  revenueBreakdown: RevenueBreakdownItem[]
  notes: string
}

export interface ClassifiedProjectionData {
  period: string
  projectedRevenue: number
  projectedCogsPercent: number
  projectedCogs: number
  projectedGrossProfit: number
  projectedOpex: ClassifiedOpexItem[]
  projectedTotalOpex: number
  projectedNetProfit: number
  assumptions: string
}

export interface PortfolioSetupExtraction {
  pnl: ClassifiedPnLData | null
  projection: ClassifiedProjectionData | null
  discoveredVariables: DiscoveredVariable[]
  suggestedKpis: SuggestedKpi[]
}

export type ExtractionStage =
  | 'idle'
  | 'reading_pnl'
  | 'extracting_pnl'
  | 'reading_projection'
  | 'extracting_projection'
  | 'classifying'
  | 'done'
  | 'error'

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

// ─── Investor Allocations ─────────────────────────────────────────────────

export interface InvestorAllocation {
  id: string
  investorUid: string
  investorName: string
  investorEmail: string
  portfolioId: string
  portfolioName: string
  portfolioCode: string
  slots: number
  investedAmount: number
  joinedAt: Timestamp
  updatedAt: Timestamp
}

export interface SlotsSummary {
  totalSlots: number
  allocatedSlots: number
  investorCount: number
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

// ─── Investor CRM ────────────────────────────────────────────────────────

export type CommunicationType = 'report' | 'custom_message'
export type CommunicationChannel = 'clipboard' | 'email' | 'download'

export interface InvestorCommunication {
  id: string
  investorUid: string
  type: CommunicationType
  channel: CommunicationChannel
  subject: string
  period: string
  portfolioIds: string[]
  sentBy: string
  createdAt: Timestamp
}

export interface InvestorSummary {
  user: AppUser
  allocations: InvestorAllocation[]
  totalInvested: number
  totalSlots: number
  portfolioCount: number
}
