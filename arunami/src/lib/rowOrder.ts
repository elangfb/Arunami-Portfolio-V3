import type { CustomCategory, RowOrder } from '@/types'

export type MoveDirection = 'up' | 'down'

/**
 * Return `names` reordered so that ids present in `order` come first (in the
 * given order), then any remaining names appended in their original order.
 */
export function applyOrderToNames(names: string[], order: string[] | undefined): string[] {
  if (!order || order.length === 0) return names
  const set = new Set(names)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of order) {
    if (set.has(id) && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  for (const name of names) {
    if (!seen.has(name)) out.push(name)
  }
  return out
}

export function applyOrderToCategories(
  cats: CustomCategory[],
  catOrder: string[] | undefined,
  subOrders: Record<string, string[]> | undefined,
): CustomCategory[] {
  const byId = new Map(cats.map(c => [c.id, c]))
  const seen = new Set<string>()
  const ordered: CustomCategory[] = []
  if (catOrder) {
    for (const id of catOrder) {
      const c = byId.get(id)
      if (c && !seen.has(id)) {
        ordered.push(c)
        seen.add(id)
      }
    }
  }
  for (const c of cats) {
    if (!seen.has(c.id)) ordered.push(c)
  }
  return ordered.map(c => {
    const subOrder = subOrders?.[c.id]
    if (!subOrder || subOrder.length === 0) return c
    const subById = new Map(c.subItems.map(s => [s.id, s]))
    const subSeen = new Set<string>()
    const subs = []
    for (const id of subOrder) {
      const s = subById.get(id)
      if (s && !subSeen.has(id)) {
        subs.push(s)
        subSeen.add(id)
      }
    }
    for (const s of c.subItems) {
      if (!subSeen.has(s.id)) subs.push(s)
    }
    return { ...c, subItems: subs }
  })
}

/**
 * Move `targetId` one step up or down within the order defined by
 * `currentOrder + availableIds` (canonicalized). Returns the new full order
 * covering every available id. Silently returns current canonical order if the
 * target is at the edge.
 */
export function moveInOrder(
  currentOrder: string[] | undefined,
  availableIds: string[],
  targetId: string,
  direction: MoveDirection,
): string[] {
  const seen = new Set<string>()
  const canonical: string[] = []
  if (currentOrder) {
    for (const id of currentOrder) {
      if (availableIds.includes(id) && !seen.has(id)) {
        canonical.push(id)
        seen.add(id)
      }
    }
  }
  for (const id of availableIds) {
    if (!seen.has(id)) canonical.push(id)
  }
  const idx = canonical.indexOf(targetId)
  if (idx < 0) return canonical
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= canonical.length) return canonical
  const next = [...canonical]
  ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
  return next
}

export function mergeRowOrder(current: RowOrder | undefined, patch: Partial<RowOrder>): RowOrder {
  return {
    opex: patch.opex ?? current?.opex,
    customCategories: patch.customCategories ?? current?.customCategories,
    customSubItems: patch.customSubItems ?? current?.customSubItems,
  }
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
