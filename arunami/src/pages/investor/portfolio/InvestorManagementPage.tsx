import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getManagementReports } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPeriod } from '@/lib/dateUtils'
import type { ManagementReport, IssueSeverity, ActionStatus, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const severityVariant = (s: IssueSeverity) =>
  s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'success'

const statusVariant = (s: ActionStatus) =>
  s === 'done' ? 'success' : s === 'in_progress' ? 'default' : 'outline'

export default function InvestorManagementPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [reports, setReports] = useState<ManagementReport[]>([])

  useEffect(() => {
    if (!portfolioId) return
    getManagementReports(portfolioId).then(data =>
      setReports(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
    )
  }, [portfolioId])

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Management Report</h2>

      {reports.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada management report</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{formatPeriod(r.period)}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.businessSummary}</p>
              </CardHeader>
              <CardContent>
                {r.issues.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">ISU</p>
                    <div className="space-y-1.5">
                      {r.issues.map(issue => (
                        <div key={issue.id} className="flex items-center gap-2">
                          <Badge variant={severityVariant(issue.severity)} className="capitalize">{issue.severity}</Badge>
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
                          <Badge variant={statusVariant(action.status)} className="capitalize">{action.status.replace('_', ' ')}</Badge>
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
