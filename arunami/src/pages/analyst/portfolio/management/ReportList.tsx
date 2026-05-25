import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Pencil, Trash2, PlusCircle } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import type { ManagementReport, IssueSeverity, ActionStatus } from '@/types'

const severityBadgeClass = (s: IssueSeverity) =>
  s === 'high'
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : s === 'medium'
    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'

const statusBadgeClass = (s: ActionStatus) =>
  s === 'done'
    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
    : s === 'in_progress'
    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
    : 'bg-muted text-foreground/80 hover:bg-muted/80'

const statusLabel = (s: ActionStatus) =>
  s === 'done' ? 'Done' : s === 'in_progress' ? 'In Progress' : 'Pending'

interface ReportListProps {
  reports: ManagementReport[]
  onBack: () => void
  onCreate: () => void
  onEdit: (report: ManagementReport) => void
  onDelete: (id: string) => void
  onPatchSeverity: (reportId: string, issueId: string, severity: IssueSeverity) => void
  onPatchStatus: (reportId: string, actionId: string, status: ActionStatus) => void
}

export function ReportList({
  reports, onBack, onCreate, onEdit, onDelete, onPatchSeverity, onPatchStatus,
}: ReportListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">Lihat Report</h2>
        </div>
        <Button size="sm" onClick={onCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />Buat Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Belum ada management report
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div>
                  <CardTitle className="text-base">{formatPeriod(r.period)}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.businessSummary}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(r)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {r.issues.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">ISU</p>
                    <div className="space-y-1.5">
                      {r.issues.map(issue => (
                        <div key={issue.id} className="flex items-center gap-2">
                          <Select value={issue.severity} onValueChange={v => onPatchSeverity(r.id, issue.id, v as IssueSeverity)}>
                            <SelectTrigger className={`h-6 w-20 rounded-full border-0 px-2.5 text-xs font-medium capitalize gap-1 [&>svg]:h-3 [&>svg]:w-3 ${severityBadgeClass(issue.severity)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm">{issue.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">ACTION ITEMS</p>
                    <div className="space-y-1.5">
                      {r.actionItems.map(action => (
                        <div key={action.id} className="flex items-center gap-2">
                          <Select value={action.status} onValueChange={v => onPatchStatus(r.id, action.id, v as ActionStatus)}>
                            <SelectTrigger className={`h-6 w-28 rounded-full border-0 px-2.5 text-xs font-medium gap-1 [&>svg]:h-3 [&>svg]:w-3 ${statusBadgeClass(action.status)}`}>
                              <span>{statusLabel(action.status)}</span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm">{action.title}</span>
                          {action.assignee && <span className="text-xs text-muted-foreground">· {action.assignee}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
