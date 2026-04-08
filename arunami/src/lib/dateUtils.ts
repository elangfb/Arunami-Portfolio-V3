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
