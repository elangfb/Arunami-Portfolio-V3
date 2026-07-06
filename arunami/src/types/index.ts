import type { Timestamp } from 'firebase/firestore'

// ─── Roles ─────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'investor' | 'investor_relation'

// ─── Health / Wanprestasi (Siaga) ─────────────────────────────────────────

/** Portfolio health, least → most severe. `sehat` = healthy, `siaga_1` = enforcement. */
export type HealthLevel = 'sehat' | 'siaga_3' | 'siaga_2' | 'siaga_1'

/**
 * Per-signal Siaga thresholds. Each is the minimum value that triggers the
 * corresponding level; `siaga1` is the most severe (highest) breakpoint.
 */
export interface HealthThreshold {
  siaga3: number
  siaga2: number
  siaga1: number
}

/**
 * Global wanprestasi thresholds — a single admin-owned config doc
 * (/appConfig/health). Drives the health-derivation engine (see lib/health.ts).
 */
export interface HealthRules {
  /** Days a payment/report is late. */
  latenessDays: HealthThreshold
  /** Days of communication silence (last contact → today). */
  silenceDays: HealthThreshold
  /** Consecutive months where net profit < 80% of the projection target. */
  underTargetMonths: HealthThreshold
  updatedAt?: Timestamp
  updatedBy?: string
}

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
  /**
   * Display-only: row keys hidden from the PnL tables. Currently used for
   * 'interest' | 'taxes', but kept as `string[]` so future system rows can be
   * toggled without a schema change. Underlying numeric values are untouched —
   * hiding a row never affects computations like `netProfit`.
   */
  hiddenRows?: string[]
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
  /**
   * Whether this portfolio returns the investor's principal (pengembalian pokok)
   * in addition to bagi hasil. When true, the Resume Bagi Hasil recap shows a
   * dedicated principal column and the payout/manual-entry forms expose a
   * principal field. Not every porto uses this, so it defaults to off.
   */
  returnsPrincipal?: boolean
  configEnrichedAt?: Timestamp
  createdAt: Timestamp
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  isArunamiTeam?: boolean
  /** Soft-archive flag (DF-04). Archived users are hidden from active lists but kept for audit. */
  archived?: boolean
  archivedAt?: Timestamp
  createdBy: string
  createdAt: Timestamp
}

// ─── Portfolio ─────────────────────────────────────────────────────────────

/**
 * What investors receive while a portfolio is in grace period (no PnL yet).
 * `none`        → no payout this period (informational reports only).
 * `fixed_yield` → guaranteed % of principal, paid every period (no PnL needed);
 *                 reuses the fixed_yield distribution strategy.
 */
export interface GraceConfig {
  returnMode: 'none' | 'fixed_yield'
  fixedYieldPercent?: number
  principalReference?: 'invested_amount' | 'investasi_awal'
  arunamiFeePercent?: number
  /** Display-only target (grace exit is manual, this is not a trigger). */
  expectedOperationalDate?: string
}

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
  /** Present when isGracePeriod; defaults to { returnMode: 'none' } if omitted. */
  graceConfig?: GraceConfig
  assignedInvestors: string[]
  assignedAnalysts: string[]
  /** Soft-archive flag (DF-04). Archived portfolios are hidden from active lists but kept for audit. */
  archived?: boolean
  archivedAt?: Timestamp
  // ─── Contract & renewal (Phase 2) ────────────────────────────────────────
  // Investment-contract span (YYYY-MM-DD). Powers the renewal pipeline, expiry
  // severity badges (Kritis/Segera/Aman), and duration progress bars. Optional —
  // older portfolios have none, and helpers treat that as "Tanpa Kontrak".
  /** Contract start date (YYYY-MM-DD). */
  contractStart?: string
  /** Contract end / expiry date (YYYY-MM-DD). */
  contractEnd?: string
  /** Operational start date, for the operational-duration display (YYYY-MM-DD). */
  operationalStart?: string
  // ─── Wanprestasi / health (Phase 1) ──────────────────────────────────────
  // Manual inputs the analyst sets in the Wanprestasi modal, plus the derived
  // level denormalized onto the portfolio so list views can show a badge
  // without loading each portfolio's financial data. Recomputed on modal save.
  /** Days a payment/report is currently late (manual input). */
  latenessDays?: number
  /** Last date the analyst had contact with the company (YYYY-MM-DD). */
  lastContactDate?: string
  /** Derived Siaga level (defaults to 'sehat' when absent). */
  healthLevel?: HealthLevel
  /** Human-readable reasons behind the current level. */
  healthReasons?: string[]
  healthComputedAt?: Timestamp
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
  projectedDepreciationAmortization?: number
  projectedTax?: number
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

export type InvestorReportType = 'monthly' | 'quarterly'

/**
 * Scope of an investor report:
 * - 'portfolio'    → one report per (portfolio × investor × period). Default for
 *                    existing docs that omit the field.
 * - 'accumulated'  → one report per (investor × period) spanning ALL portfolios,
 *                    published by Investor Relations. Stored with
 *                    portfolioId = '__accumulated__'.
 * - 'all_time'     → a single lifetime report per investor spanning ALL portfolios
 *                    and ALL published periods. Stored with portfolioId =
 *                    '__accumulated__' and period = ALL_TIME_PERIOD.
 */
export type InvestorReportScope = 'portfolio' | 'accumulated' | 'all_time'

export const ACCUMULATED_PORTFOLIO_ID = '__accumulated__'

/** Sentinel period for the single all-time report doc (never a real YYYY-MM). */
export const ALL_TIME_PERIOD = 'ALL_TIME'

export interface InvestorReportDoc {
  id: string
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  period: string
  reportType?: InvestorReportType
  scope?: InvestorReportScope
  status: InvestorReportStatus
  htmlContent: string
  publishedAt?: Timestamp
  publishedBy?: string
  updatedAt: Timestamp
  /** Coverage range for all-time reports (earliest / latest counted month, YYYY-MM). */
  coverageFirst?: string
  coverageLatest?: string
  /**
   * Per-investor read state. Each investorReports doc belongs to exactly one
   * investor, so a boolean on the doc is sufficient — no separate read-tracking
   * collection needed. Absent = unread (backwards-compatible with older docs).
   * Reset to false whenever the report is re-drafted (a revision the investor
   * hasn't seen), and flipped to true by the investor when they open it.
   */
  isRead?: boolean
  readAt?: Timestamp
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
  projectedDepreciationAmortization?: number
  projectedTax?: number
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

export interface ReportMedia {
  id: string
  type: 'image' | 'video'
  fileName: string
  fileUrl: string       // Firebase download URL
  fileSize: number
  storagePath: string   // full path for deletion from Storage
}

export interface ManagementReport {
  id: string
  period: string
  businessSummary: string
  issues: Issue[]
  actionItems: ActionItem[]
  media?: ReportMedia[]
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

// ─── Milestones & Covenants (Phase 4, per-portfolio governance) ───────────
//
// Subcollections /portfolios/{id}/milestones and /portfolios/{id}/covenants.
// BA-PM (analyst) does CRUD; investors read-only. A failed covenant raises a
// red alert; a delayed/missed milestone is surfaced with a status badge.

export type MilestoneStatus = 'pending' | 'on_track' | 'achieved' | 'delayed' | 'missed'

export interface Milestone {
  id: string
  title: string
  /** What "done" looks like (kriteria keberhasilan). */
  successCriteria: string
  /** Target completion date (YYYY-MM-DD). */
  targetDate: string
  status: MilestoneStatus
  /** Free-text name of who last updated it. */
  updatedBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type CovenantResult = 'pass' | 'fail'

export interface Covenant {
  id: string
  name: string
  /** Required threshold (free text, e.g. "DSCR ≥ 1.2x"). */
  requirement: string
  /** Actual measured value (free text). */
  actual: string
  /** Period the check applies to (e.g. "2026-Q1" or a label). */
  period: string
  result: CovenantResult
  updatedBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
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

// ─── Investor Transfer Proof (IR-published, links to a published report) ──
//
// Top-level collection: /investorTransferProofs/{id}
// Created by Investor Relation when they send the investor a payout proof
// screenshot. Each proof is tied to a specific published investorReports
// doc (which may be per-portfolio, accumulated, or all_time).

export interface InvestorTransferProof {
  id: string
  investorUid: string
  investorName: string
  /**
   * Top-level investorReports doc id this proof is attached to, or `null` for a
   * standalone proof sent before any report exists (e.g. a new portfolio with no
   * analyst data yet, but a real bagi hasil was paid).
   */
  investorReportId: string | null
  /** Denormalized for the IR/Investor list views; null for __accumulated__ reports. */
  portfolioId: string | null
  portfolioName: string
  /** "YYYY-MM" or "YYYY-Qn" or "ALL_TIME". */
  period: string
  amount: number
  /**
   * Optional return-of-principal (pengembalian pokok) sent alongside this
   * payout. Only set for portfolios with `returnsPrincipal`; null/absent
   * otherwise. Surfaced as a second column in the Resume Bagi Hasil recap.
   */
  principalAmount?: number | null
  fileUrl: string
  fileName: string
  storagePath: string
  notes: string
  uploadedBy: string
  uploadedByName: string
  createdAt: Timestamp
}

// ─── Bagi Hasil Manual Entry (backfilled payout history) ──────────────────
//
// Top-level collection: /bagiHasilManualEntries/{id}
// Manually entered by the team to backfill bagi hasil (and optional principal
// return) that was paid BEFORE the project was tracked in the app. Ongoing
// payouts link to InvestorTransferProof instead; the Resume Bagi Hasil recap
// merges both into one per-investor, per-portfolio timeline.

export interface BagiHasilManualEntry {
  id: string
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  /** "YYYY-MM". */
  period: string
  bagiHasilAmount: number
  /** Optional return-of-principal; null when this porto doesn't use it. */
  principalAmount: number | null
  notes: string
  /**
   * Proof file (PDF/image) for the backfilled payout. Required for entries
   * created after the DF-01 change; optional/absent on legacy rows.
   */
  fileUrl?: string
  fileName?: string
  storagePath?: string
  createdBy: string
  createdByName: string
  createdAt: Timestamp
}

// ─── Investor Notification (in-app alert, manual clear) ───────────────────
//
// Top-level collection: /investorNotifications/{id}
// Created whenever IR sends a transfer proof. The investor sees a banner
// until they mark it read (cleared). Cleared notifications stay in the
// collection so the History tab can show the income trail.

export type InvestorNotificationType = 'transfer_proof'

export interface InvestorNotification {
  id: string
  investorUid: string
  type: InvestorNotificationType
  /** Linked proof doc id (for transfer_proof type). */
  transferProofId: string
  /** Denormalized for display; avoids a join on the history tab. Null for standalone proofs. */
  investorReportId: string | null
  portfolioName: string
  period: string
  amount: number
  /** Optional return-of-principal mirrored from the proof (DF-13); null/absent otherwise. */
  principalAmount?: number | null
  fileUrl: string
  /** Original proof filename; lets display branch image vs PDF rendering. */
  fileName?: string
  message: string
  cleared: boolean
  clearedAt?: Timestamp
  createdAt: Timestamp
}

// ─── Investor CRM ────────────────────────────────────────────────────────

export type CommunicationType = 'report' | 'custom_message'
export type CommunicationChannel = 'clipboard' | 'email' | 'download' | 'publish'

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
  | 'return_model'

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

// ─── Admin Data Override Audit Log ────────────────────────────────────────
//
// Top-level collection: /adminOverrides/{id}
// Immutable trail of every correction an admin makes through the dedicated
// override pages (portfolio & investor). Each save records a before/after JSON
// snapshot of the section that changed plus a required reason note, so any
// manual correction of analyst/IR input is traceable. Writes are admin-only and
// can never be edited or deleted (see firestore.rules).

export type AdminOverrideScope = 'portfolio' | 'investor'

export interface AdminOverrideLog {
  id: string
  scope: AdminOverrideScope
  /** Portfolio id or investor uid the override targets. */
  targetId: string
  /** Human label of the target at write time (portfolio name / investor name). */
  targetLabel: string
  /** Which section was overridden, e.g. 'master', 'config', 'allocation', 'pnl', 'projection', 'profile', 'payout'. */
  section: string
  /** Free-text description of what changed (e.g. "Revenue 2025-03"). */
  summary: string
  /** JSON-serializable snapshot of the affected fields before the change. */
  before: Record<string, unknown>
  /** JSON-serializable snapshot of the affected fields after the change. */
  after: Record<string, unknown>
  reasonNote: string
  changedByUid: string
  changedByName: string
  changedAt: Timestamp
}
