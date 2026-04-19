import type { CustomCategory, CustomCategoryType, CustomSubItem, OpexItem } from '@/types'

export const slugifyCategory = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function sumSubItems(category: CustomCategory): number {
  return category.subItems.reduce((s, x) => s + (Number(x.amount) || 0), 0)
}

export function sumCustomByType(
  categories: CustomCategory[] | undefined,
  type: CustomCategoryType,
): number {
  if (!categories) return 0
  return categories
    .filter(c => c.type === type)
    .reduce((s, c) => s + sumSubItems(c), 0)
}

export function customNetAdjustment(categories: CustomCategory[] | undefined): number {
  return sumCustomByType(categories, 'income') - sumCustomByType(categories, 'expense')
}

/**
 * Recompute all derived totals (revenue, cogs, grossProfit, totalOpex,
 * operatingProfit, netProfit) from the leaf data (sub-items, opex list,
 * interest, taxes, customCategories). The leaf data is the single source of
 * truth; totals are a cache.
 *
 * When `revenueSubItems` / `cogsSubItems` are populated, `revenue` / `cogs`
 * are derived from the sum. When absent, the existing flat number is kept
 * (backward compatible with legacy rows / manual entry).
 */
export function computePnL<T extends {
  revenue?: number
  cogs?: number
  grossProfit?: number
  opex?: OpexItem[]
  totalOpex?: number
  operatingProfit?: number
  interest?: number
  taxes?: number
  netProfit?: number
  customCategories?: CustomCategory[]
  cogsSubItems?: CustomSubItem[]
  revenueSubItems?: CustomSubItem[]
}>(row: T): T {
  const revenue = (row.revenueSubItems?.length ?? 0) > 0
    ? sumRevenueSubItems(row.revenueSubItems)
    : Number(row.revenue) || 0
  const cogs = (row.cogsSubItems?.length ?? 0) > 0
    ? sumCogsSubItems(row.cogsSubItems)
    : Number(row.cogs) || 0
  const totalOpex = (row.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const interest = Number(row.interest) || 0
  const taxes = Number(row.taxes) || 0

  const grossProfit = revenue - cogs
  const operatingProfit = grossProfit - totalOpex
  const netProfit = operatingProfit - interest - taxes + customNetAdjustment(row.customCategories)

  return { ...row, revenue, cogs, grossProfit, totalOpex, operatingProfit, netProfit }
}

function uniqueId(existingIds: string[], baseSlug: string, fallback: string): string {
  const base = baseSlug || fallback
  if (!existingIds.includes(base)) return base
  let i = 2
  while (existingIds.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export function addCategory(
  categories: CustomCategory[],
  name: string,
  type: CustomCategoryType,
): { categories: CustomCategory[]; id: string } {
  const id = uniqueId(categories.map(c => c.id), slugifyCategory(name), `cat-${Date.now()}`)
  const next: CustomCategory = { id, name: name.trim(), type, subItems: [] }
  return { categories: [...categories, next], id }
}

export function removeCategory(categories: CustomCategory[], catId: string): CustomCategory[] {
  return categories.filter(c => c.id !== catId)
}

export function addSubItem(
  categories: CustomCategory[],
  catId: string,
  name: string,
): { categories: CustomCategory[]; subId: string | null } {
  let createdSubId: string | null = null
  const next = categories.map(c => {
    if (c.id !== catId) return c
    const subId = uniqueId(
      c.subItems.map(s => s.id),
      slugifyCategory(name),
      `sub-${Date.now()}`,
    )
    createdSubId = subId
    const item: CustomSubItem = { id: subId, name: name.trim(), amount: 0 }
    return { ...c, subItems: [...c.subItems, item] }
  })
  return { categories: next, subId: createdSubId }
}

export function removeSubItem(
  categories: CustomCategory[],
  catId: string,
  subId: string,
): CustomCategory[] {
  return categories.map(c =>
    c.id === catId ? { ...c, subItems: c.subItems.filter(s => s.id !== subId) } : c,
  )
}

export function setSubItemAmount(
  categories: CustomCategory[],
  catId: string,
  subId: string,
  amount: number,
): CustomCategory[] {
  return categories.map(c =>
    c.id === catId
      ? { ...c, subItems: c.subItems.map(s => (s.id === subId ? { ...s, amount } : s)) }
      : c,
  )
}

/**
 * Add a new parent category uniformly across all month rows (same id/name/type,
 * empty subItems). Mirrors the opex pattern where adding propagates to every month.
 */
export function addCategoryAcrossMonths<T extends { customCategories?: CustomCategory[] }>(
  months: T[],
  name: string,
  type: CustomCategoryType,
): { months: T[]; id: string } {
  const existingIds = new Set(months.flatMap(m => (m.customCategories ?? []).map(c => c.id)))
  const id = uniqueId([...existingIds], slugifyCategory(name), `cat-${Date.now()}`)
  const next = months.map(m => ({
    ...m,
    customCategories: [
      ...(m.customCategories ?? []),
      { id, name: name.trim(), type, subItems: [] } satisfies CustomCategory,
    ],
  }))
  return { months: next, id }
}

export function removeCategoryAcrossMonths<T extends { customCategories?: CustomCategory[] }>(
  months: T[],
  catId: string,
): T[] {
  return months.map(m => ({
    ...m,
    customCategories: (m.customCategories ?? []).filter(c => c.id !== catId),
  }))
}

export function addSubItemAcrossMonths<T extends { customCategories?: CustomCategory[] }>(
  months: T[],
  catId: string,
  name: string,
): { months: T[]; subId: string | null } {
  const existingSubIds = new Set(
    months.flatMap(m =>
      (m.customCategories ?? [])
        .filter(c => c.id === catId)
        .flatMap(c => c.subItems.map(s => s.id)),
    ),
  )
  const subId = uniqueId([...existingSubIds], slugifyCategory(name), `sub-${Date.now()}`)
  const next = months.map(m => ({
    ...m,
    customCategories: (m.customCategories ?? []).map(c =>
      c.id === catId
        ? { ...c, subItems: [...c.subItems, { id: subId, name: name.trim(), amount: 0 }] }
        : c,
    ),
  }))
  return { months: next, subId }
}

export function removeSubItemAcrossMonths<T extends { customCategories?: CustomCategory[] }>(
  months: T[],
  catId: string,
  subId: string,
): T[] {
  return months.map(m => ({
    ...m,
    customCategories: (m.customCategories ?? []).map(c =>
      c.id === catId ? { ...c, subItems: c.subItems.filter(s => s.id !== subId) } : c,
    ),
  }))
}

export function setSubItemAmountInMonth<T extends { customCategories?: CustomCategory[] }>(
  months: T[],
  monthIdx: number,
  catId: string,
  subId: string,
  amount: number,
): T[] {
  return months.map((m, i) =>
    i === monthIdx
      ? {
          ...m,
          customCategories: (m.customCategories ?? []).map(c =>
            c.id === catId
              ? {
                  ...c,
                  subItems: c.subItems.map(s => (s.id === subId ? { ...s, amount } : s)),
                }
              : c,
          ),
        }
      : m,
  )
}

// ─── COGS breakdown helpers ────────────────────────────────────────────────
// COGS is a pinned main-category (always sits between Revenue and Gross Profit).
// These helpers mirror the `*AcrossMonths` pattern used for customCategories
// but operate on a flat CustomSubItem[] field (`cogsSubItems`) on each month.

export function sumCogsSubItems(items: CustomSubItem[] | undefined): number {
  if (!items) return 0
  return items.reduce((s, x) => s + (Number(x.amount) || 0), 0)
}

export function unionCogsSubItems(
  sources: Array<CustomSubItem[] | undefined>,
): CustomSubItem[] {
  const byId = new Map<string, CustomSubItem>()
  for (const list of sources) {
    if (!list) continue
    for (const sub of list) {
      if (!byId.has(sub.id)) {
        byId.set(sub.id, { id: sub.id, name: sub.name, amount: 0 })
      }
    }
  }
  return Array.from(byId.values())
}

export function addCogsSubItemAcrossMonths<T extends { cogsSubItems?: CustomSubItem[] }>(
  months: T[],
  name: string,
): { months: T[]; subId: string | null } {
  const existingIds = new Set(months.flatMap(m => (m.cogsSubItems ?? []).map(s => s.id)))
  const subId = uniqueId([...existingIds], slugifyCategory(name), `cogs-${Date.now()}`)
  const next = months.map(m => ({
    ...m,
    cogsSubItems: [
      ...(m.cogsSubItems ?? []),
      { id: subId, name: name.trim(), amount: 0 } satisfies CustomSubItem,
    ],
  }))
  return { months: next, subId }
}

export function removeCogsSubItemAcrossMonths<T extends { cogsSubItems?: CustomSubItem[] }>(
  months: T[],
  subId: string,
): T[] {
  return months.map(m => ({
    ...m,
    cogsSubItems: (m.cogsSubItems ?? []).filter(s => s.id !== subId),
  }))
}

export function setCogsSubItemAmountInMonth<T extends { cogsSubItems?: CustomSubItem[] }>(
  months: T[],
  monthIdx: number,
  subId: string,
  amount: number,
): T[] {
  return months.map((m, i) =>
    i === monthIdx
      ? {
          ...m,
          cogsSubItems: (m.cogsSubItems ?? []).map(s =>
            s.id === subId ? { ...s, amount } : s,
          ),
        }
      : m,
  )
}

// ─── Revenue breakdown helpers ─────────────────────────────────────────────
// Mirrors the COGS breakdown pattern. Revenue is a pinned main-category that
// always sits at the top of the PnL. When `revenueSubItems` is populated,
// `revenue` (total) is derived from the sum.

export function sumRevenueSubItems(items: CustomSubItem[] | undefined): number {
  if (!items) return 0
  return items.reduce((s, x) => s + (Number(x.amount) || 0), 0)
}

export function unionRevenueSubItems(
  sources: Array<CustomSubItem[] | undefined>,
): CustomSubItem[] {
  const byId = new Map<string, CustomSubItem>()
  for (const list of sources) {
    if (!list) continue
    for (const sub of list) {
      if (!byId.has(sub.id)) {
        byId.set(sub.id, { id: sub.id, name: sub.name, amount: 0 })
      }
    }
  }
  return Array.from(byId.values())
}

export function addRevenueSubItemAcrossMonths<T extends { revenueSubItems?: CustomSubItem[] }>(
  months: T[],
  name: string,
): { months: T[]; subId: string | null } {
  const existingIds = new Set(months.flatMap(m => (m.revenueSubItems ?? []).map(s => s.id)))
  const subId = uniqueId([...existingIds], slugifyCategory(name), `rev-${Date.now()}`)
  const next = months.map(m => ({
    ...m,
    revenueSubItems: [
      ...(m.revenueSubItems ?? []),
      { id: subId, name: name.trim(), amount: 0 } satisfies CustomSubItem,
    ],
  }))
  return { months: next, subId }
}

export function removeRevenueSubItemAcrossMonths<T extends { revenueSubItems?: CustomSubItem[] }>(
  months: T[],
  subId: string,
): T[] {
  return months.map(m => ({
    ...m,
    revenueSubItems: (m.revenueSubItems ?? []).filter(s => s.id !== subId),
  }))
}

export function setRevenueSubItemAmountInMonth<T extends { revenueSubItems?: CustomSubItem[] }>(
  months: T[],
  monthIdx: number,
  subId: string,
  amount: number,
): T[] {
  return months.map((m, i) =>
    i === monthIdx
      ? {
          ...m,
          revenueSubItems: (m.revenueSubItems ?? []).map(s =>
            s.id === subId ? { ...s, amount } : s,
          ),
        }
      : m,
  )
}

// ─── Opex sub-item helpers ─────────────────────────────────────────────────
// Opex is stored as `OpexItem[]` (name + amount). We expose it as a pinned
// main-category whose sub-items use the opex name as a stable id. These helpers
// let callers add/remove opex names uniformly across all month rows.

export function unionOpexNames(sources: Array<OpexItem[] | undefined>): string[] {
  const set = new Set<string>()
  for (const list of sources) {
    if (!list) continue
    for (const o of list) set.add(o.name)
  }
  return Array.from(set)
}

export function addOpexAcrossMonths<T extends { opex?: OpexItem[] }>(
  months: T[],
  rawName: string,
): { months: T[]; name: string | null } {
  const name = rawName.trim()
  if (!name) return { months, name: null }
  const existing = new Set(months.flatMap(m => (m.opex ?? []).map(o => o.name.toLowerCase())))
  if (existing.has(name.toLowerCase())) return { months, name: null }
  const next = months.map(m => ({
    ...m,
    opex: [...(m.opex ?? []), { name, amount: 0 }],
  }))
  return { months: next, name }
}

export function removeOpexAcrossMonths<T extends { opex?: OpexItem[] }>(
  months: T[],
  name: string,
): T[] {
  return months.map(m => ({
    ...m,
    opex: (m.opex ?? []).filter(o => o.name !== name),
  }))
}

export function setOpexAmountInMonth<T extends { opex?: OpexItem[] }>(
  months: T[],
  monthIdx: number,
  name: string,
  amount: number,
): T[] {
  return months.map((m, i) => {
    if (i !== monthIdx) return m
    const current = m.opex ?? []
    const has = current.some(o => o.name === name)
    const nextOpex = has
      ? current.map(o => (o.name === name ? { ...o, amount } : o))
      : [...current, { name, amount }]
    return { ...m, opex: nextOpex }
  })
}

/**
 * Compute the union of categories across a list of month rows / reports. Matches
 * categories by id; the first occurrence's name/type wins. Each returned category's
 * subItems is also the union across all sources (by subItem id).
 */
export function unionCategories(
  sources: Array<CustomCategory[] | undefined>,
): CustomCategory[] {
  const byId = new Map<string, CustomCategory>()
  for (const list of sources) {
    if (!list) continue
    for (const cat of list) {
      const existing = byId.get(cat.id)
      if (!existing) {
        byId.set(cat.id, {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          subItems: [...cat.subItems],
        })
      } else {
        const known = new Set(existing.subItems.map(s => s.id))
        for (const sub of cat.subItems) {
          if (!known.has(sub.id)) {
            existing.subItems.push({ ...sub, amount: 0 })
            known.add(sub.id)
          }
        }
      }
    }
  }
  return Array.from(byId.values())
}
