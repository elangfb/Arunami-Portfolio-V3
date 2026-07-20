import type { OpexItem, PnLIssue } from '@/types'
import { accountKey } from '@/lib/customCategories'
import { isStandardOpex } from '@/lib/standardVariables'

/** Generic expense words that don't distinguish one account from another. */
const GENERIC_TOKENS = new Set(['cost', 'costs', 'expense', 'expenses', 'exp', 'total'])

const tokens = (key: string) => key.split(' ').filter(Boolean)

/** Levenshtein distance, capped-length inputs so the O(n·m) fill stays trivial. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[n]
}

/**
 * Do two DIFFERENT account keys look like the same account?
 *
 * Two signals, both deliberately narrow because this only ever produces a
 * suggestion:
 *  - one label's tokens are a subset of the other's, and every extra token is a
 *    generic expense word ("internal audit" vs "internal audit cost")
 *  - a near-identical string, i.e. a typo ("perlengkapan toko" vs "perlengkapan took")
 *
 * Not caught, by design: cross-language pairs with no shared tokens
 * ("beban insentif dan bonus" vs "incentives and bonuses"). Matching those
 * needs a translation table and a human decision.
 */
export function looksSimilar(a: string, b: string): boolean {
  if (a === b) return false
  const ta = tokens(a)
  const tb = tokens(b)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const longSet = new Set(long)
  if (short.length > 0 && short.every(t => longSet.has(t))) {
    const extra = long.filter(t => !short.includes(t))
    if (extra.length > 0 && extra.every(t => GENERIC_TOKENS.has(t))) return true
  }
  // Typo tolerance scaled to length: one stray character on a short label, two
  // on a long one (enough for a transposition like "toko" -> "took"). Kept tight
  // so genuinely different accounts stay apart — "listrik dan air" vs
  // "listrik dan gas" is distance 3, "gaji" vs "sewa" further still.
  const maxLen = Math.max(a.length, b.length)
  const tolerance = maxLen >= 12 ? 2 : maxLen >= 6 ? 1 : 0
  return tolerance > 0 && editDistance(a, b) <= tolerance
}

/**
 * Inspect the RAW extraction, before opex rows are deduped, and report the
 * duplicate / look-alike account names a human should confirm.
 *
 * Does NOT report new accounts — that needs the portfolio's history, which the
 * extractor has no access to. Call `detectNewAccounts` for those and combine.
 */
export function detectPnLIssues(
  rawMonths: Array<{ month: string; opex?: OpexItem[] }>,
): PnLIssue[] {
  const issues: PnLIssue[] = []

  // ── same account under several spellings ────────────────────────────────
  // Collected per month: whether a pair is safe to merge depends on the
  // amounts in that month, not across the file.
  const mergedBy = new Map<string, { labels: Set<string>; kept: string; months: Set<string> }>()
  const ambiguousBy = new Map<string, { labels: string[]; amounts: number[]; months: Set<string> }>()

  for (const m of rawMonths) {
    const groups = new Map<string, OpexItem[]>()
    for (const o of m.opex ?? []) {
      const key = accountKey(o.name)
      const g = groups.get(key)
      if (g) g.push(o)
      else groups.set(key, [o])
    }
    for (const [key, group] of groups) {
      const distinct = [...new Set(group.map(o => o.name))]
      if (distinct.length < 2) continue
      const withAmount = group.filter(o => (Number(o.amount) || 0) !== 0)
      if (withAmount.length > 1) {
        const entry = ambiguousBy.get(key) ?? {
          labels: withAmount.map(o => o.name),
          amounts: withAmount.map(o => Number(o.amount) || 0),
          months: new Set<string>(),
        }
        entry.months.add(m.month)
        ambiguousBy.set(key, entry)
      } else {
        const kept = withAmount[0]?.name ?? group[0].name
        const entry = mergedBy.get(key) ?? { labels: new Set<string>(), kept, months: new Set<string>() }
        distinct.forEach(l => entry.labels.add(l))
        entry.months.add(m.month)
        mergedBy.set(key, entry)
      }
    }
  }

  for (const e of ambiguousBy.values())
    issues.push({ kind: 'ambiguous', labels: e.labels, amounts: e.amounts, months: [...e.months] })
  for (const e of mergedBy.values())
    issues.push({ kind: 'merged', labels: [...e.labels], kept: e.kept, months: [...e.months] })

  // ── distinct accounts that merely look alike ────────────────────────────
  const labelByKey = new Map<string, string>()
  const monthsByKey = new Map<string, Set<string>>()
  for (const m of rawMonths)
    for (const o of m.opex ?? []) {
      const key = accountKey(o.name)
      if (!labelByKey.has(key)) labelByKey.set(key, o.name)
      const set = monthsByKey.get(key) ?? new Set<string>()
      set.add(m.month)
      monthsByKey.set(key, set)
    }

  const keys = [...labelByKey.keys()]
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      if (!looksSimilar(keys[i], keys[j])) continue
      const a = labelByKey.get(keys[i])!
      const b = labelByKey.get(keys[j])!
      const months = new Set([...(monthsByKey.get(keys[i]) ?? []), ...(monthsByKey.get(keys[j]) ?? [])])
      issues.push({ kind: 'similar', labels: [a, b], months: [...months] })
    }

  return issues
}

/**
 * Opex accounts in this upload that the portfolio has not used before and that
 * aren't a recognised standard name — the "we're not sure where this goes" case.
 *
 * Safe to run on deduped months: a spelling that was merged away is represented
 * by the label that survived, which is the one that would be saved.
 *
 * @param knownOpexNames opex labels from this portfolio's already-saved reports.
 */
export function detectNewAccounts(
  months: Array<{ month: string; opex?: OpexItem[] }>,
  knownOpexNames: string[],
): PnLIssue[] {
  const knownKeys = new Set(knownOpexNames.map(accountKey))
  const seen = new Map<string, { label: string; months: Set<string> }>()
  for (const m of months)
    for (const o of m.opex ?? []) {
      const key = accountKey(o.name)
      if (knownKeys.has(key) || isStandardOpex(o.name)) continue
      const entry = seen.get(key) ?? { label: o.name, months: new Set<string>() }
      entry.months.add(m.month)
      seen.set(key, entry)
    }
  return [...seen.values()].map(e => ({
    kind: 'new_account' as const,
    labels: [e.label],
    months: [...e.months],
  }))
}
