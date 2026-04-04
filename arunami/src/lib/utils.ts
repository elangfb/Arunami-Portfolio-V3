import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency formatting ───────────────────────────────────────────────────

export function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1)}M`
  }
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1)}Jt`
  }
  if (value >= 1_000) {
    return `Rp ${(value / 1_000).toFixed(0)}Rb`
  }
  return `Rp ${value.toLocaleString('id-ID')}`
}

export function formatCurrencyExact(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`
}

// ─── Percentage formatting ─────────────────────────────────────────────────

export function formatPercent(value: number, showSign = false): string {
  const formatted = `${Math.abs(value).toFixed(1)}%`
  if (showSign) return value >= 0 ? `+${formatted}` : `-${formatted}`
  return formatted
}

export function calcMoM(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

// ─── Month names (Indonesian) ──────────────────────────────────────────────

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export function monthLabel(index: number): string {
  return MONTH_NAMES_ID[index] ?? `Bulan ${index + 1}`
}
