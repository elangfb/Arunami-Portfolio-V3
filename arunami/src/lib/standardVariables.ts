import type { IndustryType } from '@/types'

// Canonical standard opex names — items NOT in this list are "discovered"
export const STANDARD_OPEX_NAMES = [
  'gaji', 'salary', 'gaji karyawan',
  'sewa', 'rent', 'sewa kantor', 'sewa gedung',
  'utilitas', 'utilities', 'listrik', 'air', 'internet',
  'marketing', 'iklan', 'advertising', 'promosi',
  'transportasi', 'transport',
  'perlengkapan', 'supplies', 'atk',
  'asuransi', 'insurance',
  'depresiasi', 'depreciation', 'penyusutan',
  'pajak', 'tax', 'taxes',
  'administrasi', 'admin',
  'maintenance', 'perawatan',
]

// Industry-specific standard opex items
const INDUSTRY_STANDARD_OPEX: Partial<Record<IndustryType, string[]>> = {
  fnb: ['bahan baku', 'food cost', 'packaging', 'kemasan'],
  manufaktur: ['bahan baku', 'raw material', 'produksi', 'quality control'],
  saas: ['server', 'hosting', 'cloud', 'infrastructure'],
  jasa: ['subcontractor', 'outsource', 'konsultan'],
}

// Standard revenue category names per industry
export const STANDARD_REVENUE_NAMES: Partial<Record<IndustryType, string[]>> = {
  retail: ['laptop', 'service', 'aksesoris'],
  saas: ['subscription', 'mrr', 'setup fee', 'professional services'],
  fnb: ['dine-in', 'takeaway', 'delivery', 'catering'],
  jasa: ['konsultasi', 'retainer', 'project-based'],
  manufaktur: ['produk jadi', 'semi-finished', 'custom order'],
}

/**
 * Check if an opex name is "standard" (case-insensitive, substring match).
 * Returns true for recognized items, false for discovered ones.
 */
export function isStandardOpex(name: string, industryType?: IndustryType): boolean {
  const lower = name.toLowerCase().trim()
  const allStandard = [
    ...STANDARD_OPEX_NAMES,
    ...(industryType ? INDUSTRY_STANDARD_OPEX[industryType] ?? [] : []),
  ]
  return allStandard.some(s => lower.includes(s) || s.includes(lower))
}

/**
 * Check if a revenue category name is "standard" for the given industry.
 */
export function isStandardRevenue(name: string, industryType?: IndustryType): boolean {
  if (!industryType) return false
  const standards = STANDARD_REVENUE_NAMES[industryType] ?? []
  const lower = name.toLowerCase().trim()
  return standards.some(s => lower.includes(s) || s.includes(lower))
}
