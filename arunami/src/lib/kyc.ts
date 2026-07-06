import type { KycStatus, KycDocSlot } from '@/types'

// Presentation + small helpers for the Phase-6 investor KYC flow. The status
// lives on the investor's user doc; an investor must be `verified` before the
// allocation editor will let an admin add them to a cap table.

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  unverified: 'Belum Verifikasi',
  pending: 'Menunggu Review',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
}

/** Tailwind classes for a status pill, keyed by KYC status. */
export const KYC_STATUS_CLASSES: Record<KycStatus, string> = {
  unverified: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export const KYC_DOC_LABELS: Record<KycDocSlot, string> = {
  ktp: 'KTP',
  npwp: 'NPWP',
  bank: 'Rekening Bank',
}

export const KYC_DOC_SLOTS: KycDocSlot[] = ['ktp', 'npwp', 'bank']

/** Normalize an absent status to 'unverified' (backwards-compatible). */
export function kycStatusOf(status: KycStatus | undefined): KycStatus {
  return status ?? 'unverified'
}

/** Whether an investor may be selected into a cap table given the KYC gate. */
export function isKycEligible(status: KycStatus | undefined): boolean {
  return kycStatusOf(status) === 'verified'
}
