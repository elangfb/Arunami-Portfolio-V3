import type { Timestamp } from 'firebase/firestore'

// ─── Roles ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'investor'

// ─── Portfolio Configuration ──────────────────────────────────────────────

export type IndustryType = 'retail' | 'saas' | 'fnb' | 'jasa' | 'manufaktur' | 'lainnya'
export type ReturnModelType =
  | 'percentage_based'    // legacy alias → treated as net_profit_share
  | 'fixed_return'        // legacy
  | 'net_profit_share'
  | 'fixed_yield'
  | 'revenue_share'
  | 'fixed_schedule'
  | 'annual_dividend'
  | 'custom'
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

export interface PercentageBasedConfig extends InvestorConfigBase {
  type: 'percentage_based'
}

export interface FixedReturnConfig extends InvestorConfigBase {
  type: 'fixed_return'
  targetReturnPercent: number
  payoutFrequency: ReportingFrequency
}

// ─── New Distribution Model Configs ───────────────────────────────────────

export interface NetProfitShareConfig extends InvestorConfigBase {
  type: 'net_profit_share'
}

export interface FixedYieldConfig extends InvestorConfigBase {
  type: 'fixed_yield'
  fixedYieldPercent: number
  principalReference: 'invested_amount' | 'investasi_awal'
}

export interface RevenueShareConfig extends InvestorConfigBase {
  type: 'revenue_share'
  revenueSharePercent: number
}

export interface ScheduledPayment {
  id: string
  dueDate: string
  amount: number
  label?: string
  status: 'pending' | 'paid'
  paidAt?: Timestamp
}

export interface FixedScheduleConfig extends InvestorConfigBase {
  type: 'fixed_schedule'
  scheduledPayments: ScheduledPayment[]
}

export interface DividendEntry {
  id: string
  year: number
  totalAmount: number
  approvedAt: Timestamp
  approvedBy: string
  notes?: string
}

export interface AnnualDividendConfig extends InvestorConfigBase {
  type: 'annual_dividend'
  dividendHistory: DividendEntry[]
}

export type CustomVariableSource =
  | 'manual'
  | 'from_pnl_revenue'
  | 'from_pnl_net_profit'
  | 'from_pnl_gross_profit'
  | 'from_invested_amount'
  | 'from_investasi_awal'

export interface CustomVariable {
  id: string
  name: string
  type: 'currency' | 'percentage' | 'number'
  defaultValue: number
  source: CustomVariableSource
}

export interface CustomConfig extends InvestorConfigBase {
  type: 'custom'
  variables: CustomVariable[]
  formula: string
  distributionFrequency: ReportingFrequency | 'custom'
  customScheduleDates?: string[]
}

export type InvestorConfigUnion =
  | PercentageBasedConfig
  | FixedReturnConfig
  | NetProfitShareConfig
  | FixedYieldConfig
  | RevenueShareConfig
  | FixedScheduleConfig
  | AnnualDividendConfig
  | CustomConfig

export interface RowOrder {
  /**
   * Unified order for the movable body zone (between Gross Profit and
   * Total Opex). Each entry is either `opex:<name>` for an opex line item
   * or `cat:<id>` for a custom category block.
   */
  body?: string[]
  /** Per-category sub-item order (keyed by category id). */
  customSubItems?: Record<string, string[]>
  /** @deprecated — superseded by `body`. Preserved for backwards read. */
  opex?: string[]
  /** @deprecated — superseded by `body`. Preserved for backwards read. */
  customCategories?: string[]
}

export interface PortfolioConfig {
  industryType: IndustryType
  revenueCategories: RevenueCategory[]
  // Unit categories specifically for the P&L unit-breakdown section. Empty by
  // default — the analyst seeds them on the first upload via the "+" button,
  // and they persist for subsequent uploads so the analyst only edits numbers.
  pnlUnitCategories?: RevenueCategory[]
  pnlRowOrder?: RowOrder
  projectionRowOrder?: RowOrder
  returnModel: ReturnModelType
  investorConfig: InvestorConfigUnion
  reportingFrequency: ReportingFrequency
  kpiMetrics: KpiMetric[]
  configEnrichedAt?: Timestamp
  createdAt: Timestamp
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  isArunamiTeam?: boolean
  createdBy: string
  createdAt: Timestamp
}

// ─── Portfolio ─────────────────────────────────────────────────────────────

export interface Portfolio {
  id: string
  name: string
  brandName: string
  code: string
  stage: string
  periode: string
  investasiAwal: number
  description: string
  industryType: IndustryType
  isGracePeriod: boolean
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
  returnModel?: ReturnModelType
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

export type CustomCategoryType = 'income' | 'expense'

export interface CustomSubItem {
  id: string
  name: string
  amount: number
}

export interface CustomCategory {
  id: string
  name: string
  type: CustomCategoryType
  subItems: CustomSubItem[]
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
  unitBreakdown: Record<string, number>
  notes: string
  customCategories?: CustomCategory[]
  cogsSubItems?: CustomSubItem[]
  /** Optional revenue breakdown — when present, `revenue` = sum of subItems. */
  revenueSubItems?: CustomSubItem[]
}

export interface MonthlyPnLRow {
  month: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: OpexItem[]
  totalOpex: number
  operatingProfit: number
  interest: number
  taxes: number
  netProfit: number
  customCategories?: CustomCategory[]
  cogsSubItems?: CustomSubItem[]
  revenueSubItems?: CustomSubItem[]
}

export interface PnLUploadPending {
  period: string
  notes: string
  unitBreakdown: Record<string, number>
  monthlyData: MonthlyPnLRow[]
  status: 'pending_review' | 'confirmed'
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
  customCategories?: CustomCategory[]
}

export type ReportType = 'pnl' | 'projection' | 'management_report' | 'arunami_note'

export interface PortfolioReport {
  id: string
  type: ReportType
  fileName: string
  fileUrl: string
  period: string
  extractedData: PnLExtractedData | ProjectionExtractedData | Record<string, unknown>
  htmlContent?: string
  publishedAt?: Timestamp
  uploadedBy: string
  createdAt: Timestamp
}

export type InvestorReportStatus = 'draft' | 'published'

export interface InvestorReportDoc {
  id: string
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  period: string
  status: InvestorReportStatus
  htmlContent: string
  publishedAt?: Timestamp
  publishedBy?: string
  updatedAt: Timestamp
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
  customCategories?: CustomCategory[]
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
  revenueBreakdown: RevenueBreakdownItem[]
  notes: string
}

export interface ClassifiedMonthlyProjectionRow {
  month: string
  projectedRevenue: number
  projectedCogs: number
  projectedGrossProfit: number
  opexBreakdown: ClassifiedOpexItem[]
  totalOpex: number
  projectedNetProfit: number
}

export interface ClassifiedProjectionData {
  period: string
  assumptions: string
  cogsPercent: number
  monthlyData: ClassifiedMonthlyProjectionRow[]
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
  investedAmount: number
  ownershipPercent?: number
  isManual?: boolean
  joinedAt: Timestamp
  updatedAt: Timestamp
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
  portfolioCount: number
}

// ─── Equity Management ───────────────────────────────────────────────────

export type EquityReasonCategory =
  | 'milestone_24m'
  | 'payback_achieved'
  | 'renegotiation'
  | 'other'

export type ConfigChangeKind =
  | 'investor_share'
  | 'arunami_fee'
  | 'fixed_yield'
  | 'revenue_share'
  | 'scheduled_payment'
  | 'dividend_declared'
  | 'custom_formula'

export interface EquityChangeEntry {
  id: string
  changedAt: Timestamp
  changedByUid: string
  changedByName: string
  fromInvestorPercent: number
  toInvestorPercent: number
  fromArunamiPercent: number
  toArunamiPercent: number
  reasonCategory: EquityReasonCategory
  reasonNote?: string
  effectiveFromPeriod: string
  changeKind?: ConfigChangeKind
  fromValue?: string
  toValue?: string
}
