import { useState } from 'react'
import { toast } from 'sonner'
import { formatPeriod } from '@/lib/dateUtils'
import { MONTH_NAMES_ID } from '@/lib/utils'
import { unpublishAccumulatedReport, unpublishAllTimeReport } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, Undo2 } from 'lucide-react'
import type { InvestorReportDoc } from '@/types'

interface Props {
  reports: InvestorReportDoc[]
  /**
   * DF-07: when provided, accumulated/all-time reports get a "Tarik" (unpublish)
   * action. Called after a successful unpublish so the parent can refresh.
   */
  onChanged?: () => void | Promise<void>
}

function formatReportDate(report: InvestorReportDoc) {
  if (!report.publishedAt?.toDate) return '—'
  const d = report.publishedAt.toDate()
  return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`
}

/** Period label — all-time reports show their coverage range instead of a single period. */
function reportPeriodLabel(r: InvestorReportDoc): string {
  if (r.scope === 'all_time') {
    return r.coverageFirst && r.coverageLatest
      ? `${formatPeriod(r.coverageFirst)} – ${formatPeriod(r.coverageLatest)}`
      : 'Sepanjang Waktu'
  }
  return formatPeriod(r.period)
}

function reportTypeLabel(r: InvestorReportDoc): string {
  if (r.scope === 'all_time') return 'All-Time'
  return r.reportType === 'quarterly' ? 'Kuartalan' : 'Bulanan'
}

function reportScopeLabel(r: InvestorReportDoc): string {
  return r.scope === 'accumulated' || r.scope === 'all_time' ? 'Semua Portofolio' : r.portfolioName
}

export default function InvestorReportHistory({ reports, onChanged }: Props) {
  const [viewReport, setViewReport] = useState<InvestorReportDoc | null>(null)
  const [unpublishing, setUnpublishing] = useState<string | null>(null)

  // Only accumulated/all-time reports are unpublishable here; per-portfolio
  // reports have their own unpublish in the analyst PublishingPage.
  const canUnpublish = (r: InvestorReportDoc) =>
    !!onChanged && (r.scope === 'accumulated' || r.scope === 'all_time')

  const handleUnpublish = async (r: InvestorReportDoc) => {
    if (!window.confirm(`Tarik laporan "${reportPeriodLabel(r)}" dari investor? Mereka tidak akan melihatnya lagi sampai dipublikasikan ulang.`)) return
    setUnpublishing(r.id)
    try {
      if (r.scope === 'all_time') {
        await unpublishAllTimeReport({ investorUid: r.investorUid })
      } else {
        await unpublishAccumulatedReport({ investorUid: r.investorUid, period: r.period })
      }
      toast.success('Laporan ditarik dari investor')
      await onChanged?.()
    } catch {
      toast.error('Gagal menarik laporan')
    } finally {
      setUnpublishing(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Laporan ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada laporan
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Periode</th>
                    <th className="text-left py-2.5 px-3 font-medium">Tipe</th>
                    <th className="text-left py-2.5 px-3 font-medium">Portofolio</th>
                    <th className="text-left py-2.5 px-3 font-medium">Tanggal Terbit</th>
                    <th className="text-right py-2.5 px-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reports.map(r => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-medium">{reportPeriodLabel(r)}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline">{reportTypeLabel(r)}</Badge>
                      </td>
                      <td className="py-2.5 px-3">{reportScopeLabel(r)}</td>
                      <td className="py-2.5 px-3">{formatReportDate(r)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewReport(r)}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Lihat
                          </Button>
                          {canUnpublish(r) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-600 hover:text-amber-700"
                              disabled={unpublishing === r.id}
                              onClick={() => handleUnpublish(r)}
                            >
                              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                              {unpublishing === r.id ? 'Menarik…' : 'Tarik'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Viewer Dialog */}
      <Dialog open={!!viewReport} onOpenChange={(o) => !o && setViewReport(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {viewReport && `${reportScopeLabel(viewReport)} — ${reportPeriodLabel(viewReport)}`}
            </DialogTitle>
          </DialogHeader>
          {viewReport && (
            <iframe
              title={`Report ${viewReport.id}`}
              srcDoc={viewReport.htmlContent}
              sandbox=""
              className="w-full min-h-[70vh] rounded-md border bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
