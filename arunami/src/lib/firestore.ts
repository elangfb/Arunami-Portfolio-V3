import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, deleteField, query, where, serverTimestamp,
  writeBatch, Timestamp,
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
  AdminOverrideScope, AdminOverrideLog,
  HealthRules, HealthLevel,
  MeetingRecap, Milestone, Covenant,
  KycDocument, KycStatus, InvestorType, KycDocSlot,
  Announcement, LibraryDocument, DocumentCategory,
  SystemSettings, DistributionBatch, DistributionBatchLine, BatchStatus,
} from '@/types'
import { ACCUMULATED_PORTFOLIO_ID, ALL_TIME_PERIOD } from '@/types'
import { normalizePeriod, comparePeriods } from '@/lib/dateUtils'
import { DEFAULT_HEALTH_RULES } from '@/lib/health'
import { buildConfigTimeline, resolveConfigForPeriod, type ConfigVersion } from '@/lib/configTimeline'

// ─── Users ────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { ...snap.data(), uid: snap.id } as AppUser : null
}

export async function getAllUsers(includeArchived = false): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  const users = snap.docs.map(d => ({ ...d.data(), uid: d.id }) as AppUser)
  // DF-04: hide soft-archived users from active lists unless explicitly requested.
  return includeArchived ? users : users.filter(u => !u.archived)
}

/** Soft-archive a user (DF-04). Keeps all data; drops them from active lists and
 *  from every portfolio's assignedInvestors so they no longer get access/counted. */
export async function archiveUser(uid: string) {
  await updateDoc(doc(db, 'users', uid), { archived: true, archivedAt: serverTimestamp() })
  const allocations = await getAllocationsForInvestor(uid)
  const portfolioIds = [...new Set(allocations.map(a => a.portfolioId))]
  await Promise.all(portfolioIds.map(pid => refreshPortfolioInvestors(pid)))
}

export async function unarchiveUser(uid: string) {
  await updateDoc(doc(db, 'users', uid), { archived: false, archivedAt: deleteField() })
  const allocations = await getAllocationsForInvestor(uid)
  const portfolioIds = [...new Set(allocations.map(a => a.portfolioId))]
  await Promise.all(portfolioIds.map(pid => refreshPortfolioInvestors(pid)))
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

/**
 * Investor self-service profile update (Phase 7). Only the profile/preference
 * fields an investor is allowed to edit on their OWN user doc — the matching
 * firestore rule rejects any other key, so this is safe to call client-side.
 */
export async function updateInvestorProfile(
  uid: string,
  data: Partial<Pick<AppUser, 'phone' | 'bankName' | 'bankAccountNumber' | 'bankAccountHolder' | 'notifyByEmail'>>,
) {
  await updateDoc(doc(db, 'users', uid), data)
}

/** Hard delete — permanent. Prefer archiveUser; this is for admin cleanup only
 *  and does NOT cascade (see DF-04 roadmap for the cascade caveat). */
export async function deleteUser(uid: string) {
  await deleteDoc(doc(db, 'users', uid))
}

// ─── Portfolios ───────────────────────────────────────────────────────────

export async function getAllPortfolios(includeArchived = false): Promise<Portfolio[]> {
  const snap = await getDocs(collection(db, 'portfolios'))
  const portfolios = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio)
  // DF-04: hide soft-archived portfolios from active lists unless requested.
  return includeArchived ? portfolios : portfolios.filter(p => !p.archived)
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  const snap = await getDoc(doc(db, 'portfolios', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Portfolio) : null
}

export async function getInvestorPortfolios(uid: string): Promise<Portfolio[]> {
  const q = query(collection(db, 'portfolios'), where('assignedInvestors', 'array-contains', uid))
  const snap = await getDocs(q)
  // DF-04: archived portfolios drop off the investor's dashboard.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio).filter(p => !p.archived)
}

export async function getAnalystPortfolios(uid: string): Promise<Portfolio[]> {
  const q = query(collection(db, 'portfolios'), where('assignedAnalysts', 'array-contains', uid))
  const snap = await getDocs(q)
  // DF-04: archived portfolios drop off the analyst's dashboard.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Portfolio).filter(p => !p.archived)
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

/** Soft-archive a portfolio (DF-04). Hidden from active lists & dashboards;
 *  all subcollections/data are preserved. */
export async function archivePortfolio(id: string) {
  await updateDoc(doc(db, 'portfolios', id), {
    archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
}

export async function unarchivePortfolio(id: string) {
  await updateDoc(doc(db, 'portfolios', id), {
    archived: false, archivedAt: deleteField(), updatedAt: serverTimestamp(),
  })
}

/** Hard delete — permanent. Prefer archivePortfolio; this does NOT cascade to
 *  subcollections (see DF-04 roadmap). Admin cleanup only. */
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
 * The portfolio's return-config version timeline, replayed from its change
 * history. Pair with `resolveConfigForPeriod` so each reporting period is
 * calculated against the terms that applied to it.
 */
export async function getConfigTimeline(portfolioId: string): Promise<ConfigVersion[]> {
  return buildConfigTimeline(await getEquityHistory(portfolioId))
}

/**
 * Generic config change recorder. Appends an audit row to equityHistory and —
 * when the change governs the newest terms — merges the new investorConfig into
 * `config/current`. Use for any change to the per-model return config (yield %,
 * revenue share %, scheduled payments, dividends, custom formula, etc).
 *
 * `effectiveFromPeriod` may be in the past. Backdating is what makes the two
 * reads below necessary, because neither the "from" snapshot nor `config/current`
 * can be taken from the live config any more:
 *
 *  - The snapshot must be the config that was in force *at that period*. Writing
 *    today's config as `fromInvestorConfig` on a row that lands earliest in the
 *    trail would make it the timeline's baseline, silently restating every
 *    period before it — the opposite of what backdating one period should do.
 *  - `config/current` must stay whatever the latest-effective change set. A
 *    correction backdated to January cannot clobber terms that already took
 *    effect in May.
 *
 * Published reports the change invalidates are not touched here at all — that
 * staleness is derived on read, see `src/lib/reportStaleness.ts`.
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

  const history = await getEquityHistory(portfolioId)
  const priorConfig = resolveConfigForPeriod(
    currentConfig, buildConfigTimeline(history), effectiveFromPeriod,
  )
  // No recorded change takes effect later than this one → it sets the live terms.
  const latestRecorded = history.reduce(
    (max, h) => (h.effectiveFromPeriod ?? '') > max ? h.effectiveFromPeriod : max,
    '',
  )
  const governsLatestTerms = effectiveFromPeriod >= latestRecorded

  const batch = writeBatch(db)
  const configRef = doc(db, 'portfolios', portfolioId, 'config', 'current')
  if (governsLatestTerms) {
    const mergedConfig: PortfolioConfig = {
      ...currentConfig,
      investorConfig: newInvestorConfig,
      ...(newReturnModel ? { returnModel: newReturnModel } : {}),
    }
    batch.set(configRef, mergedConfig, { merge: true })
  } else {
    // A later change already owns investorConfig/returnModel. reportingFrequency
    // isn't period-versioned, so carry only that across.
    batch.set(configRef, { reportingFrequency: currentConfig.reportingFrequency }, { merge: true })
  }

  const historyRef = doc(collection(db, 'portfolios', portfolioId, 'equityHistory'))
  const entry: Omit<EquityChangeEntry, 'id' | 'changedAt'> & {
    changedAt: ReturnType<typeof serverTimestamp>
  } = {
    changedAt: serverTimestamp(),
    changedByUid,
    changedByName,
    fromInvestorPercent: priorConfig.investorConfig.investorSharePercent,
    toInvestorPercent: newInvestorConfig.investorSharePercent,
    fromArunamiPercent: priorConfig.investorConfig.arunamiFeePercent,
    toArunamiPercent: newInvestorConfig.arunamiFeePercent,
    reasonCategory: 'other',
    effectiveFromPeriod,
    changeKind,
    fromValue,
    toValue,
    // Before/after snapshots — these make the trail replayable, so reports for
    // periods before `effectiveFromPeriod` keep using the old terms.
    fromInvestorConfig: priorConfig.investorConfig,
    toInvestorConfig: newInvestorConfig,
    fromReturnModel: priorConfig.returnModel,
    toReturnModel: newReturnModel ?? currentConfig.returnModel,
    ...(reasonNote && reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
  }
  batch.set(historyRef, entry)

  await batch.commit()
}

/**
 * `equityHistory` for several portfolios at once, keyed by portfolio id. Feeds
 * `staleReportMap` on the pages that show accumulated and all-time reports,
 * which span every portfolio an investor holds.
 */
export async function getEquityHistoryForPortfolios(
  portfolioIds: string[],
): Promise<Record<string, EquityChangeEntry[]>> {
  const unique = [...new Set(portfolioIds)].filter(Boolean)
  const histories = await Promise.all(unique.map(id => getEquityHistory(id)))
  return Object.fromEntries(unique.map((id, i) => [id, histories[i]]))
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
  const normalized = normalizePeriod(report.period)
  // DF-02: upsert by (type, period). Re-uploading a period must REPLACE the
  // existing report, not add a second doc — syncFinancialData keys by period in
  // a Map, so a duplicate would silently drop one period's data. Only applies to
  // pnl/projection (the only types written here); others fall through to insert.
  if (report.type === 'pnl' || report.type === 'projection') {
    const existing = await getReports(portfolioId, report.type)
    const match = existing.find(r => normalizePeriod(r.period) === normalized)
    if (match) {
      await updateReport(portfolioId, match.id, { ...report, period: normalized })
      return match.id
    }
  }
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'reports'), {
    ...report,
    period: normalized,
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

// DF-15: deleteReport/deleteAllReports re-sync financialData themselves, so a
// report can never be removed while the aggregated snapshot still reflects it
// (previously every caller had to remember to call syncFinancialData).
export async function deleteReport(portfolioId: string, reportId: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'reports', reportId))
  await syncFinancialData(portfolioId)
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
  await syncFinancialData(portfolioId)
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

// ─── Meeting Recaps (internal, one per ISO week) ──────────────────────────

/**
 * Human-readable message for a failed Firestore call. A rules rejection is
 * called out by name — it is silent in the console once caught, and the usual
 * cause is a rules change that has not been deployed yet.
 */
export function firestoreErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code
  if (code === 'permission-denied') {
    return `${fallback}: akses ditolak aturan Firestore (jalankan "firebase deploy --only firestore:rules").`
  }
  return err instanceof Error ? `${fallback}: ${err.message}` : fallback
}

/** Weekly recaps for a portfolio, newest week first. Staff-only by rule. */
export async function getMeetingRecaps(portfolioId: string): Promise<MeetingRecap[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'meetingRecaps'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as MeetingRecap)
    .sort((a, b) => b.id.localeCompare(a.id))
}

/**
 * Upsert the recap of one ISO week. `weekKey` doubles as the doc id, so a
 * re-save replaces that week's recap; `createdAt` survives the overwrite.
 */
export async function saveMeetingRecap(
  portfolioId: string,
  weekKey: string,
  data: Omit<MeetingRecap, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const ref = doc(db, 'portfolios', portfolioId, 'meetingRecaps', weekKey)
  const existing = await getDoc(ref)
  await setDoc(ref, {
    ...data,
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return weekKey
}

export async function deleteMeetingRecap(portfolioId: string, weekKey: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'meetingRecaps', weekKey))
}

// ─── Milestones (per-portfolio governance) ────────────────────────────────

export async function getMilestones(portfolioId: string): Promise<Milestone[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'milestones'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Milestone)
}

export async function saveMilestone(portfolioId: string, data: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'milestones'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateMilestone(portfolioId: string, id: string, data: Partial<Omit<Milestone, 'id' | 'createdAt'>>) {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'milestones', id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMilestone(portfolioId: string, id: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'milestones', id))
}

// ─── Covenants (per-portfolio compliance) ─────────────────────────────────

export async function getCovenants(portfolioId: string): Promise<Covenant[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'covenants'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Covenant)
}

export async function saveCovenant(portfolioId: string, data: Omit<Covenant, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'covenants'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateCovenant(portfolioId: string, id: string, data: Partial<Omit<Covenant, 'id' | 'createdAt'>>) {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'covenants', id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCovenant(portfolioId: string, id: string) {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'covenants', id))
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
  /** Return-config versions, so each period uses the terms in force for it. */
  configTimeline: ConfigVersion[]
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
      const [config, configTimeline, portfolio, pnls, projs, mgmts, notes] = await Promise.all([
        getPortfolioConfigOrDefault(pid),
        getConfigTimeline(pid),
        getPortfolio(pid),
        getReports(pid, 'pnl'),
        getReports(pid, 'projection'),
        getManagementReports(pid),
        getNotes(pid),
      ])
      return {
        allocation,
        config,
        configTimeline,
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
  const [allocations, users] = await Promise.all([
    getAllocationsForPortfolio(portfolioId),
    getAllUsers(true),
  ])
  // DF-04: keep archived investors out of assignedInvestors so they don't retain
  // portfolio read access (security rules use this array) or get counted.
  const archived = new Set(users.filter(u => u.archived).map(u => u.uid))
  // DF-10: dedupe uids defensively so any legacy duplicate allocations can't
  // inflate assignedInvestors (and the counts/queries that read it).
  const activeUids = [...new Set(
    allocations.map(a => a.investorUid).filter(uid => !archived.has(uid)),
  )]
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    assignedInvestors: activeUids,
    slotsSummary: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// DF-03: a portfolio's allocations must not over-distribute (>100% ownership),
// which would pay out more than the profit pool. Validated at the data layer so
// no caller (or concurrent writer) can bypass it. Small epsilon for FP noise.
const OWNERSHIP_EPSILON = 0.01

function assertOwnershipWithinLimit(
  newPercent: number | undefined,
  allocations: InvestorAllocation[],
  excludeAllocationId?: string,
) {
  if (newPercent == null) return
  const othersSum = allocations
    .filter(a => a.id !== excludeAllocationId)
    .reduce((s, a) => s + (a.ownershipPercent ?? 0), 0)
  if (othersSum + newPercent > 100 + OWNERSHIP_EPSILON) {
    const remaining = Math.max(0, 100 - othersSum)
    throw new Error(
      `Total kepemilikan akan melebihi 100% (saat ini ${othersSum.toFixed(2)}% terpakai, tersisa ${remaining.toFixed(2)}%).`,
    )
  }
}

export async function createAllocation(
  data: Omit<InvestorAllocation, 'id' | 'joinedAt' | 'updatedAt'>,
) {
  const existing = await getAllocationsForPortfolio(data.portfolioId)
  // DF-10: one allocation per (investor × portfolio). Guard at the data layer so
  // no caller — or concurrent writer — can create a duplicate that double-counts
  // invested amount, ownership %, and earnings.
  if (existing.some(a => a.investorUid === data.investorUid)) {
    throw new Error('Investor ini sudah memiliki alokasi di portofolio ini.')
  }
  assertOwnershipWithinLimit(data.ownershipPercent, existing)
  // Deterministic id closes the create-create race: two concurrent creates for
  // the same pair target one doc id instead of producing two docs.
  const id = `${data.portfolioId}_${data.investorUid}`
  await setDoc(doc(db, 'investorAllocations', id), {
    ...data,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await refreshPortfolioInvestors(data.portfolioId)
  return id
}

export async function updateAllocation(
  allocationId: string,
  data: Partial<Pick<InvestorAllocation, 'investedAmount' | 'ownershipPercent'>>,
  portfolioId: string,
) {
  const existing = await getAllocationsForPortfolio(portfolioId)
  assertOwnershipWithinLimit(data.ownershipPercent, existing, allocationId)
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

  // Sort reports by period for chronological order (YYYY-MM sorts correctly).
  // DF-02: tiebreak equal periods by createdAt so the Map "last writer" is
  // deterministic for any legacy duplicate-period docs (newest wins).
  const sortByPeriod = (a: PortfolioReport, b: PortfolioReport) => {
    const cmp = comparePeriods(a.period, b.period)
    if (cmp !== 0) return cmp
    return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
  }
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

/**
 * Every per-investor report (draft + published, all periods) nested under a
 * portfolio — powers the analyst Engagement view. Reads the nested subcollection
 * (staff-readable) rather than the top-level mirror, which analysts can't list.
 */
export async function getAllInvestorReportsForPortfolio(
  portfolioId: string,
): Promise<InvestorReportDoc[]> {
  const snap = await getDocs(collection(db, 'portfolios', portfolioId, 'investorReports'))
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
 * Flip a report to read for its owning investor. Field-scoped write (only
 * isRead/readAt) so the investor-side firestore rule can permit it without
 * exposing the rest of the report doc to investor edits. Idempotent.
 */
export async function markInvestorReportRead(reportId: string): Promise<void> {
  await setDoc(
    doc(db, 'investorReports', reportId),
    { isRead: true, readAt: serverTimestamp() },
    { merge: true },
  )
}

/** Mark several reports read in one batch (powers "Tandai semua dibaca"). */
export async function markInvestorReportsRead(reportIds: string[]): Promise<void> {
  if (reportIds.length === 0) return
  const batch = writeBatch(db)
  for (const id of reportIds) {
    batch.set(
      doc(db, 'investorReports', id),
      { isRead: true, readAt: serverTimestamp() },
      { merge: true },
    )
  }
  await batch.commit()
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
    // A new/revised draft is content the investor hasn't seen → mark unread.
    isRead: false,
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
  // DF-09: set(merge) instead of update() — tolerant of a missing mirror doc so
  // one absent copy can't reject the whole batch and block the live one.
  const batch = writeBatch(db)
  batch.set(doc(db, 'portfolios', params.portfolioId, 'investorReports', params.reportId), payload, { merge: true })
  batch.set(doc(db, 'investorReports', params.reportId), payload, { merge: true })
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
  // DF-09: set(merge) so a missing mirror can't block unpublishing the live copy.
  const batch = writeBatch(db)
  batch.set(doc(db, 'portfolios', params.portfolioId, 'investorReports', params.reportId), payload, { merge: true })
  batch.set(doc(db, 'investorReports', params.reportId), payload, { merge: true })
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
    // DF-09: set(merge) tolerant of a missing mirror doc.
    batch.set(doc(db, 'portfolios', params.portfolioId, 'investorReports', r.id), payload, { merge: true })
    batch.set(doc(db, 'investorReports', r.id), payload, { merge: true })
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
      // Freshly (re)published content re-alerts the investor as unread.
      isRead: false,
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
  // DF-09: set(merge) so unpublish doesn't throw if the doc is unexpectedly absent.
  await setDoc(doc(db, 'investorReports', id), {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
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
      // Freshly (re)published content re-alerts the investor as unread.
      isRead: false,
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
  // DF-09: set(merge) so unpublish doesn't throw if the doc is unexpectedly absent.
  await setDoc(doc(db, 'investorReports', id), {
    status: 'draft' as const,
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// ─── Bukti Transfer + Investor Notifications ─────────────────────────────
//
// IR uploads a screenshot → writes a doc in `investorTransferProofs` →
// mirrors a doc into `investorNotifications` (cleared=false). Investor
// dashboard shows a banner for uncleared ones; cleared ones remain
// in the collection so the History tab can render the income trail.

const ALLOWED_PROOF_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
const MAX_PROOF_BYTES = 5 * 1024 * 1024

function extOf(mime: string, name: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/pdf') return 'pdf'
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
}

// Shared upload + batch-write for both report-linked and standalone proofs:
// uploads the file to Storage, writes the `investorTransferProofs` doc, and
// mirrors an `investorNotifications` doc so the investor gets a banner.
interface ProofWriteParams {
  investorUid: string
  investorName: string
  investorReportId: string | null
  portfolioId: string | null
  portfolioName: string
  period: string
  amount: number
  principalAmount?: number | null
  notes: string
  file: File
  uploadedBy: string
  uploadedByName: string
  message: string
  /** Storage folder segment under the investor (e.g. the report id or "standalone"). */
  pathSegment: string
  docId: string
}

/**
 * Validate + upload a proof file (PDF/image) to Storage under the investor's
 * folder and return its download URL + storage path. Shared by transfer proofs
 * and backfilled bagi-hasil manual entries. `pathSegment` separates the use
 * (e.g. a report id, "standalone", or "manual").
 */
async function uploadProofToStorage(
  investorUid: string,
  pathSegment: string,
  file: File,
): Promise<{ fileUrl: string; storagePath: string }> {
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    throw new Error('Tipe file tidak didukung. Gunakan PNG, JPG, WEBP, atau PDF.')
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error('Ukuran file melebihi 5 MB.')
  }
  const ext = extOf(file.type, file.name)
  const path = `transferProofs/${investorUid}/${pathSegment}/${Date.now()}.${ext}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, file, { contentType: file.type })
  const fileUrl = await getDownloadURL(ref)
  return { fileUrl, storagePath: path }
}

async function writeTransferProof(
  p: ProofWriteParams,
): Promise<{ proofId: string; fileUrl: string }> {
  if (!(p.amount > 0)) {
    throw new Error('Nominal transfer harus lebih dari 0.')
  }

  const { fileUrl, storagePath: path } = await uploadProofToStorage(p.investorUid, p.pathSegment, p.file)

  const proofData: Omit<InvestorTransferProof, 'id' | 'createdAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>
  } = {
    investorUid: p.investorUid,
    investorName: p.investorName,
    investorReportId: p.investorReportId,
    portfolioId: p.portfolioId,
    portfolioName: p.portfolioName,
    period: p.period,
    amount: p.amount,
    principalAmount: p.principalAmount ?? null,
    fileUrl,
    fileName: p.file.name,
    storagePath: path,
    notes: p.notes.trim(),
    uploadedBy: p.uploadedBy,
    uploadedByName: p.uploadedByName,
    createdAt: serverTimestamp(),
  }

  const batch = writeBatch(db)
  batch.set(doc(db, 'investorTransferProofs', p.docId), proofData)
  batch.set(doc(db, 'investorNotifications', `notif_${p.docId}`), {
    investorUid: p.investorUid,
    type: 'transfer_proof',
    transferProofId: p.docId,
    investorReportId: p.investorReportId,
    portfolioName: p.portfolioName,
    period: p.period,
    amount: p.amount,
    // DF-13: mirror principal so the notification carries the full payout detail.
    principalAmount: p.principalAmount ?? null,
    fileUrl,
    fileName: p.file.name,
    message: p.message,
    cleared: false,
    createdAt: serverTimestamp(),
  })
  // DF-12: if the doc write fails, the file is already in Storage — best-effort
  // delete it so we don't leak an orphan with no doc referencing it.
  try {
    await batch.commit()
  } catch (e) {
    try { await deleteObject(storageRef(storage, path)) } catch { /* noop */ }
    throw e
  }

  return { proofId: p.docId, fileUrl }
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
  const report = input.investorReport
  const safeReportId = report.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return writeTransferProof({
    investorUid: input.investorUid,
    investorName: input.investorName,
    investorReportId: report.id,
    portfolioId: report.portfolioId === '__accumulated__' ? null : report.portfolioId,
    portfolioName: report.portfolioName,
    period: report.period,
    amount: input.amount,
    principalAmount: input.principalAmount,
    notes: input.notes,
    file: input.file,
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName,
    message: buildProofMessage(input),
    pathSegment: safeReportId,
    docId: `${report.id}_${Date.now()}`,
  })
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

// ─── Standalone transfer proof (no published report) ──────────────────────
//
// IR sends a proof for a portfolio that has no analyst data / published report
// yet, but a real bagi hasil was paid. Decoupled from investorReports:
// investorReportId is null and portfolio + period come straight from IR's input.

export interface CreateStandaloneProofInput {
  investorUid: string
  investorName: string
  portfolioId: string
  portfolioName: string
  /** "YYYY-MM". */
  period: string
  amount: number
  principalAmount?: number | null
  notes: string
  file: File
  uploadedBy: string
  uploadedByName: string
}

export async function createStandaloneTransferProof(
  input: CreateStandaloneProofInput,
): Promise<{ proofId: string; fileUrl: string }> {
  const formatted = `Rp ${input.amount.toLocaleString('id-ID')}`
  return writeTransferProof({
    investorUid: input.investorUid,
    investorName: input.investorName,
    investorReportId: null,
    portfolioId: input.portfolioId,
    portfolioName: input.portfolioName,
    period: input.period,
    amount: input.amount,
    principalAmount: input.principalAmount,
    notes: input.notes,
    file: input.file,
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName,
    message: `Bukti transfer ${formatted} untuk laporan ${input.portfolioName} telah dikirim.`,
    pathSegment: 'standalone',
    docId: `standalone_${Date.now()}`,
  })
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
  // DF-05: delete the Firestore docs FIRST. If this is rejected (e.g. by rules)
  // it throws before we touch Storage, so we never orphan a live doc by
  // destroying its file. Storage cleanup is best-effort afterwards.
  const batch = writeBatch(db)
  batch.delete(doc(db, 'investorTransferProofs', proof.id))
  const notifSnap = await getDocs(query(
    collection(db, 'investorNotifications'),
    where('transferProofId', '==', proof.id),
  ))
  notifSnap.forEach(d => batch.delete(d.ref))
  await batch.commit()

  // Best-effort storage cleanup; ignore missing files.
  try { await deleteObject(storageRef(storage, proof.storagePath)) } catch { /* noop */ }
}

export async function getNotificationsForInvestor(
  investorUid: string,
): Promise<InvestorNotification[]> {
  // DF-14: filter by investorUid only and sort in JS (matches the rest of this
  // file). The previous where+orderBy needed a composite index; if it were
  // missing, the query threw and the hook silently showed the investor Rp 0 with
  // no payment history. A single-field where needs no composite index.
  const q = query(
    collection(db, 'investorNotifications'),
    where('investorUid', '==', investorUid),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as InvestorNotification)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
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
  /** Proof file (PDF/image) for the backfilled payout — required (DF-01). */
  file: File
  createdBy: string
  createdByName: string
}

export async function createBagiHasilManualEntry(
  input: CreateBagiHasilManualEntryInput,
): Promise<string> {
  const { file, ...rest } = input
  const { fileUrl, storagePath } = await uploadProofToStorage(input.investorUid, 'manual', file)
  // DF-12: clean up the just-uploaded file if the doc write fails.
  try {
    const ref = await addDoc(collection(db, 'bagiHasilManualEntries'), {
      ...rest,
      fileUrl,
      fileName: file.name,
      storagePath,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (e) {
    try { await deleteObject(storageRef(storage, storagePath)) } catch { /* noop */ }
    throw e
  }
}

export async function updateBagiHasilManualEntry(
  id: string,
  patch: Partial<Pick<BagiHasilManualEntry, 'period' | 'bagiHasilAmount' | 'principalAmount' | 'notes'>>,
  /** When provided, replaces the proof file. The previous file is deleted. */
  opts?: { file?: File; investorUid: string; oldStoragePath?: string },
): Promise<void> {
  let fileFields: Partial<Pick<BagiHasilManualEntry, 'fileUrl' | 'fileName' | 'storagePath'>> = {}
  let newStoragePath: string | undefined
  if (opts?.file) {
    const { fileUrl, storagePath } = await uploadProofToStorage(opts.investorUid, 'manual', opts.file)
    fileFields = { fileUrl, fileName: opts.file.name, storagePath }
    newStoragePath = storagePath
  }
  try {
    await updateDoc(doc(db, 'bagiHasilManualEntries', id), { ...patch, ...fileFields })
  } catch (e) {
    // DF-12: the doc update failed — delete the freshly-uploaded replacement so
    // it doesn't orphan (the old file is still the live reference).
    if (newStoragePath) {
      try { await deleteObject(storageRef(storage, newStoragePath)) } catch { /* noop */ }
    }
    throw e
  }
  // Best-effort cleanup of the replaced file, after the doc no longer points at it.
  if (opts?.file && opts.oldStoragePath) {
    try { await deleteObject(storageRef(storage, opts.oldStoragePath)) } catch { /* noop */ }
  }
}

export async function deleteBagiHasilManualEntry(
  id: string,
  storagePath?: string,
): Promise<void> {
  await deleteDoc(doc(db, 'bagiHasilManualEntries', id))
  // Best-effort storage cleanup; ignore missing/legacy entries without a file.
  if (storagePath) {
    try { await deleteObject(storageRef(storage, storagePath)) } catch { /* noop */ }
  }
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

// ─── Admin Data Override Audit Log ────────────────────────────────────────

export interface RecordAdminOverrideInput {
  scope: AdminOverrideScope
  targetId: string
  targetLabel: string
  section: string
  summary: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  reasonNote: string
  changedByUid: string
  changedByName: string
}

/**
 * Append an immutable entry to /adminOverrides recording a manual admin
 * correction (who/what/when/why + before/after snapshot). Called by the admin
 * override pages AFTER the underlying write succeeds, so a failed write never
 * leaves a misleading log entry. Never throws into the caller's save path on its
 * own — callers should await it and surface failures, but the data write is the
 * source of truth.
 */
export async function recordAdminOverride(input: RecordAdminOverrideInput): Promise<string> {
  const ref = await addDoc(collection(db, 'adminOverrides'), {
    ...input,
    changedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAdminOverridesForTarget(
  scope: AdminOverrideScope,
  targetId: string,
): Promise<AdminOverrideLog[]> {
  const snap = await getDocs(query(
    collection(db, 'adminOverrides'),
    where('scope', '==', scope),
    where('targetId', '==', targetId),
  ))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as AdminOverrideLog)
    .sort((a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0))
}

/**
 * Full override trail across every target, newest first — powers the admin
 * audit-log viewer. Admin-only (see firestore.rules: /adminOverrides allows
 * read/list only to admins). The collection holds one entry per manual admin
 * correction, so an unfiltered read is intentional here.
 */
export async function getAllAdminOverrides(): Promise<AdminOverrideLog[]> {
  const snap = await getDocs(collection(db, 'adminOverrides'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as AdminOverrideLog)
    .sort((a, b) => (b.changedAt?.seconds ?? 0) - (a.changedAt?.seconds ?? 0))
}

// ─── Health / Wanprestasi (Siaga) ─────────────────────────────────────────
//
// Global thresholds live in a single admin-owned doc /appConfig/health. The
// derived per-portfolio level is denormalized onto the portfolio doc (see
// updatePortfolioHealth) so list views read a cheap `healthLevel` field.

export async function getHealthRules(): Promise<HealthRules> {
  const snap = await getDoc(doc(db, 'appConfig', 'health'))
  if (!snap.exists()) return DEFAULT_HEALTH_RULES
  return { ...DEFAULT_HEALTH_RULES, ...(snap.data() as Partial<HealthRules>) }
}

export async function saveHealthRules(
  rules: Pick<HealthRules, 'latenessDays' | 'silenceDays' | 'underTargetMonths'>,
  updatedBy: string,
): Promise<void> {
  await setDoc(
    doc(db, 'appConfig', 'health'),
    { ...rules, updatedBy, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/**
 * Persist the analyst's manual wanprestasi inputs plus the freshly derived
 * level/reasons onto the portfolio. Kept out of the typed `updatePortfolio`
 * path so `serverTimestamp()` doesn't fight the `Partial<Portfolio>` types.
 */
export async function updatePortfolioHealth(
  portfolioId: string,
  fields: {
    latenessDays: number
    lastContactDate: string
    healthLevel: HealthLevel
    healthReasons: string[]
  },
): Promise<void> {
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    ...fields,
    healthComputedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ─── KYC Verification (Phase 6) ───────────────────────────────────────────
//
// KYC state lives on the investor's user doc (admin-only write per firestore
// rules). Documents upload to Storage under kyc/<uid>/; only metadata persists.

const ALLOWED_KYC_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
const MAX_KYC_BYTES = 8 * 1024 * 1024

/** Upload one KYC document and return its metadata (does not write the user doc). */
export async function uploadKycDocument(
  uid: string,
  slot: KycDocSlot,
  file: File,
): Promise<KycDocument> {
  if (!ALLOWED_KYC_TYPES.includes(file.type)) {
    throw new Error('Tipe file tidak didukung. Gunakan PNG, JPG, WEBP, atau PDF.')
  }
  if (file.size > MAX_KYC_BYTES) {
    throw new Error('Ukuran file melebihi 8 MB.')
  }
  const ext = extOf(file.type, file.name)
  const path = `kyc/${uid}/${slot}-${Date.now()}.${ext}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, file, { contentType: file.type })
  const fileUrl = await getDownloadURL(ref)
  return {
    slot,
    fileName: file.name,
    fileUrl,
    storagePath: path,
    // Firestore forbids serverTimestamp() inside array elements — use a client
    // Timestamp (this is embedded in the kycDocuments array, not a doc field).
    uploadedAt: Timestamp.now(),
  }
}

export interface SaveKycReviewInput {
  uid: string
  status: KycStatus
  investorType?: InvestorType
  npwp?: string
  documents: KycDocument[]
  reviewedBy: string
  reviewedByName: string
  rejectionReason?: string
}

/** Persist a KYC review (status + type + docs) onto the investor's user doc. */
export async function saveKycReview(input: SaveKycReviewInput): Promise<void> {
  const patch: Record<string, unknown> = {
    kycStatus: input.status,
    kycDocuments: input.documents,
    kycReviewedBy: input.reviewedBy,
    kycReviewedByName: input.reviewedByName,
    kycReviewedAt: serverTimestamp(),
  }
  patch.investorType = input.investorType ?? deleteField()
  patch.npwp = input.npwp?.trim() ? input.npwp.trim() : deleteField()
  patch.kycRejectionReason =
    input.status === 'rejected' && input.rejectionReason?.trim()
      ? input.rejectionReason.trim()
      : deleteField()
  await updateDoc(doc(db, 'users', input.uid), patch)
}

// ─── Announcements (Phase 6) ──────────────────────────────────────────────

export async function getAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(collection(db, 'announcements'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as Announcement)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export async function saveAnnouncement(
  data: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'announcements'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, 'title' | 'body' | 'audience' | 'active'>>,
): Promise<void> {
  await updateDoc(doc(db, 'announcements', id), { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, 'announcements', id))
}

// ─── Documents Library (Phase 6) ──────────────────────────────────────────

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

export async function getAllDocuments(): Promise<LibraryDocument[]> {
  const snap = await getDocs(collection(db, 'documents'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as LibraryDocument)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export interface UploadDocumentInput {
  portfolioId: string | null
  portfolioName: string
  title: string
  category: DocumentCategory
  version: string
  file: File
  uploadedBy: string
  uploadedByName: string
}

export async function uploadDocument(input: UploadDocumentInput): Promise<string> {
  if (input.file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Ukuran file melebihi 20 MB.')
  }
  const safeSegment = (input.portfolioId ?? 'platform').replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = `documents/${safeSegment}/${Date.now()}-${input.file.name}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, input.file, { contentType: input.file.type })
  const fileUrl = await getDownloadURL(ref)
  try {
    const docRef = await addDoc(collection(db, 'documents'), {
      portfolioId: input.portfolioId,
      portfolioName: input.portfolioName,
      title: input.title.trim(),
      category: input.category,
      fileName: input.file.name,
      fileUrl,
      storagePath: path,
      fileSize: input.file.size,
      version: input.version.trim(),
      uploadedBy: input.uploadedBy,
      uploadedByName: input.uploadedByName,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (e) {
    // DF-12 pattern: clean up the just-uploaded file if the doc write fails.
    try { await deleteObject(storageRef(storage, path)) } catch { /* noop */ }
    throw e
  }
}

export async function deleteDocument(docRow: LibraryDocument): Promise<void> {
  await deleteDoc(doc(db, 'documents', docRow.id))
  if (docRow.storagePath) {
    try { await deleteObject(storageRef(storage, docRow.storagePath)) } catch { /* noop */ }
  }
}

/**
 * Documents an investor may read: those attached to portfolios they hold.
 * Queried by `portfolioId in [...]` (Firestore caps `in` at 30 ids, so chunk).
 * Returns newest-first. Platform-wide (portfolioId === null) docs are not
 * surfaced to investors.
 */
export async function getDocumentsForPortfolios(portfolioIds: string[]): Promise<LibraryDocument[]> {
  if (portfolioIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < portfolioIds.length; i += 30) chunks.push(portfolioIds.slice(i, i + 30))
  const results = await Promise.all(
    chunks.map(async ids => {
      const snap = await getDocs(query(collection(db, 'documents'), where('portfolioId', 'in', ids)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as LibraryDocument)
    }),
  )
  return results.flat().sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

// ─── System Settings (Phase 6) ────────────────────────────────────────────

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  brandName: 'ARUNAMI',
  supportEmail: '',
  requireKycForAllocation: false,
  allowInvestorSelfRegister: false,
  maintenanceMode: false,
  defaultArunamiFeePercent: 10,
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const snap = await getDoc(doc(db, 'appConfig', 'system'))
  if (!snap.exists()) return DEFAULT_SYSTEM_SETTINGS
  return { ...DEFAULT_SYSTEM_SETTINGS, ...(snap.data() as Partial<SystemSettings>) }
}

export async function saveSystemSettings(
  settings: Omit<SystemSettings, 'updatedAt' | 'updatedBy'>,
  updatedBy: string,
): Promise<void> {
  await setDoc(
    doc(db, 'appConfig', 'system'),
    { ...settings, updatedBy, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

// ─── Distribution Batches (Phase 6, payout state machine) ─────────────────

/** Derive batch-level status from its lines. */
export function deriveBatchStatus(lines: DistributionBatchLine[]): BatchStatus {
  if (lines.length === 0) return 'draft'
  if (lines.every(l => l.status === 'forwarded' || l.status === 'held')) return 'completed'
  if (lines.some(l => l.status !== 'pending')) return 'processing'
  return 'draft'
}

export async function getDistributionBatches(): Promise<DistributionBatch[]> {
  const snap = await getDocs(collection(db, 'distributionBatches'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as DistributionBatch)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

export interface CreateDistributionBatchInput {
  portfolioId: string
  portfolioName: string
  period: string
  returnModelLabel: string
  driverAmount: number
  lines: DistributionBatchLine[]
  createdBy: string
  createdByName: string
}

export async function createDistributionBatch(
  input: CreateDistributionBatchInput,
): Promise<string> {
  // One batch per (portfolio × period): deterministic id blocks duplicates.
  const id = `${input.portfolioId}_${input.period}`
  const existing = await getDoc(doc(db, 'distributionBatches', id))
  if (existing.exists()) {
    throw new Error(`Batch untuk periode ${input.period} sudah ada.`)
  }
  const totalNet = input.lines.reduce((s, l) => s + l.netAmount, 0)
  await setDoc(doc(db, 'distributionBatches', id), {
    portfolioId: input.portfolioId,
    portfolioName: input.portfolioName,
    period: input.period,
    returnModelLabel: input.returnModelLabel,
    driverAmount: input.driverAmount,
    totalNet,
    status: 'draft' as BatchStatus,
    lines: input.lines,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return id
}

/** Replace a batch's lines (used when advancing/holding a line) and re-derive status. */
export async function updateDistributionBatchLines(
  batchId: string,
  lines: DistributionBatchLine[],
): Promise<void> {
  await updateDoc(doc(db, 'distributionBatches', batchId), {
    lines,
    totalNet: lines.reduce((s, l) => s + l.netAmount, 0),
    status: deriveBatchStatus(lines),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDistributionBatch(batchId: string): Promise<void> {
  await deleteDoc(doc(db, 'distributionBatches', batchId))
}
