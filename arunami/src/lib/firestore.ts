import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, deleteField, query, where, orderBy, serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { secondaryAuth, db, storage } from './firebase'
import type {
  AppUser, Portfolio, FinancialData, PortfolioReport,
  ManagementReport, Note, TransferProof, InvestorAllocation,
  PnLExtractedData, ProjectionExtractedData,
  MonthlyDataPoint, CostItem, TransactionDataPoint, RevenueMixItem,
  PortfolioConfig, InvestorCommunication,
  InvestorReportDoc, EquityChangeEntry,
  InvestorConfigUnion, ConfigChangeKind, ReturnModelType,
  InvestorTransferProof, InvestorNotification, BagiHasilManualEntry,
} from '@/types'
import { ACCUMULATED_PORTFOLIO_ID, ALL_TIME_PERIOD } from '@/types'
import { normalizePeriod, comparePeriods } from '@/lib/dateUtils'

// ─── Users ────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { ...snap.data(), uid: snap.id } as AppUser : null
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({ ...d.data(), uid: d.id }) as AppUser)
}

export async function createUser(
  email: string,
  password: string,
  displayName: string,
  role: AppUser['role'],
  createdBy: string,
  isArunamiTeam?: boolean,
) {
  // Use secondaryAuth so the admin's session on the primary auth is not replaced
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  await signOut(secondaryAuth)
  const user: Omit<AppUser, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    uid: cred.user.uid,
    email,
    displayName,
    role,
    isArunamiTeam: isArunamiTeam ?? false,
    createdBy,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'users', cred.user.uid), user)
  return cred.user
}

export async function updateUser(uid: string, data: Partial<Pick<AppUser, 'displayName' | 'role' | 'isArunamiTeam'>>) {
  await updateDoc(doc(db, 'users', uid), data)
}

export async function deleteUser(uid: string) {
  await deleteDoc(doc(db, 'users', uid))
}

// ─── Portfolios ───────────────────────────────────────────────────────────

export async function getAllPortfolios(): Promise<Portfolio[]> {
  const snap = await getDocs(collection(db, 'portfolios'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio)
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  const snap = await getDoc(doc(db, 'portfolios', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Portfolio) : null
}

export async function getInvestorPortfolios(uid: string): Promise<Portfolio[]> {
  const q = query(collection(db, 'portfolios'), where('assignedInvestors', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio)
}

export async function getAnalystPortfolios(uid: string): Promise<Portfolio[]> {
  const q = query(collection(db, 'portfolios'), where('assignedAnalysts', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio)
}

export async function createPortfolio(data: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, 'portfolios'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updatePortfolio(id: string, data: Partial<Portfolio>) {
  await updateDoc(doc(db, 'portfolios', id), { ...data, updatedAt: serverTimestamp() })
}

export async function deletePortfolio(id: string) {
  await deleteDoc(doc(db, 'portfolios', id))
}

// ─── Portfolio Config ─────────────────────────────────────────────────────

export async function getPortfolioConfig(portfolioId: string): Promise<PortfolioConfig | null> {
  const snap = await getDoc(doc(db, 'portfolios', portfolioId, 'config', 'current'))
  return snap.exists() ? (snap.data() as PortfolioConfig) : null
}

const DEFAULT_PORTFOLIO_CONFIG: Omit<PortfolioConfig, 'createdAt'> = {
  industryType: 'retail',
  revenueCategories: [
    { id: 'laptop', name: 'Laptop', color: '#38a169' },
    { id: 'service', name: 'Service', color: '#3182ce' },
    { id: 'aksesoris', name: 'Aksesoris', color: '#d69e2e' },
  ],
  returnModel: 'net_profit_share',
  investorConfig: {
    type: 'net_profit_share',
    investorSharePercent: 70,
    arunamiFeePercent: 10,
  },
  reportingFrequency: 'bulanan',
  kpiMetrics: [
    { id: 'revenue', name: 'Revenue', targetValue: 0, unit: 'currency' },
    { id: 'net-profit', name: 'Net Profit', targetValue: 0, unit: 'currency' },
    { id: 'gross-margin', name: 'Gross Margin', targetValue: 0, unit: 'percentage' },
    { id: 'efficiency', name: 'Efisiensi', targetValue: 0, unit: 'percentage' },
  ],
}

export async function getPortfolioConfigOrDefault(portfolioId: string): Promise<PortfolioConfig> {
  const config = await getPortfolioConfig(portfolioId)
  if (!config) {
    return { ...DEFAULT_PORTFOLIO_CONFIG, createdAt: null as unknown as import('firebase/firestore').Timestamp }
  }
  // Legacy coercion: map stale slot_based docs to net_profit_share at read time
  const rawType = (config.investorConfig as { type?: string } | undefined)?.type
  if ((config.returnModel as string) === 'slot_based' || rawType === 'slot_based') {
    return {
      ...config,
      returnModel: 'net_profit_share',
      investorConfig: {
        type: 'net_profit_share',
        investorSharePercent: config.investorConfig.investorSharePercent,
        arunamiFeePercent: config.investorConfig.arunamiFeePercent,
      },
    }
  }
  return config
}

export async function savePortfolioConfig(portfolioId: string, config: Omit<PortfolioConfig, 'createdAt'>) {
  await setDoc(doc(db, 'portfolios', portfolioId, 'config', 'current'), {
    ...config,
    createdAt: serverTimestamp(),
  })
}

/** Patch a few fields on the live config doc without rewriting the whole thing. */
export async function updatePortfolioConfigFields(
  portfolioId: string,
  patch: Partial<PortfolioConfig>,
) {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'config', 'current'), patch)
}

// ─── Equity History (Profit Sharing change trail) ───────────────────────

export async function getEquityHistory(portfolioId: string): Promise<EquityChangeEntry[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'equityHistory'))
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }) as EquityChangeEntry)
  return rows.sort((a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0))
}

/**
 * Generic config change recorder. Merges the new investorConfig into the
 * portfolio config and appends an audit row to equityHistory, all in one
 * batch. Use for any change to the per-model return config (yield %, revenue
 * share %, scheduled payments, dividends, custom formula, etc).
 */
export async function recordConfigChange(params: {
  portfolioId: string
  currentConfig: PortfolioConfig
  newInvestorConfig: InvestorConfigUnion
  changeKind: ConfigChangeKind
  fromValue: string
  toValue: string
  reasonNote: string
  effectiveFromPeriod: string
  changedByUid: string
  changedByName: string
  newReturnModel?: ReturnModelType
}): Promise<void> {
  const {
    portfolioId, currentConfig, newInvestorConfig, changeKind,
    fromValue, toValue, reasonNote, effectiveFromPeriod,
    changedByUid, changedByName, newReturnModel,
  } = params

  const batch = writeBatch(db)
  const configRef = doc(db, 'portfolios', portfolioId, 'config', 'current')
  const mergedConfig: PortfolioConfig = {
    ...currentConfig,
    investorConfig: newInvestorConfig,
    ...(newReturnModel ? { returnModel: newReturnModel } : {}),
  }
  batch.set(configRef, mergedConfig, { merge: true })

  const historyRef = doc(collection(db, 'portfolios', portfolioId, 'equityHistory'))
  const entry: Omit<EquityChangeEntry, 'id' | 'changedAt'> & {
    changedAt: ReturnType<typeof serverTimestamp>
  } = {
    changedAt: serverTimestamp(),
    changedByUid,
    changedByName,
    fromInvestorPercent: currentConfig.investorConfig.investorSharePercent,
    toInvestorPercent: newInvestorConfig.investorSharePercent,
    fromArunamiPercent: currentConfig.investorConfig.arunamiFeePercent,
    toArunamiPercent: newInvestorConfig.arunamiFeePercent,
    reasonCategory: 'other',
    effectiveFromPeriod,
    changeKind,
    fromValue,
    toValue,
    ...(reasonNote && reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
  }
  batch.set(historyRef, entry)

  await batch.commit()
}

// ─── Financial Data ───────────────────────────────────────────────────────

export async function getFinancialData(portfolioId: string): Promise<FinancialData | null> {
  const snap = await getDoc(doc(db, 'portfolios', portfolioId, 'financialData', 'current'))
  return snap.exists() ? (snap.data() as FinancialData) : null
}

export async function saveFinancialData(portfolioId: string, data: Partial<FinancialData>) {
  await setDoc(doc(db, 'portfolios', portfolioId, 'financialData', 'current'), data, { merge: true })
}

// ─── Reports ──────────────────────────────────────────────────────────────

export async function getReports(portfolioId: string, type: 'pnl' | 'projection'): Promise<PortfolioReport[]> {
  const q = query(
    collection(db, 'portfolios', portfolioId, 'reports'),
    where('type', '==', type),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PortfolioReport)
}

export async function saveReport(portfolioId: string, report: Omit<PortfolioReport, 'id' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'reports'), {
    ...report,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateReport(
  portfolioId: string,
  reportId: string,
  data: Partial<Omit<PortfolioReport, 'id' | 'createdAt'>>,
) {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'reports', reportId), data)
}

export async function deleteReport(portfolioId: string, reportId: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'reports', reportId))
}

export async function deleteAllReports(portfolioId: string, type: 'pnl' | 'projection') {
  const q = query(
    collection(db, 'portfolios', portfolioId, 'reports'),
    where('type', '==', type),
  )
  const snap = await getDocs(q)
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// ─── Management Reports ───────────────────────────────────────────────────

export async function getManagementReports(portfolioId: string): Promise<ManagementReport[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'managementReports'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ManagementReport)
}

export async function saveManagementReport(portfolioId: string, report: Omit<ManagementReport, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'managementReports'), {
    ...report,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateManagementReport(portfolioId: string, id: string, data: Partial<ManagementReport>) {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'managementReports', id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteManagementReport(portfolioId: string, id: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'managementReports', id))
}

// ─── Notes ────────────────────────────────────────────────────────────────

export async function getNotes(portfolioId: string): Promise<Note[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'notes'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Note)
}

export async function saveNote(portfolioId: string, note: Omit<Note, 'id' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'notes'), {
    ...note,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteNote(portfolioId: string, id: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'notes', id))
}

// ─── Transfer Proofs ──────────────────────────────────────────────────────

export async function getTransferProofs(portfolioId: string): Promise<TransferProof[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'transferProofs'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as TransferProof)
}

// ─── Investor Allocations ────────────────────────────────────────────────

export async function getAllocationsForPortfolio(portfolioId: string): Promise<InvestorAllocation[]> {
  const q = query(collection(db, 'investorAllocations'), where('portfolioId', '==', portfolioId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorAllocation)
}

export async function getAllocationsForInvestor(investorUid: string): Promise<InvestorAllocation[]> {
  const q = query(collection(db, 'investorAllocations'), where('investorUid', '==', investorUid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorAllocation)
}

export interface InvestorReportSource {
  allocation: InvestorAllocation
  config: PortfolioConfig | null
  portfolio: Portfolio | null
  pnlReports: PnLExtractedData[]
  projReports: ProjectionExtractedData[]
  mgmtReports: ManagementReport[]
  notes: Note[]
  /** Global investor-pool share of Net Profit, in percent. */
  investorSharePercent: number
}

/**
 * Each of an investor's allocations enriched with everything the detailed
 * report builder needs: config, portfolio doc, P&L/projection extracted data,
 * management reports and notes. Used by the personalized report generator.
 */
export async function getInvestorReportSources(investorUid: string): Promise<InvestorReportSource[]> {
  const allocations = await getAllocationsForInvestor(investorUid)
  return Promise.all(
    allocations.map(async (allocation) => {
      const pid = allocation.portfolioId
      const [config, portfolio, pnls, projs, mgmts, notes] = await Promise.all([
        getPortfolioConfigOrDefault(pid),
        getPortfolio(pid),
        getReports(pid, 'pnl'),
        getReports(pid, 'projection'),
        getManagementReports(pid),
        getNotes(pid),
      ])
      return {
        allocation,
        config,
        portfolio,
        pnlReports: pnls.map(r => r.extractedData as PnLExtractedData),
        projReports: projs.map(r => r.extractedData as ProjectionExtractedData),
        mgmtReports: mgmts,
        notes,
        investorSharePercent: config.investorConfig?.investorSharePercent ?? 0,
      }
    }),
  )
}

/** Recalculates assignedInvestors on the portfolio doc and flushes stale slotsSummary field. */
async function refreshPortfolioInvestors(portfolioId: string) {
  const allocations = await getAllocationsForPortfolio(portfolioId)
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    assignedInvestors: allocations.map(a => a.investorUid),
    slotsSummary: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export async function createAllocation(
  data: Omit<InvestorAllocation, 'id' | 'joinedAt' | 'updatedAt'>,
) {
  const allocRef = await addDoc(collection(db, 'investorAllocations'), {
    ...data,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await refreshPortfolioInvestors(data.portfolioId)
  return allocRef.id
}

export async function updateAllocation(
  allocationId: string,
  data: Partial<Pick<InvestorAllocation, 'investedAmount' | 'ownershipPercent'>>,
  portfolioId: string,
) {
  await updateDoc(doc(db, 'investorAllocations', allocationId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
  await refreshPortfolioInvestors(portfolioId)
}

export async function deleteAllocation(
  allocationId: string,
  portfolioId: string,
) {
  await deleteDoc(doc(db, 'investorAllocations', allocationId))
  await refreshPortfolioInvestors(portfolioId)
}

// ─── All Allocations (for CRM) ──────────────────────────────────────────

export async function getAllAllocations(): Promise<InvestorAllocation[]> {
  const snap = await getDocs(collection(db, 'investorAllocations'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorAllocation)
}

// ─── Investor Communications ────────────────────────────────────────────

export async function getCommunicationsForInvestor(investorUid: string): Promise<InvestorCommunication[]> {
  const q = query(collection(db, 'investorCommunications'), where('investorUid', '==', investorUid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorCommunication)
}

export async function saveCommunication(
  data: Omit<InvestorCommunication, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'investorCommunications'), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// ─── Sync Financial Data ─────────────────────────────────────────────────
// Aggregates all PnL + Projection reports into the financialData/current doc
// so the analysis pages (Overview, Revenue, Costs, Investors) can display data.

export async function syncFinancialData(portfolioId: string) {
  const [pnlReports, projReports, existingData] = await Promise.all([
    getReports(portfolioId, 'pnl'),
    getReports(portfolioId, 'projection'),
    getFinancialData(portfolioId),
  ])

  // Normalize all periods to YYYY-MM for consistent matching
  for (const r of pnlReports) r.period = normalizePeriod(r.period)
  for (const r of projReports) r.period = normalizePeriod(r.period)

  // Sort reports by period for chronological order (YYYY-MM sorts correctly)
  const sortByPeriod = (a: PortfolioReport, b: PortfolioReport) =>
    comparePeriods(a.period, b.period)
  const sortedPnl = pnlReports.sort(sortByPeriod)
  const sortedProj = projReports.sort(sortByPeriod)

  // Build a map of projection data keyed by period
  const projMap = new Map<string, ProjectionExtractedData>()
  for (const r of sortedProj) {
    projMap.set(r.period, r.extractedData as ProjectionExtractedData)
  }

  // Collect all unique periods (from both PnL and projections), sorted chronologically
  const allPeriods = [...new Set([
    ...sortedPnl.map(r => r.period),
    ...sortedProj.map(r => r.period),
  ])].sort(comparePeriods)

  // Build a map of PnL data keyed by period
  const pnlMap = new Map<string, PnLExtractedData>()
  for (const r of sortedPnl) {
    pnlMap.set(r.period, r.extractedData as PnLExtractedData)
  }

  // Build revenueData & profitData
  const revenueData: MonthlyDataPoint[] = allPeriods.map(period => {
    const pnl = pnlMap.get(period)
    const proj = projMap.get(period)
    return {
      month: period,
      aktual: pnl?.revenue ?? 0,
      proyeksi: proj?.projectedRevenue ?? 0,
    }
  })

  const profitData: MonthlyDataPoint[] = allPeriods.map(period => {
    const pnl = pnlMap.get(period)
    const proj = projMap.get(period)
    return {
      month: period,
      aktual: pnl?.netProfit ?? 0,
      proyeksi: proj?.projectedNetProfit ?? 0,
    }
  })

  // Build costStructure from the latest PnL. Includes COGS sub-items (when the
  // report has a breakdown) prefixed with "COGS: " so downstream consumers can
  // tell them apart from opex items. Percentage is computed against the combined
  // total of cogs + opex so items are comparable on the same scale.
  const latestPnl = sortedPnl.at(-1)?.extractedData as PnLExtractedData | undefined
  let costStructure: CostItem[] = []
  if (latestPnl) {
    const opexItems = latestPnl.opex ?? []
    const cogsSubs = latestPnl.cogsSubItems ?? []
    const totalOpex = latestPnl.totalOpex || opexItems.reduce((s, o) => s + o.amount, 0)
    const totalCogs = cogsSubs.length > 0
      ? cogsSubs.reduce((s, x) => s + (Number(x.amount) || 0), 0)
      : (Number(latestPnl.cogs) || 0)
    const grandTotal = totalCogs + totalOpex

    const cogsEntries: CostItem[] = cogsSubs.map(s => ({
      name: `COGS: ${s.name}`,
      amount: Number(s.amount) || 0,
      percentage: grandTotal > 0 ? ((Number(s.amount) || 0) / grandTotal) * 100 : 0,
    }))
    const opexEntries: CostItem[] = opexItems.map(o => ({
      name: o.name,
      amount: o.amount,
      percentage: grandTotal > 0 ? (o.amount / grandTotal) * 100 : 0,
    }))
    costStructure = [...cogsEntries, ...opexEntries]
  }

  // Fetch portfolio config for dynamic categories
  const config = await getPortfolioConfigOrDefault(portfolioId)
  const categoryIds = config.revenueCategories.map(c => c.id)
  const categoryNameMap = Object.fromEntries(config.revenueCategories.map(c => [c.id, c.name]))

  // Build transactionData from PnL unit breakdowns (dynamic categories)
  const transactionData: TransactionDataPoint[] = sortedPnl.map(r => {
    const d = r.extractedData as PnLExtractedData
    const categories: Record<string, number> = {}
    for (const catId of categoryIds) {
      categories[catId] = d.unitBreakdown?.[catId] ?? 0
    }
    return { month: r.period, categories }
  })

  // Build revenueMix from the latest PnL unit breakdown (dynamic categories)
  let revenueMix: RevenueMixItem[] = []
  if (latestPnl?.unitBreakdown) {
    const ub = latestPnl.unitBreakdown
    const total = categoryIds.reduce((sum, id) => sum + (ub[id] ?? 0), 0)
    if (total > 0) {
      revenueMix = categoryIds.map(id => ({
        name: categoryNameMap[id],
        value: ub[id] ?? 0,
        percentage: ((ub[id] ?? 0) / total) * 100,
      }))
    }
  }

  // Build radarData from the latest PnL
  const radarData = latestPnl ? [
    { metric: 'Revenue', value: latestPnl.revenue, fullMark: latestPnl.revenue * 1.5 },
    { metric: 'Profit', value: latestPnl.netProfit, fullMark: latestPnl.revenue },
    { metric: 'Gross Margin', value: latestPnl.revenue > 0 ? (latestPnl.grossProfit / latestPnl.revenue) * 100 : 0, fullMark: 100 },
    { metric: 'Efisiensi', value: latestPnl.revenue > 0 ? ((latestPnl.revenue - latestPnl.totalOpex) / latestPnl.revenue) * 100 : 0, fullMark: 100 },
  ] : []

  // Preserve existing investorConfig or build from portfolio config
  const investorConfig = existingData?.investorConfig ?? {
    returnModel: config.returnModel,
    investorSharePercent: config.investorConfig.investorSharePercent,
    arunamiFeePercent: config.investorConfig.arunamiFeePercent,
  }
  // Always sync returnModel from latest config
  investorConfig.returnModel = config.returnModel

  const financialData: FinancialData = {
    revenueData,
    profitData,
    costStructure,
    transactionData,
    aovData: existingData?.aovData ?? [],
    revenueMix,
    projections: [],
    radarData,
    investorConfig,
  }

  await saveFinancialData(portfolioId, financialData)
}

// ─── Investor Reports (per-investor draft / published) ───────────────────

export async function getInvestorReportsForPortfolio(
  portfolioId: string,
  period: string,
): Promise<InvestorReportDoc[]> {
  const q = query(
    collection(db, 'portfolios', portfolioId, 'investorReports'),
    where('period', '==', period),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorReportDoc)
}

export async function getPublishedInvestorReports(
  investorUid: string,
): Promise<InvestorReportDoc[]> {
  const q = query(
    collection(db, 'investorReports'),
    where('investorUid', '==', investorUid),
    where('status', '==', 'published'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorReportDoc)
}

/**
 * Upsert a draft investor report for a single (portfolio × investor × period).
 * Writes to BOTH the nested portfolio subcollection (fast listing for analyst)
 * AND the top-level `investorReports` collection (fast query for investor).
 * The top-level doc uses the same id for easy linking.
 */
export async function upsertInvestorReportDraft(data: {
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  period: string
  htmlContent: string
  reportType?: 'monthly' | 'quarterly'
}): Promise<string> {
  const id = `${data.portfolioId}_${data.investorUid}_${data.period}`
  const payload = {
    ...data,
    reportType: data.reportType ?? 'monthly',
    status: 'draft' as const,
    updatedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'portfolios', data.portfolioId, 'investorReports', id), payload, { merge: true })
  batch.set(doc(db, 'investorReports', id), payload, { merge: true })
  await batch.commit()
  return id
}

export async function publishInvestorReport(params: {
  portfolioId: string
  reportId: string
  publishedBy: string
}): Promise<void> {
  const payload = {
    status: 'published' as const,
    publishedAt: serverTimestamp(),
    publishedBy: params.publishedBy,
    updatedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.update(doc(db, 'portfolios', params.portfolioId, 'investorReports', params.reportId), payload)
  batch.update(doc(db, 'investorReports', params.reportId), payload)
  await batch.commit()
}

/**
 * Bulk-publish every draft for a (portfolio × period).
 * Upserts draft docs first for any investors passed in `reports` so the batch
 * always has a target, then flips all to published in one batch write.
 */
export async function publishAllInvestorReports(params: {
  portfolioId: string
  period: string
  reportType?: 'monthly' | 'quarterly'
  reports: {
    portfolioName: string
    investorUid: string
    investorName: string
    htmlContent: string
  }[]
  publishedBy: string
}): Promise<void> {
  const batch = writeBatch(db)
  for (const r of params.reports) {
    const id = `${params.portfolioId}_${r.investorUid}_${params.period}`
    const payload = {
      portfolioId: params.portfolioId,
      portfolioName: r.portfolioName,
      investorUid: r.investorUid,
      investorName: r.investorName,
      period: params.period,
      reportType: params.reportType ?? 'monthly',
      htmlContent: r.htmlContent,
      status: 'published' as const,
      publishedAt: serverTimestamp(),
      publishedBy: params.publishedBy,
      updatedAt: serverTimestamp(),
    }
    batch.set(doc(db, 'portfolios', params.portfolioId, 'investorReports', id), payload, { merge: true })
    batch.set(doc(db, 'investorReports', id), payload, { merge: true })
  }
  await batch.commit()
}

export async function unpublishInvestorReport(params: {
  portfolioId: string
  reportId: string
}): Promise<void> {
  const payload = {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.update(doc(db, 'portfolios', params.portfolioId, 'investorReports', params.reportId), payload)
  batch.update(doc(db, 'investorReports', params.reportId), payload)
  await batch.commit()
}

/**
 * Bulk-unpublish every published report for a (portfolio × period).
 * Flips status back to draft so investors no longer see it.
 */
export async function unpublishAllInvestorReports(params: {
  portfolioId: string
  period: string
}): Promise<number> {
  const existing = await getInvestorReportsForPortfolio(params.portfolioId, params.period)
  const published = existing.filter(r => r.status === 'published')
  if (published.length === 0) return 0

  const batch = writeBatch(db)
  const payload = {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  }
  for (const r of published) {
    batch.update(doc(db, 'portfolios', params.portfolioId, 'investorReports', r.id), payload)
    batch.update(doc(db, 'investorReports', r.id), payload)
  }
  await batch.commit()
  return published.length
}

// ─── Accumulated (all-projects) investor reports ─────────────────────────────
//
// Stored in the same top-level `investorReports` collection as per-portfolio
// reports, but keyed per (investor × period) with portfolioId = '__accumulated__'
// and scope = 'accumulated'. No portfolio subcollection mirror (there is no
// single owning portfolio). `getPublishedInvestorReports` already returns these;
// callers filter by `scope`.

function accumulatedReportId(investorUid: string, period: string): string {
  return `accumulated_${investorUid}_${period}`
}

export async function publishAccumulatedReport(params: {
  investorUid: string
  investorName: string
  period: string
  reportType?: 'monthly' | 'quarterly'
  htmlContent: string
  publishedBy: string
}): Promise<string> {
  const id = accumulatedReportId(params.investorUid, params.period)
  await setDoc(
    doc(db, 'investorReports', id),
    {
      portfolioId: ACCUMULATED_PORTFOLIO_ID,
      portfolioName: 'Semua Proyek',
      investorUid: params.investorUid,
      investorName: params.investorName,
      period: params.period,
      reportType: params.reportType ?? 'monthly',
      scope: 'accumulated' as const,
      status: 'published' as const,
      htmlContent: params.htmlContent,
      publishedAt: serverTimestamp(),
      publishedBy: params.publishedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return id
}

export async function unpublishAccumulatedReport(params: {
  investorUid: string
  period: string
}): Promise<void> {
  const id = accumulatedReportId(params.investorUid, params.period)
  await updateDoc(doc(db, 'investorReports', id), {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// ─── All-time (lifetime, all-projects) investor report ───────────────────────
//
// A single doc per investor (id `alltime_${uid}`) in the same `investorReports`
// collection, with scope = 'all_time' and period = ALL_TIME_PERIOD. Regenerating
// overwrites it. `getPublishedInvestorReports` already returns it; callers must
// filter the ALL_TIME_PERIOD sentinel out before sorting by period.

function allTimeReportId(investorUid: string): string {
  return `alltime_${investorUid}`
}

export async function publishAllTimeReport(params: {
  investorUid: string
  investorName: string
  htmlContent: string
  publishedBy: string
  coverageFirst?: string
  coverageLatest?: string
}): Promise<string> {
  const id = allTimeReportId(params.investorUid)
  await setDoc(
    doc(db, 'investorReports', id),
    {
      portfolioId: ACCUMULATED_PORTFOLIO_ID,
      portfolioName: 'Semua Proyek (All-Time)',
      investorUid: params.investorUid,
      investorName: params.investorName,
      period: ALL_TIME_PERIOD,
      scope: 'all_time' as const,
      status: 'published' as const,
      htmlContent: params.htmlContent,
      coverageFirst: params.coverageFirst ?? null,
      coverageLatest: params.coverageLatest ?? null,
      publishedAt: serverTimestamp(),
      publishedBy: params.publishedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return id
}

export async function unpublishAllTimeReport(params: {
  investorUid: string
}): Promise<void> {
  const id = allTimeReportId(params.investorUid)
  await updateDoc(doc(db, 'investorReports', id), {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// ─── Bukti Transfer + Investor Notifications ─────────────────────────────
//
// IR uploads a screenshot → writes a doc in `investorTransferProofs` →
// mirrors a doc into `investorNotifications` (cleared=false). Investor
// dashboard shows a banner for uncleared ones; cleared ones remain
// in the collection so the History tab can render the income trail.

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function extOf(mime: string, name: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
}

export interface CreateTransferProofInput {
  investorUid: string
  investorName: string
  investorReport: InvestorReportDoc
  amount: number
  /** Optional return-of-principal sent with this payout (portfolios that use it). */
  principalAmount?: number | null
  notes: string
  file: File
  uploadedBy: string
  uploadedByName: string
}

export async function createInvestorTransferProof(
  input: CreateTransferProofInput,
): Promise<{ proofId: string; fileUrl: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(input.file.type)) {
    throw new Error('Tipe file tidak didukung. Gunakan PNG, JPG, atau WEBP.')
  }
  if (input.file.size > MAX_IMAGE_BYTES) {
    throw new Error('Ukuran file melebihi 5 MB.')
  }
  if (!(input.amount > 0)) {
    throw new Error('Nominal transfer harus lebih dari 0.')
  }

  const ext = extOf(input.file.type, input.file.name)
  const safeReportId = input.investorReport.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = `transferProofs/${input.investorUid}/${safeReportId}/${Date.now()}.${ext}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, input.file, { contentType: input.file.type })
  const fileUrl = await getDownloadURL(ref)

  const proofId = `${input.investorReport.id}_${Date.now()}`
  const proofData: Omit<InvestorTransferProof, 'id' | 'createdAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>
  } = {
    investorUid: input.investorUid,
    investorName: input.investorName,
    investorReportId: input.investorReport.id,
    portfolioId: input.investorReport.portfolioId === '__accumulated__' ? null : input.investorReport.portfolioId,
    portfolioName: input.investorReport.portfolioName,
    period: input.investorReport.period,
    amount: input.amount,
    principalAmount: input.principalAmount ?? null,
    fileUrl,
    fileName: input.file.name,
    storagePath: path,
    notes: input.notes.trim(),
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName,
    createdAt: serverTimestamp(),
  }

  const message = buildProofMessage(input)

  const batch = writeBatch(db)
  const proofRef = doc(db, 'investorTransferProofs', proofId)
  batch.set(proofRef, proofData)
  const notifRef = doc(db, 'investorNotifications', `notif_${proofId}`)
  batch.set(notifRef, {
    investorUid: input.investorUid,
    type: 'transfer_proof',
    transferProofId: proofId,
    investorReportId: input.investorReport.id,
    portfolioName: input.investorReport.portfolioName,
    period: input.investorReport.period,
    amount: input.amount,
    fileUrl,
    message,
    cleared: false,
    createdAt: serverTimestamp(),
  })
  await batch.commit()

  return { proofId, fileUrl }
}

function buildProofMessage(input: CreateTransferProofInput): string {
  const formatted = `Rp ${input.amount.toLocaleString('id-ID')}`
  const report = input.investorReport
  const subject = report.scope === 'all_time'
    ? 'laporan all-time'
    : report.scope === 'accumulated'
      ? 'laporan akumulasi'
      : `laporan ${report.portfolioName}`
  return `Bukti transfer ${formatted} untuk ${subject} telah dikirim.`
}

export async function getTransferProofsForInvestor(investorUid: string): Promise<InvestorTransferProof[]> {
  const q = query(
    collection(db, 'investorTransferProofs'),
    where('investorUid', '==', investorUid),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as InvestorTransferProof)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export async function getAllTransferProofs(): Promise<InvestorTransferProof[]> {
  const snap = await getDocs(collection(db, 'investorTransferProofs'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as InvestorTransferProof)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export async function getTransferProofsForReport(investorReportId: string): Promise<InvestorTransferProof[]> {
  const q = query(
    collection(db, 'investorTransferProofs'),
    where('investorReportId', '==', investorReportId),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as InvestorTransferProof)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export async function deleteInvestorTransferProof(proof: InvestorTransferProof): Promise<void> {
  // Best-effort storage cleanup; ignore missing files.
  try { await deleteObject(storageRef(storage, proof.storagePath)) } catch { /* noop */ }
  const batch = writeBatch(db)
  batch.delete(doc(db, 'investorTransferProofs', proof.id))
  const notifSnap = await getDocs(query(
    collection(db, 'investorNotifications'),
    where('transferProofId', '==', proof.id),
  ))
  notifSnap.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

export async function getNotificationsForInvestor(
  investorUid: string,
): Promise<InvestorNotification[]> {
  const q = query(
    collection(db, 'investorNotifications'),
    where('investorUid', '==', investorUid),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as InvestorNotification)
}

export async function clearNotification(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'investorNotifications', notificationId), {
    cleared: true,
    clearedAt: serverTimestamp(),
  })
}

// ─── Bagi Hasil Manual Entry (backfilled payout history) ──────────────────
//
// Top-level collection: /bagiHasilManualEntries/{id}. Team backfills payouts
// that predate the app; ongoing payouts live in investorTransferProofs. The
// Resume Bagi Hasil recap merges both. Queries filter by investorUid (+
// optionally portfolioId) and sort in JS to avoid composite indexes.

export interface CreateBagiHasilManualEntryInput {
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  period: string
  bagiHasilAmount: number
  principalAmount: number | null
  notes: string
  createdBy: string
  createdByName: string
}

export async function createBagiHasilManualEntry(
  input: CreateBagiHasilManualEntryInput,
): Promise<string> {
  const ref = await addDoc(collection(db, 'bagiHasilManualEntries'), {
    ...input,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateBagiHasilManualEntry(
  id: string,
  patch: Partial<Pick<BagiHasilManualEntry, 'period' | 'bagiHasilAmount' | 'principalAmount' | 'notes'>>,
): Promise<void> {
  await updateDoc(doc(db, 'bagiHasilManualEntries', id), patch)
}

export async function deleteBagiHasilManualEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, 'bagiHasilManualEntries', id))
}

export async function getBagiHasilManualEntriesForInvestor(
  investorUid: string,
): Promise<BagiHasilManualEntry[]> {
  const snap = await getDocs(query(
    collection(db, 'bagiHasilManualEntries'),
    where('investorUid', '==', investorUid),
  ))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as BagiHasilManualEntry)
    .sort((a, b) => comparePeriods(b.period, a.period))
}

export async function getBagiHasilManualEntries(
  portfolioId: string,
  investorUid: string,
): Promise<BagiHasilManualEntry[]> {
  const all = await getBagiHasilManualEntriesForInvestor(investorUid)
  return all.filter(e => e.portfolioId === portfolioId)
}
