import type { CustomCategory, RowOrder } from '@/types'

export type MoveDirection = 'up' | 'down'

export type BodyEntryType = 'opex' | 'cat'
export interface BodyEntry {
  type: BodyEntryType
  id: string
}

const tag = (type: BodyEntryType, id: string) => `${type}:${id}`
const parseTag = (raw: string): BodyEntry | null => {
  const colon = raw.indexOf(':')
  if (colon < 0) return null
  const type = raw.slice(0, colon)
  const id = raw.slice(colon + 1)
  if (type !== 'opex' && type !== 'cat') return null
  return { type, id }
}

/**
 * Resolve the body zone rendering order (opex items and custom category blocks
 * interleaved) from the available ids and the persisted config.
 *
 * Precedence:
 *   1. If `rowOrder.body` is set, honor it (filtering to available entries).
 *   2. Otherwise, fall back to the deprecated `opex` and `customCategories`
 *      lists to synthesize a default. This preserves existing user ordering
 *      from before the unified-body migration.
 *   3. Any ids not covered by the above are appended in their input order.
 */
export function resolveBodyOrder(
  opexNames: string[],
  categoryIds: string[],
  rowOrder: RowOrder | undefined,
): BodyEntry[] {
  const opexSet = new Set(opexNames)
  const catSet = new Set(categoryIds)
  const result: BodyEntry[] = []
  const seen = new Set<string>()

  const push = (entry: BodyEntry) => {
    const key = tag(entry.type, entry.id)
    if (seen.has(key)) return
    if (entry.type === 'opex' && !opexSet.has(entry.id)) return
    if (entry.type === 'cat' && !catSet.has(entry.id)) return
    result.push(entry)
    seen.add(key)
  }

  if (rowOrder?.body && rowOrder.body.length > 0) {
    for (const raw of rowOrder.body) {
      const parsed = parseTag(raw)
      if (parsed) push(parsed)
    }
  } else {
    // Fallback using the legacy separate lists.
    if (rowOrder?.opex) {
      for (const name of rowOrder.opex) push({ type: 'opex', id: name })
    }
    if (rowOrder?.customCategories) {
      for (const id of rowOrder.customCategories) push({ type: 'cat', id })
    }
  }
  // Append any unseen opex names in their natural order.
  for (const name of opexNames) push({ type: 'opex', id: name })
  // Append any unseen categories in their natural order.
  for (const id of categoryIds) push({ type: 'cat', id })
  return result
}

export function bodyEntriesToTags(entries: BodyEntry[]): string[] {
  return entries.map(e => tag(e.type, e.id))
}

export function moveInBody(
  rowOrder: RowOrder | undefined,
  opexNames: string[],
  categoryIds: string[],
  target: BodyEntry,
  direction: MoveDirection,
): string[] {
  const canonical = resolveBodyOrder(opexNames, categoryIds, rowOrder)
  const targetKey = tag(target.type, target.id)
  const idx = canonical.findIndex(e => tag(e.type, e.id) === targetKey)
  if (idx < 0) return bodyEntriesToTags(canonical)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= canonical.length) return bodyEntriesToTags(canonical)
  const next = [...canonical]
  ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
  return bodyEntriesToTags(next)
}

export function applySubItemOrder(
  cat: CustomCategory,
  subOrder: string[] | undefined,
): CustomCategory {
  if (!subOrder || subOrder.length === 0) return cat
  const byId = new Map(cat.subItems.map(s => [s.id, s]))
  const seen = new Set<string>()
  const subs = []
  for (const id of subOrder) {
    const s = byId.get(id)
    if (s && !seen.has(id)) { subs.push(s); seen.add(id) }
  }
  for (const s of cat.subItems) {
    if (!seen.has(s.id)) subs.push(s)
  }
  return { ...cat, subItems: subs }
}

export function moveSubItemInCategory(
  subOrder: string[] | undefined,
  availableIds: string[],
  targetId: string,
  direction: MoveDirection,
): string[] {
  const seen = new Set<string>()
  const canonical: string[] = []
  if (subOrder) {
    for (const id of subOrder) {
      if (availableIds.includes(id) && !seen.has(id)) { canonical.push(id); seen.add(id) }
    }
  }
  for (const id of availableIds) {
    if (!seen.has(id)) canonical.push(id)
  }
  const idx = canonical.indexOf(targetId)
  if (idx < 0) return canonical
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= canonical.length) return canonical
  const next = [...canonical]
  ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
  return next
}

export function setSubItemOrder(
  current: RowOrder | undefined,
  catId: string,
  nextSubOrder: string[],
): RowOrder {
  return {
    ...current,
    customSubItems: {
      ...(current?.customSubItems ?? {}),
      [catId]: nextSubOrder,
    },
  }
}
