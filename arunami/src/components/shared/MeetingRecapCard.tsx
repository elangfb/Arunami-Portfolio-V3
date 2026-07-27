import { toast } from 'sonner'
import { formatWeekLabel } from '@/lib/dateUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Copy, Trash2, ListChecks, ChevronDown, ChevronRight } from 'lucide-react'
import type { MeetingRecap } from '@/types'

/** "27 Jul 2026, 14.05" — when the recap was last written. */
function stamp(ts: MeetingRecap['updatedAt']): string {
  if (!ts) return '—'
  return new Date(ts.seconds * 1000).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * One weekly recap, collapsed to its week + freshness and expandable to the
 * full notulen. Shared by Mode Rapat's Recap agenda and the Recap Rapat page,
 * which differ only in whether the portfolio name needs showing.
 */
export function MeetingRecapCard({
  recap, portfolioLabel, open, onToggle, onDelete,
}: {
  recap: MeetingRecap
  /** Shown as a badge when the list spans more than one portfolio. */
  portfolioLabel?: string
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const pending = recap.actions?.filter(a => !a.done).length ?? 0

  const copy = async () => {
    try { await navigator.clipboard.writeText(recap.summary); toast.success('Recap disalin') }
    catch { toast.error('Gagal menyalin') }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <Button
          variant="ghost"
          onClick={onToggle}
          className="flex h-auto min-w-0 flex-1 items-center justify-start gap-2 px-1 py-1 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              {portfolioLabel && <Badge variant="outline">{portfolioLabel}</Badge>}
              <span className="truncate text-sm font-medium">{formatWeekLabel(recap.id)}</span>
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Diperbarui {stamp(recap.updatedAt)}
              {pending > 0 && ` · ${pending} action item terbuka`}
            </span>
          </span>
        </Button>
        <Button variant="ghost" size="icon" onClick={copy} className="h-8 w-8 shrink-0 text-muted-foreground">
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <CardContent className="space-y-3 border-t bg-muted/20 pt-4">
          <pre className="whitespace-pre-wrap text-sm">{recap.summary}</pre>
          {recap.actions?.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <ListChecks className="h-3.5 w-3.5" />Action Items
              </Label>
              {recap.actions.map((a, i) => (
                <p key={i} className={`text-sm ${a.done ? 'text-muted-foreground line-through' : ''}`}>
                  {a.done ? '✓' : '○'} {a.text}
                  {a.assignee && <span className="text-xs text-muted-foreground"> @{a.assignee}</span>}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
