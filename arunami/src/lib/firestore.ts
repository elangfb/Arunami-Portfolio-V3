import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, deleteField, query, where, serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { secondaryAuth, db } from './firebase'
import type {
  AppUser, Portfolio, FinancialData, PortfolioReport,
  ManagementReport, Note, TransferProof, InvestorAllocation,
  PnLExtractedData, ProjectionExtractedData,
  MonthlyDataPoint, CostItem, TransactionDataPoint, RevenueMixItem,
  PortfolioConfig, SlotsSummary, InvestorCommunication,
  InvestorReportDoc, EquityChangeEntry, EquityReasonCategory,
} from '@/types'
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

const LEGACY_RETAIL_CONFIG: Omit<PortfolioConfig, 'createdAt'> = {
  industryType: 'retail',
  revenueCategories: [
    { id: 'laptop', name: 'Laptop', color: '#38a169' },
    { id: 'service', name: 'Service', color: '#3182ce' },
    { id: 'aksesoris', name: 'Aksesoris', color: '#d69e2e' },
  ],
  returnModel: 'slot_based',
  investorConfig: {
    type: 'slot_based',
    totalSlots: 10,
    nominalPerSlot: 5000000,
    investorSharePercent: 70,
    arunamiFeePercent: 10,
  },
  reportingFrequency: 'bulanan',
  kpiMetrics: [
    { id: 'revenue', name: 'Revenue', targetValue: 0, unit: 'currency' },
    { id: 'net-profit', name: 'Net Profit', targetValue: 0, unit: 'currency' },
    { id: 'gross-margin', name: 'Gross Margin', targetValue: 0, unit: 'percentage' },
    { id: 'efficiency', name: 'Efisiensi', targetValue: 0, unit: 'percentage' },
    { id: 'transaction-count', name: 'Transaksi', targetValue: 0, unit: 'count' },
  ],
}

export async function getPortfolioConfigOrDefault(portfolioId: string): Promise<PortfolioConfig> {
  const config = await getPortfolioConfig(portfolioId)
  if (config) return config
  return { ...LEGACY_RETAIL_CONFIG, createdAt: null as unknown as import('firebase/firestore').Timestamp }
}

export async function savePortfolioConfig(portfolioId: string, config: Omit<PortfolioConfig, 'createdAt'>) {
  await setDoc(doc(db, 'portfolios', portfolioId, 'config', 'current'), {
    ...config,
    createdAt: serverTimestamp(),
  })
}

// ─── Equity History (Profit Sharing change trail) ───────────────────────

/**
 * Updates the investor share on the portfolio config AND appends an
 * immutable history row in a single batch. The history row captures who
 * changed it, when, why, and the period the change takes effect in.
 */
export async function updateInvestorShare(params: {
  portfolioId: string
  currentConfig: PortfolioConfig
  newInvestorPercent: number
  newArunamiPercent: number
  reasonCategory: EquityReasonCategory
  reasonNote?: string
  effectiveFromPeriod: string
  changedByUid: string
  changedByName: string
}): Promise<void> {
  const {
    portfolioId, currentConfig, newInvestorPercent, newArunamiPercent,
    reasonCategory, reasonNote, effectiveFromPeriod, changedByUid, changedByName,
  } = params

  const batch = writeBatch(db)
  const configRef = doc(db, 'portfolios', portfolioId, 'config', 'current')
  batch.set(
    configRef,
    {
      ...currentConfig,
      investorConfig: {
        ...currentConfig.investorConfig,
        investorSharePercent: newInvestorPercent,
        arunamiFeePercent: newArunamiPercent,
      },
    },
    { merge: true },
  )

  const historyRef = doc(collection(db, 'portfolios', portfolioId, 'equityHistory'))
  const entry: Omit<EquityChangeEntry, 'id' | 'changedAt'> & {
    changedAt: ReturnType<typeof serverTimestamp>
  } = {
    changedAt: serverTimestamp(),
    changedByUid,
    changedByName,
    fromInvestorPercent: currentConfig.investorConfig.investorSharePercent,
    toInvestorPercent: newInvestorPercent,
    fromArunamiPercent: currentConfig.investorConfig.arunamiFeePercent,
    toArunamiPercent: newArunamiPercent,
    reasonCategory,
    effectiveFromPeriod,
    ...(reasonNote && reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
  }
  batch.set(historyRef, entry)

  await batch.commit()
}

export async function getEquityHistory(portfolioId: string): Promise<EquityChangeEntry[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'equityHistory'))
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }) as EquityChangeEntry)
  return rows.sort((a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0))
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

/** Recalculates and writes slotsSummary + assignedInvestors on the portfolio doc. */
async function refreshPortfolioSlotsSummary(portfolioId: string, totalSlots: number) {
  const allocations = await getAllocationsForPortfolio(portfolioId)
  const summary: SlotsSummary = {
    totalSlots,
    allocatedSlots: allocations.reduce((sum, a) => sum + a.slots, 0),
    investorCount: allocations.length,
  }
  const investorUids = allocations.map(a => a.investorUid)
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    slotsSummary: summary,
    assignedInvestors: investorUids,
    updatedAt: serverTimestamp(),
  })
}

export async function createAllocation(
  data: Omit<InvestorAllocation, 'id' | 'joinedAt' | 'updatedAt'>,
  totalSlots: number,
) {
  const batch = writeBatch(db)

  const allocRef = doc(collection(db, 'investorAllocations'))
  batch.set(allocRef, {
    ...data,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  await refreshPortfolioSlotsSummary(data.portfolioId, totalSlots)
  return allocRef.id
}

export async function updateAllocation(
  allocationId: string,
  data: Partial<Pick<InvestorAllocation, 'slots' | 'investedAmount' | 'ownershipPercent'>>,
  portfolioId: string,
  totalSlots: number,
) {
  await updateDoc(doc(db, 'investorAllocations', allocationId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
  await refreshPortfolioSlotsSummary(portfolioId, totalSlots)
}

export async function deleteAllocation(
  allocationId: string,
  portfolioId: string,
  totalSlots: number,
) {
  await deleteDoc(doc(db, 'investorAllocations', allocationId))
  await refreshPortfolioSlotsSummary(portfolioId, totalSlots)
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

  // Build costStructure from the latest PnL
  const latestPnl = sortedPnl.at(-1)?.extractedData as PnLExtractedData | undefined
  let costStructure: CostItem[] = []
  if (latestPnl?.opex && latestPnl.opex.length > 0) {
    const totalOpex = latestPnl.totalOpex || latestPnl.opex.reduce((s, o) => s + o.amount, 0)
    costStructure = latestPnl.opex.map(o => ({
      name: o.name,
      amount: o.amount,
      percentage: totalOpex > 0 ? (o.amount / totalOpex) * 100 : 0,
    }))
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
    { metric: 'Transaksi', value: latestPnl.transactionCount, fullMark: latestPnl.transactionCount * 2 },
    { metric: 'Gross Margin', value: latestPnl.revenue > 0 ? (latestPnl.grossProfit / latestPnl.revenue) * 100 : 0, fullMark: 100 },
    { metric: 'Efisiensi', value: latestPnl.revenue > 0 ? ((latestPnl.revenue - latestPnl.totalOpex) / latestPnl.revenue) * 100 : 0, fullMark: 100 },
  ] : []

  // Preserve existing investorConfig or build from portfolio config
  const investorConfig = existingData?.investorConfig ?? {
    returnModel: config.returnModel,
    totalSlots: 'totalSlots' in config.investorConfig ? (config.investorConfig as any).totalSlots : undefined,
    nominalPerSlot: 'nominalPerSlot' in config.investorConfig ? (config.investorConfig as any).nominalPerSlot : undefined,
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
}): Promise<string> {
  const id = `${data.portfolioId}_${data.investorUid}_${data.period}`
  const payload = {
    ...data,
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
