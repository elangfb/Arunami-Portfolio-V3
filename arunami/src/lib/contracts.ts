// Contract expiry / renewal helpers (Phase 2). Pure date math — no I/O.

export type ContractSeverity = 'aman' | 'segera' | 'kritis' | 'unknown'

/** Thresholds (days remaining) that split Aman / Segera / Kritis. */
export const CONTRACT_SEGERA_DAYS = 180
export const CONTRACT_KRITIS_DAYS = 90

export const CONTRACT_LABELS: Record<ContractSeverity, string> = {
  aman: 'Aman',
  segera: 'Segera',
  kritis: 'Kritis',
  unknown: 'Tanpa Kontrak',
}

/** Badge colour classes per severity — mirrors the HealthBadge palette. */
export const CONTRACT_BADGE_CLASSES: Record<ContractSeverity, string> = {
  aman: 'bg-green-100 text-green-800',
  segera: 'bg-yellow-100 text-yellow-800',
  kritis: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-600',
}

export interface ContractStatus {
  severity: ContractSeverity
  /** Days until expiry; negative when already expired; null when no end date. */
  daysRemaining: number | null
  /** Fraction of the contract elapsed [0,1]; null when start/end missing. */
  elapsedFraction: number | null
}

const MS_PER_DAY = 86_400_000

/**
 * Classify a contract by how close it is to expiry:
 * Kritis (< 90 days or expired) · Segera (< 180) · Aman (≥ 180) · unknown (no end).
 */
export function contractStatus(start?: string, end?: string, now?: Date): ContractStatus {
  if (!end) return { severity: 'unknown', daysRemaining: null, elapsedFraction: null }
  const endDate = new Date(end)
  if (isNaN(endDate.getTime())) return { severity: 'unknown', daysRemaining: null, elapsedFraction: null }

  const today = now ?? new Date()
  const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / MS_PER_DAY)

  let severity: ContractSeverity
  if (daysRemaining < CONTRACT_KRITIS_DAYS) severity = 'kritis'
  else if (daysRemaining < CONTRACT_SEGERA_DAYS) severity = 'segera'
  else severity = 'aman'

  let elapsedFraction: number | null = null
  if (start) {
    const startDate = new Date(start)
    if (!isNaN(startDate.getTime()) && endDate.getTime() > startDate.getTime()) {
      elapsedFraction = Math.min(
        1,
        Math.max(0, (today.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())),
      )
    }
  }

  return { severity, daysRemaining, elapsedFraction }
}

/** Human-friendly days-remaining phrase (Indonesian). */
export function daysRemainingLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return '—'
  if (daysRemaining < 0) return `Kadaluarsa ${Math.abs(daysRemaining)} hari lalu`
  if (daysRemaining === 0) return 'Berakhir hari ini'
  return `${daysRemaining} hari lagi`
}
