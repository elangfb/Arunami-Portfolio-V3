import { serverTimestamp } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { extractPortfolioSetup } from './gemini'
import { getPortfolioConfig, savePortfolioConfig } from './firestore'
import { INDUSTRY_PRESETS } from './industryPresets'
import type { RevenueCategory, KpiMetric, IndustryType } from '@/types'

const PALETTE = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4', '#3182ce', '#d69e2e', '#dd6b20']

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function unitFromMetric(name: string, unit: string): KpiMetric['unit'] {
  if (unit === 'currency' || unit === 'percentage' || unit === 'count' || unit === 'ratio') {
    return unit
  }
  // Fallback
  if (/profit|revenue|biaya|cost/i.test(name)) return 'currency'
  if (/%|margin|persen|efisiensi/i.test(name)) return 'percentage'
  return 'count'
}

export interface EnrichmentResult {
  ranEnrichment: boolean
  newCategories: string[]
  newKpis: string[]
}

/**
 * Run a one-shot enrichment after the analyst's first P&L or projection upload.
 * Idempotent across sessions via the `configEnrichedAt` flag on PortfolioConfig
 * — once enrichment runs successfully it never runs again, even if the analyst
 * re-uploads the same file or wipes existing reports.
 *
 * Re-parses the file via extractPortfolioSetup() to discover custom revenue
 * categories and AI-suggested KPI metrics. Merges those into the existing
 * PortfolioConfig — only adding items that aren't already present, never
 * deleting analyst-curated entries.
 *
 * Returns a summary so the caller can toast what was added.
 */
export async function enrichConfigFromFirstUpload(params: {
  portfolioId: string
  file: File
  kind: 'pnl' | 'projection'
  industryType: IndustryType
}): Promise<EnrichmentResult> {
  const { portfolioId, file, kind, industryType } = params

  // Idempotent guard — once enrichment has run for this portfolio, never again.
  const config = await getPortfolioConfig(portfolioId)
  if (!config) return { ranEnrichment: false, newCategories: [], newKpis: [] }
  if (config.configEnrichedAt) {
    return { ranEnrichment: false, newCategories: [], newKpis: [] }
  }

  const setup = await extractPortfolioSetup(
    kind === 'pnl' ? file : null,
    kind === 'projection' ? file : null,
    industryType,
  )

  const existingCatIds = new Set(config.revenueCategories.map(c => c.id))
  const existingKpiIds = new Set(config.kpiMetrics.map(k => k.id))

  // Discovered revenue categories from the PnL extraction
  const discoveredCats: RevenueCategory[] = []
  if (setup.pnl?.revenueBreakdown) {
    for (const item of setup.pnl.revenueBreakdown) {
      const id = slugify(item.name)
      if (!id || existingCatIds.has(id)) continue
      discoveredCats.push({
        id,
        name: item.name,
        color: PALETTE[(discoveredCats.length + config.revenueCategories.length) % PALETTE.length],
      })
      existingCatIds.add(id)
    }
  }

  // Suggested KPIs
  const discoveredKpis: KpiMetric[] = []
  for (const k of setup.suggestedKpis ?? []) {
    const id = slugify(k.name)
    if (!id || existingKpiIds.has(id)) continue
    discoveredKpis.push({
      id,
      name: k.name,
      targetValue: typeof k.value === 'number' ? k.value : 0,
      unit: unitFromMetric(k.name, k.unit),
    })
    existingKpiIds.add(id)
  }

  // Always stamp the enrichment timestamp so subsequent uploads skip — even when
  // nothing new was discovered, we don't want to keep paying the Gemini call.
  const merged = {
    ...config,
    revenueCategories: [...config.revenueCategories, ...discoveredCats],
    kpiMetrics: [...config.kpiMetrics, ...discoveredKpis],
    configEnrichedAt: serverTimestamp() as unknown as Timestamp,
  }
  const { createdAt: _ignored, ...payload } = merged
  void _ignored
  await savePortfolioConfig(portfolioId, payload)

  return {
    ranEnrichment: true,
    newCategories: discoveredCats.map(c => c.name),
    newKpis: discoveredKpis.map(k => k.name),
  }
}

// Industry preset is exported to keep the import tree-shake-friendly
export { INDUSTRY_PRESETS }
