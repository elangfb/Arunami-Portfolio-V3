import type { IndustryType, RevenueCategory, KpiMetric } from '@/types'

const CATEGORY_COLORS = [
  '#38a169', '#3182ce', '#d69e2e', '#e53e3e', '#805ad5',
  '#dd6b20', '#319795', '#d53f8c', '#718096', '#2b6cb0',
]

function assignColors(categories: Omit<RevenueCategory, 'color'>[]): RevenueCategory[] {
  return categories.map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
}

interface IndustryPreset {
  label: string
  revenueCategories: RevenueCategory[]
  kpiMetrics: KpiMetric[]
}

const BASE_KPI: KpiMetric[] = [
  { id: 'revenue', name: 'Revenue', targetValue: 0, unit: 'currency' },
  { id: 'net-profit', name: 'Net Profit', targetValue: 0, unit: 'currency' },
  { id: 'gross-margin', name: 'Gross Margin %', targetValue: 0, unit: 'percentage' },
  { id: 'efficiency', name: 'Efisiensi %', targetValue: 0, unit: 'percentage' },
]

export const INDUSTRY_PRESETS: Record<IndustryType, IndustryPreset> = {
  retail: {
    label: 'Retail',
    revenueCategories: assignColors([
      { id: 'laptop', name: 'Laptop' },
      { id: 'service', name: 'Service' },
      { id: 'aksesoris', name: 'Aksesoris' },
    ]),
    kpiMetrics: [
      ...BASE_KPI,
      { id: 'aov', name: 'Average Order Value', targetValue: 0, unit: 'currency' },
    ],
  },
  saas: {
    label: 'SaaS',
    revenueCategories: assignColors([
      { id: 'subscription-mrr', name: 'Subscription MRR' },
      { id: 'setup-fee', name: 'Setup Fee' },
      { id: 'professional-services', name: 'Professional Services' },
    ]),
    kpiMetrics: [
      ...BASE_KPI,
      { id: 'mrr', name: 'MRR', targetValue: 0, unit: 'currency' },
      { id: 'churn-rate', name: 'Churn Rate', targetValue: 0, unit: 'percentage' },
      { id: 'cac', name: 'CAC', targetValue: 0, unit: 'currency' },
      { id: 'ltv', name: 'LTV', targetValue: 0, unit: 'currency' },
    ],
  },
  fnb: {
    label: 'F&B / Restoran',
    revenueCategories: assignColors([
      { id: 'dine-in', name: 'Dine-in' },
      { id: 'takeaway', name: 'Takeaway' },
      { id: 'delivery', name: 'Delivery' },
      { id: 'catering', name: 'Catering' },
    ]),
    kpiMetrics: [
      ...BASE_KPI,
      { id: 'covers-per-day', name: 'Covers/Hari', targetValue: 0, unit: 'count' },
      { id: 'avg-check', name: 'Average Check', targetValue: 0, unit: 'currency' },
      { id: 'food-cost', name: 'Food Cost %', targetValue: 0, unit: 'percentage' },
    ],
  },
  jasa: {
    label: 'Jasa / Konsultan',
    revenueCategories: assignColors([
      { id: 'konsultasi', name: 'Konsultasi' },
      { id: 'retainer', name: 'Retainer' },
      { id: 'project-based', name: 'Project-based' },
    ]),
    kpiMetrics: [
      ...BASE_KPI,
      { id: 'utilization-rate', name: 'Utilization Rate', targetValue: 0, unit: 'percentage' },
      { id: 'project-margin', name: 'Project Margin', targetValue: 0, unit: 'percentage' },
      { id: 'client-retention', name: 'Client Retention', targetValue: 0, unit: 'percentage' },
    ],
  },
  manufaktur: {
    label: 'Manufaktur',
    revenueCategories: assignColors([
      { id: 'produk-jadi', name: 'Produk Jadi' },
      { id: 'semi-finished', name: 'Semi-finished' },
      { id: 'custom-order', name: 'Custom Order' },
    ]),
    kpiMetrics: [
      ...BASE_KPI,
      { id: 'production-volume', name: 'Volume Produksi', targetValue: 0, unit: 'count' },
      { id: 'defect-rate', name: 'Defect Rate', targetValue: 0, unit: 'percentage' },
      { id: 'capacity-utilization', name: 'Kapasitas Utilisasi', targetValue: 0, unit: 'percentage' },
    ],
  },
  lainnya: {
    label: 'Lainnya',
    revenueCategories: assignColors([
      { id: 'kategori-1', name: 'Kategori 1' },
      { id: 'kategori-2', name: 'Kategori 2' },
    ]),
    kpiMetrics: [...BASE_KPI],
  },
}

export const INDUSTRY_OPTIONS = Object.entries(INDUSTRY_PRESETS).map(([value, preset]) => ({
  value: value as IndustryType,
  label: preset.label,
}))

export const STAGE_OPTIONS = [
  { value: 'pre-seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'growth', label: 'Growth' },
]
