import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getPublishedInvestorReports, markInvestorReportRead, markInvestorReportsRead } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, Infinity as InfinityIcon, CalendarRange, CheckCheck } from 'lucide-react'
import type { InvestorReportDoc } from '@/types'

type View = 'alltime' | 'periodik'

/** Open a report's self-contained HTML in a new window and trigger print/save-as-PDF. */
function printReport(html: string) {
  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Popup diblokir. Izinkan popup untuk mengunduh.')
    return
  }
  w.document.write(html)
  w.document.close()
  w.print()
}

export default function InvestorReportsPage() {
  const { user } = useAuthStore()
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [userView, setUserView] = useState<View | null>(null) // null until the user picks
  const [accPeriod, setAccPeriod] = useState('') // '' = follow latest published period

  useEffect(() => {
    if (!user) return
    getPublishedInvestorReports(user.uid).then(r => {
      setReports(r)
      setLoading(false)
    })
  }, [user])

  const allTimeReport = useMemo(
    () => reports.find(r => r.scope === 'all_time') ?? null,
    [reports],
  )
  const accumulatedReports = useMemo(
    () =>
      reports
        .filter(r => r.scope === 'accumulated')
        .sort((a, b) => comparePeriods(b.period, a.period)),
    [reports],
  )

  // Default to the All-Time view when one exists, until the user picks otherwise.
  const view: View = userView ?? (allTimeReport ? 'alltime' : 'periodik')

  const effectivePeriod = accPeriod || accumulatedReports[0]?.period || ''
  const selectedAccReport = accumulatedReports.find(r => r.period === effectivePeriod) ?? null

  // Reports surfaced on this page (all-projects: accumulated + all-time).
  const shownReports = useMemo(
    () => reports.filter(r => r.scope === 'accumulated' || r.scope === 'all_time'),
    [reports],
  )
  const unreadCount = useMemo(() => shownReports.filter(r => !r.isRead).length, [shownReports])

  // Optimistically flip a report to read locally, then persist.
  function markReadLocal(id: string) {
    setReports(prev => prev.map(r => (r.id === id ? { ...r, isRead: true } : r)))
    markInvestorReportRead(id).catch(err => console.error('markInvestorReportRead failed', err))
  }

  async function markAllRead() {
    const ids = shownReports.filter(r => !r.isRead).map(r => r.id)
    if (ids.length === 0) return
    setReports(prev => prev.map(r => (ids.includes(r.id) ? { ...r, isRead: true } : r)))
    try {
      await markInvestorReportsRead(ids)
    } catch (err) {
      console.error('markInvestorReportsRead failed', err)
      toast.error('Gagal menandai laporan')
    }
  }

  // Opening a report (rendered in the iframe) counts as reading it.
  const displayedReport = view === 'alltime' ? allTimeReport : selectedAccReport
  useEffect(() => {
    if (displayedReport && !displayedReport.isRead) markReadLocal(displayedReport.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedReport?.id])

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Laporan Saya</h1>
              {unreadCount > 0 && (
                <Badge variant="warning">{unreadCount} belum dibaca</Badge>
              )}
            </div>
            <p className="text-muted-foreground">Ringkasan kinerja investasi Anda di seluruh proyek</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="shrink-0">
              <CheckCheck className="mr-1 h-4 w-4" />Tandai semua dibaca
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div className="inline-flex rounded-lg border p-1">
          <Button
            variant={view === 'alltime' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setUserView('alltime')}
          >
            <InfinityIcon className="mr-1.5 h-4 w-4" />Sepanjang Waktu
          </Button>
          <Button
            variant={view === 'periodik' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setUserView('periodik')}
          >
            <CalendarRange className="mr-1.5 h-4 w-4" />Bulanan / Kuartalan
          </Button>
        </div>

        {loading ? (
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        ) : view === 'alltime' ? (
          <Card className="border-[#1e5f3f]/30">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Laporan Sepanjang Waktu</CardTitle>
                {allTimeReport && (
                  <Button size="sm" onClick={() => printReport(allTimeReport.htmlContent)}>
                    <Printer className="mr-1 h-4 w-4" />Unduh / Cetak
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Akumulasi kinerja seluruh proyek Anda dari awal hingga laporan terbaru.
              </p>
            </CardHeader>
            <CardContent>
              {allTimeReport ? (
                <iframe
                  title="All-time report"
                  srcDoc={allTimeReport.htmlContent}
                  sandbox=""
                  className="w-full min-h-[800px] rounded-md border bg-white"
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Laporan sepanjang waktu belum diterbitkan untuk akun Anda.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#1e5f3f]/30">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Laporan Periodik</CardTitle>
                {accumulatedReports.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={effectivePeriod} onValueChange={setAccPeriod}>
                      <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {accumulatedReports.map(r => (
                          <SelectItem key={r.id} value={r.period}>{formatPeriod(r.period)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => selectedAccReport && printReport(selectedAccReport.htmlContent)} disabled={!selectedAccReport}>
                      <Printer className="mr-1 h-4 w-4" />Unduh / Cetak
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Ringkasan kinerja seluruh proyek Anda untuk setiap periode, diterbitkan oleh Tim Arunami.
              </p>
            </CardHeader>
            <CardContent>
              {selectedAccReport ? (
                <iframe
                  title={`Accumulated report ${selectedAccReport.id}`}
                  srcDoc={selectedAccReport.htmlContent}
                  sandbox=""
                  className="w-full min-h-[800px] rounded-md border bg-white"
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Belum ada laporan periodik yang diterbitkan untuk akun Anda.
                </p>
              )}
            </CardContent>
          </Card>
        )}
    </main>
  )
}
