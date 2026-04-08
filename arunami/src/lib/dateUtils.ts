// Standardized date utilities for period handling.
// Internal format: "YYYY-MM" (e.g., "2026-04")
// Display format: "April 2026" (Indonesian month names)

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

export const MONTH_OPTIONS = INDONESIAN_MONTHS.map((name, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: name,
}))

/** "2026-04" → "April 2026" */
export function formatPeriod(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})$/)
  if (!match) return period // fallback for legacy data
  const [, year, month] = match
  const idx = parseInt(month, 10) - 1
  if (idx < 0 || idx > 11) return period
  return `${INDONESIAN_MONTHS[idx]} ${year}`
}

/** Build "YYYY-MM" from separate month/year values */
export function buildPeriodKey(month: string, year: string): string {
  return `${year}-${month.padStart(2, '0')}`
}

/** Parse month and year from a "YYYY-MM" string */
export function parsePeriodKey(period: string): { month: string; year: string } | null {
  if (!period) return null
  const match = period.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  return { year: match[1], month: match[2] }
}

// Mapping for normalizing legacy free-text periods
const MONTH_NAME_MAP: Record<string, string> = {
  // Indonesian
  januari: '01', februari: '02', maret: '03', april: '04',
  mei: '05', juni: '06', juli: '07', agustus: '08',
  september: '09', oktober: '10', november: '11', desember: '12',
  // English
  january: '01', february: '02', march: '03',
  may: '05', june: '06', july: '07', august: '08',
  october: '10', december: '12',
  // Abbreviated
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09',
  oct: '10', nov: '11', dec: '12',
}

/**
 * Normalize any legacy period string to "YYYY-MM".
 * Handles: "April 2026", "Apr 2026", "Maret 2026", "2026-04", etc.
 */
export function normalizePeriod(period: string): string {
  // Already in YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(period)) return period

  // Try "MonthName YYYY" pattern
  const match = period.trim().match(/^([a-zA-Z]+)\s+(\d{4})$/i)
  if (match) {
    const monthKey = match[1].toLowerCase()
    const mm = MONTH_NAME_MAP[monthKey]
    if (mm) return `${match[2]}-${mm}`
  }

  return period // can't parse, return as-is
}

/** Sort comparator for "YYYY-MM" period strings (chronological) */
export function comparePeriods(a: string, b: string): number {
  return a.localeCompare(b) // YYYY-MM sorts correctly with string comparison
}

// ─── Period Grouping Helpers ────────────────────────────────────────────

import type { PeriodType } from '@/store/reportFilterStore'

const QUARTER_LABELS = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Okt-Des'] as const

/** Get quarter number (1-4) from a month string "01"-"12" */
export function getQuarterFromMonth(month: string): number {
  return Math.ceil(parseInt(month, 10) / 3)
}

/** Build quarter key like "2026-Q1" */
export function buildQuarterKey(year: string, quarter: number): string {
  return `${year}-Q${quarter}`
}

/**
 * Given a list of YYYY-MM periods, return grouped options for each period type.
 * All lists are sorted descending (most recent first).
 */
export function extractAvailablePeriods(allPeriods: string[]): {
  monthly: { value: string; label: string }[]
  quarterly: { value: string; label: string }[]
  yearly: { value: string; label: string }[]
} {
  const unique = [...new Set(allPeriods)].sort((a, b) => b.localeCompare(a))

  const monthly = unique.map((p) => ({ value: p, label: formatPeriod(p) }))

  const quarterSet = new Set<string>()
  for (const p of unique) {
    const parsed = parsePeriodKey(p)
    if (parsed) {
      const q = getQuarterFromMonth(parsed.month)
      quarterSet.add(buildQuarterKey(parsed.year, q))
    }
  }
  const quarterly = [...quarterSet]
    .sort((a, b) => b.localeCompare(a))
    .map((qk) => {
      const [year, qPart] = qk.split('-')
      const qNum = parseInt(qPart.replace('Q', ''), 10)
      return { value: qk, label: `Q${qNum} ${year} (${QUARTER_LABELS[qNum - 1]})` }
    })

  const yearSet = new Set<string>()
  for (const p of unique) {
    const parsed = parsePeriodKey(p)
    if (parsed) yearSet.add(parsed.year)
  }
  const yearly = [...yearSet]
    .sort((a, b) => b.localeCompare(a))
    .map((y) => ({ value: y, label: y }))

  return { monthly, quarterly, yearly }
}

/**
 * Returns the list of YYYY-MM months covered by a period selection.
 * For "all", pass all available months.
 */
export function getMonthsForPeriod(
  periodType: PeriodType,
  selectedPeriod: string,
  allAvailableMonths?: string[],
): string[] {
  switch (periodType) {
    case 'monthly':
      return [selectedPeriod]
    case 'quarterly': {
      const match = selectedPeriod.match(/^(\d{4})-Q(\d)$/)
      if (!match) return []
      const [, year, q] = match
      const startMonth = (parseInt(q, 10) - 1) * 3 + 1
      return [0, 1, 2].map(
        (offset) => `${year}-${String(startMonth + offset).padStart(2, '0')}`,
      )
    }
    case 'yearly': {
      return Array.from({ length: 12 }, (_, i) =>
        `${selectedPeriod}-${String(i + 1).padStart(2, '0')}`,
      )
    }
    case 'all':
      return allAvailableMonths ?? []
  }
}

/** Format a period selection for display labels */
export function formatPeriodLabel(periodType: PeriodType, selectedPeriod: string): string {
  switch (periodType) {
    case 'monthly':
      return formatPeriod(selectedPeriod)
    case 'quarterly': {
      const match = selectedPeriod.match(/^(\d{4})-Q(\d)$/)
      if (!match) return selectedPeriod
      const [, year, q] = match
      const qNum = parseInt(q, 10)
      return `Q${qNum} ${year} (${QUARTER_LABELS[qNum - 1]})`
    }
    case 'yearly':
      return selectedPeriod
    case 'all':
      return 'Seluruh Periode'
  }
}
