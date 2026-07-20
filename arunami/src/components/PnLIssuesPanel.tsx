import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyExact } from '@/lib/utils'
import type { PnLIssue, PnLIssueKind } from '@/types'

interface Props {
  issues: PnLIssue[]
  /** Rename an account across every month, so the analyst can resolve in place. */
  onRenameAccount?: (from: string, to: string) => void
}

/** Severity drives the banner colour: amber needs a look, red needs a decision. */
const KIND_META: Record<PnLIssueKind, { label: string; tone: 'amber' | 'red' }> = {
  ambiguous: { label: 'Perlu keputusan', tone: 'red' },
  merged: { label: 'Digabung otomatis', tone: 'amber' },
  similar: { label: 'Mirip', tone: 'amber' },
  new_account: { label: 'Akun baru', tone: 'amber' },
}

const ORDER: PnLIssueKind[] = ['ambiguous', 'merged', 'similar', 'new_account']

function monthsLabel(months: string[]): string {
  const sorted = [...months].sort()
  if (sorted.length === 0) return ''
  if (sorted.length <= 3) return sorted.join(', ')
  return `${sorted[0]} … ${sorted[sorted.length - 1]} (${sorted.length} bulan)`
}

export default function PnLIssuesPanel({ issues, onRenameAccount }: Props) {
  const [open, setOpen] = useState(true)
  if (issues.length === 0) return null

  const needsDecision = issues.filter(i => i.kind === 'ambiguous')
  const tone = needsDecision.length > 0 ? 'red' : 'amber'
  const border = tone === 'red' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
  const iconColor = tone === 'red' ? 'text-red-600' : 'text-amber-600'
  const titleColor = tone === 'red' ? 'text-red-900' : 'text-amber-900'
  const bodyColor = tone === 'red' ? 'text-red-700' : 'text-amber-700'

  const grouped = ORDER.map(kind => ({ kind, items: issues.filter(i => i.kind === kind) })).filter(
    g => g.items.length > 0,
  )

  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <div className="flex-1">
          <p className={`font-medium ${titleColor}`}>
            {issues.length} hal yang perlu dicek sebelum disimpan
          </p>
          <p className={`text-sm ${bodyColor}`}>
            {needsDecision.length > 0
              ? `${needsDecision.length} di antaranya perlu keputusan Anda. `
              : ''}
            Ini hanya catatan — Anda tetap bisa menyimpan.
          </p>
        </div>
        {open ? (
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
        ) : (
          <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-black/10 pt-3">
          {grouped.map(({ kind, items }) => (
            <div key={kind} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={KIND_META[kind].tone === 'red' ? 'danger' : 'warning'}
                  className="text-[10px]"
                >
                  {kind === 'new_account' && <Sparkles className="mr-1 h-3 w-3" />}
                  {KIND_META[kind].label}
                </Badge>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <ul className="space-y-1.5">
                {items.map((issue, i) => (
                  <li key={`${kind}-${i}`} className="text-sm">
                    <IssueLine issue={issue} onRenameAccount={onRenameAccount} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IssueLine({ issue, onRenameAccount }: { issue: PnLIssue; onRenameAccount?: Props['onRenameAccount'] }) {
  const months = monthsLabel(issue.months)
  const meta = <span className="ml-1 text-xs text-muted-foreground">· {months}</span>

  if (issue.kind === 'merged') {
    const dropped = issue.labels.filter(l => l !== issue.kept)
    return (
      <span>
        {dropped.map(l => <code key={l} className="rounded bg-black/5 px-1">{l}</code>)}
        {' digabung ke '}
        <code className="rounded bg-black/5 px-1 font-medium">{issue.kept}</code>
        {onRenameAccount && issue.kept && dropped[0] && (
          <button
            type="button"
            className="ml-2 text-xs underline underline-offset-2 hover:no-underline"
            onClick={() => onRenameAccount(issue.kept!, dropped[0])}
          >
            pakai nama lama
          </button>
        )}
        {meta}
      </span>
    )
  }

  if (issue.kind === 'ambiguous') {
    return (
      <span>
        {issue.labels.map((l, i) => (
          <span key={l}>
            {i > 0 && ' dan '}
            <code className="rounded bg-black/5 px-1">{l}</code>
            {issue.amounts?.[i] != null && (
              <span className="text-xs"> ({formatCurrencyExact(issue.amounts[i])})</span>
            )}
          </span>
        ))}
        {' terlihat sebagai akun yang sama tapi keduanya berisi angka — tidak digabung. Periksa apakah ini memang dua akun berbeda.'}
        {meta}
      </span>
    )
  }

  if (issue.kind === 'similar') {
    return (
      <span>
        <code className="rounded bg-black/5 px-1">{issue.labels[0]}</code>
        {' dan '}
        <code className="rounded bg-black/5 px-1">{issue.labels[1]}</code>
        {' namanya mirip. Jika ini akun yang sama, samakan namanya.'}
        {onRenameAccount && (
          <button
            type="button"
            className="ml-2 text-xs underline underline-offset-2 hover:no-underline"
            onClick={() => onRenameAccount(issue.labels[1], issue.labels[0])}
          >
            samakan
          </button>
        )}
        {meta}
      </span>
    )
  }

  return (
    <span>
      <code className="rounded bg-black/5 px-1">{issue.labels[0]}</code>
      {' belum pernah dipakai di portfolio ini. Pastikan penempatannya benar.'}
      {meta}
    </span>
  )
}
