import { daysSince, formatDaysAgo } from '@/lib/dateUtils'
import type { HealthLevel, HealthRules, HealthThreshold, MonthlyDataPoint } from '@/types'

// ─── Defaults & metadata ──────────────────────────────────────────────────

/** Sensible starting thresholds; used when no /appConfig/health doc exists. */
export const DEFAULT_HEALTH_RULES: HealthRules = {
  latenessDays: { siaga3: 7, siaga2: 14, siaga1: 30 },
  silenceDays: { siaga3: 30, siaga2: 60, siaga1: 90 },
  underTargetMonths: { siaga3: 1, siaga2: 2, siaga1: 3 },
}

/** Severity ordering — higher = worse. */
const LEVEL_RANK: Record<HealthLevel, number> = {
  sehat: 0, siaga_3: 1, siaga_2: 2, siaga_1: 3,
}

export function healthLevelRank(level: HealthLevel): number {
  return LEVEL_RANK[level]
}

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  sehat: 'Sehat',
  siaga_3: 'Siaga 3',
  siaga_2: 'Siaga 2',
  siaga_1: 'Siaga 1',
}

/** Ordered list (best → worst) for building health-distribution strips. */
export const HEALTH_LEVELS: HealthLevel[] = ['sehat', 'siaga_3', 'siaga_2', 'siaga_1']

/**
 * SOP escalation reference (static, from the prototype). Keyed by level, this is
 * shown on the admin rules page and the analyst SOP monitor.
 */
export const HEALTH_SOP: Record<Exclude<HealthLevel, 'sehat'>, { phase: string; action: string }> = {
  siaga_3: { phase: 'Early Warning', action: 'Kirim reminder & minta klarifikasi ke perusahaan.' },
  siaga_2: { phase: 'Serious Concern', action: 'Jadwalkan pertemuan, susun rencana perbaikan tertulis.' },
  siaga_1: { phase: 'Enforcement', action: 'Tindakan hukum sesuai kontrak / restrukturisasi / exit.' },
}

// ─── Derivation ───────────────────────────────────────────────────────────

/** Map a numeric signal to the Siaga level it triggers via ascending thresholds. */
function levelForSignal(value: number, t: HealthThreshold): HealthLevel {
  if (value >= t.siaga1) return 'siaga_1'
  if (value >= t.siaga2) return 'siaga_2'
  if (value >= t.siaga3) return 'siaga_3'
  return 'sehat'
}

function moreSevere(a: HealthLevel, b: HealthLevel): HealthLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

/**
 * Consecutive most-recent months where actual net profit < 80% of the
 * projection target. Trailing months with no actual yet (future/unreported)
 * are skipped; a gap in actuals ends the streak.
 */
export function underTargetStreak(profitData: MonthlyDataPoint[]): number {
  let streak = 0
  let started = false
  for (let i = profitData.length - 1; i >= 0; i--) {
    const { proyeksi, aktual } = profitData[i]
    const hasActual = aktual !== 0
    if (!started) {
      if (!hasActual) continue // skip trailing future/no-data months
      started = true
    }
    if (!hasActual) break // a gap in reported actuals ends the streak
    if (proyeksi > 0 && aktual < 0.8 * proyeksi) streak++
    else break
  }
  return streak
}

export interface HealthInput {
  /** Days a payment/report is late (manual). */
  latenessDays?: number
  /** Last-contact date (YYYY-MM-DD); silence = days since, up to `now`. */
  lastContactDate?: string
  /** Monthly profit series (proyeksi vs aktual) for the under-target streak. */
  profitData?: MonthlyDataPoint[]
  rules: HealthRules
  /** Injectable clock for testing; defaults to the current date. */
  now?: Date
}

export interface HealthResult {
  level: HealthLevel
  reasons: string[]
  /** The raw signal values that fed the computation (for the SOP monitor). */
  signals: { latenessDays: number; silenceDays: number | null; underTargetMonths: number }
}

/**
 * Derive a portfolio's health from three signals — payment/report lateness,
 * communication silence, and consecutive under-target months — taking the most
 * severe level any one of them triggers. Pure: no I/O, no persistence.
 */
export function computeHealth(input: HealthInput): HealthResult {
  const { rules } = input
  const reasons: string[] = []
  let level: HealthLevel = 'sehat'

  // 1. Payment/report lateness
  const latenessDays = input.latenessDays ?? 0
  if (latenessDays > 0) {
    const l = levelForSignal(latenessDays, rules.latenessDays)
    if (l !== 'sehat') {
      level = moreSevere(level, l)
      reasons.push(`Keterlambatan pembayaran/laporan ${latenessDays} hari`)
    }
  }

  // 2. Communication silence
  let silenceDays: number | null = null
  if (input.lastContactDate) {
    const last = new Date(input.lastContactDate)
    if (!isNaN(last.getTime())) {
      const now = input.now ?? new Date()
      silenceDays = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000))
      const l = levelForSignal(silenceDays, rules.silenceDays)
      if (l !== 'sehat') {
        level = moreSevere(level, l)
        reasons.push(`Tidak ada komunikasi selama ${silenceDays} hari`)
      }
    }
  }

  // 3. Under-target streak
  const underTargetMonths = input.profitData?.length ? underTargetStreak(input.profitData) : 0
  if (underTargetMonths > 0) {
    const l = levelForSignal(underTargetMonths, rules.underTargetMonths)
    if (l !== 'sehat') {
      level = moreSevere(level, l)
      reasons.push(`Laba bersih < 80% target selama ${underTargetMonths} bulan berturut-turut`)
    }
  }

  return { level, reasons, signals: { latenessDays, silenceDays, underTargetMonths } }
}

// ─── Freshness ────────────────────────────────────────────────────────────

/**
 * How old a saved level may get before it stops meaning anything. Nothing
 * recomputes health in the background — the time-based signals (lateness,
 * silence) keep growing after a save, so a level saved long enough ago says
 * more about when an analyst last looked than about the portfolio today.
 */
export const HEALTH_STALE_DAYS = 30

export interface HealthFreshness {
  /** When the level was last saved; null when it never was. */
  date: Date | null
  /** Whole days since that save; null when never saved. */
  daysAgo: number | null
  /** True when never saved, or saved more than HEALTH_STALE_DAYS ago. */
  isStale: boolean
  /** Indonesian label — "Diperbarui 2 bulan lalu" / "Belum pernah diperbarui". */
  label: string
}

/**
 * Describe how current a stored `healthLevel` is. Accepts either a Firestore
 * timestamp (`{ seconds }`, as read back from a doc) or a Date (as stamped
 * locally right after a save), since both shapes reach the UI.
 */
export function healthFreshness(
  computedAt?: { seconds: number } | Date | null,
  now: Date = new Date(),
): HealthFreshness {
  const date =
    computedAt instanceof Date ? computedAt
    : computedAt?.seconds != null ? new Date(computedAt.seconds * 1000)
    : null

  if (!date || isNaN(date.getTime())) {
    return { date: null, daysAgo: null, isStale: true, label: 'Belum pernah diperbarui' }
  }

  const daysAgo = daysSince(date, now)
  return {
    date,
    daysAgo,
    isStale: daysAgo > HEALTH_STALE_DAYS,
    label: `Diperbarui ${formatDaysAgo(daysAgo)}`,
  }
}
