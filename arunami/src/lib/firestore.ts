import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, secondaryAuth, db } from './firebase'
import type {
  AppUser, Portfolio, FinancialData, PortfolioReport,
  ManagementReport, Note, TransferProof,
} from '@/types'

// ─── Users ────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { ...snap.data(), uid: snap.id } as AppUser : null
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => d.data() as AppUser)
}

export async function createUser(
  email: string,
  password: string,
  displayName: string,
  role: AppUser['role'],
  createdBy: string,
) {
  // Use secondaryAuth so the admin's session on the primary auth is not replaced
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  await signOut(secondaryAuth)
  const user: Omit<AppUser, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    uid: cred.user.uid,
    email,
    displayName,
    role,
    createdBy,
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'users', cred.user.uid), user)
  return cred.user
}

export async function updateUser(uid: string, data: Partial<Pick<AppUser, 'displayName' | 'role'>>) {
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

export async function saveReport(portfolioId: string, report: Omit<PortfolioReport, 'id'>) {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'reports'), {
    ...report,
    createdAt: serverTimestamp(),
  })
  return ref.id
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
