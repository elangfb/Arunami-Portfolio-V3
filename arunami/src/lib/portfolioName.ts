import type { Portfolio } from '@/types'

/**
 * Portfolio display naming. Every Portfolio has a legal PT `name`
 * (e.g. "PT Contoh Teknologi") and a public `brandName` ("Contoh Brand").
 * The UI leads with the brand and keeps the PT name as a subtitle. These
 * helpers centralise that rule and the `brandName || name` fallback so
 * legacy portfolios with an empty brand name still render.
 */

/** The brand name to show, falling back to the PT name when blank. */
export function brandOf(p: { brandName?: string; name: string }): string {
  return p.brandName?.trim() || p.name
}

/**
 * Resolve a brand name for denormalized records that only carry the PT name
 * (and sometimes a portfolioId). Looks up by id first, then by matching PT
 * name, and falls back to the given PT name when nothing matches.
 *
 * Pass the portfolios already loaded by the page — no extra fetch needed.
 */
export function makeBrandResolver(portfolios: Portfolio[]) {
  const byId = new Map(portfolios.map(p => [p.id, p]))
  const byName = new Map(portfolios.map(p => [p.name, p]))
  return ({ id, ptName }: { id?: string | null; ptName?: string }): string => {
    const match = (id && byId.get(id)) || (ptName ? byName.get(ptName) : undefined)
    return match ? brandOf(match) : (ptName ?? '')
  }
}

export type BrandResolver = ReturnType<typeof makeBrandResolver>
