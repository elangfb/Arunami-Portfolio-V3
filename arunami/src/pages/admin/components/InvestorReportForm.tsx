import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { saveCommunication, publishAccumulatedReport, publishAllTimeReport } from '@/lib/firestore'
import type { InvestorReportSource } from '@/lib/firestore'
import { buildInvestorReportSections, assembleAccumulatedReportHtml, assembleAllTimeReportHtml } from '@/lib/reportHtml'
import type { AccumulatedReportLine } from '@/lib/reportHtml'
import { computeAllTimeReport } from '@/lib/allTimeReport'
import { formatCurrencyExact, formatPercent } from '@/lib/utils'
import { makeBrandResolver } from '@/lib/portfolioName'
import { formatPeriod, buildQuarterKey, quarterToMonths, comparePeriods } from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ClipboardCopy, Printer, Send } from 'lucide-react'
import type { AppUser, InvestorReportDoc, Portfolio } from '@/types'

interface Props {
  investor: AppUser
  portfolioData: InvestorReportSource[]
  /** The investor's published reports — drives which periods count toward all-time. */
  publishedReports: InvestorReportDoc[]
  /** Called after a report is successfully copied, printed, or published. */
  onDone?: () => void
}

/** Quarter key (e.g. "2026-Q2") that a "YYYY-MM" month falls into. */
function monthToQuarterKey(month: string): string {
  const [y, mm] = month.split('-')
  return buildQuarterKey(y, Math.floor((Number(mm) - 1) / 3) + 1)
}

export default function InvestorReportForm({ investor, portfolioData, publishedReports, onDone }: Props) {
  const { user: admin } = useAuthStore()
  const resolveBrand = useMemo(
    () => makeBrandResolver(portfolioData.map(p => p.portfolio).filter((x): x is Portfolio => !!x)),
    [portfolioData],
  )
  const [reportType, setReportType] = useState<'monthly' | 'quarterly' | 'alltime'>('monthly')
  const [selectedPeriod, setSelectedPeriod] = useState('')  // '' = follow latest available
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(
    new Set(portfolioData.map(p => p.allocation.portfolioId)),
  )
  const [sending, setSending] = useState(false)

  // Months that have an uploaded P&L across the investor's portfolios.
  const monthsWithData = useMemo(() => {
    const set = new Set<string>()
    for (const p of portfolioData) {
      for (const r of p.pnlReports) if (r.period) set.add(r.period)
    }
    return [...set].sort((a, b) => comparePeriods(b, a)) // newest first
  }, [portfolioData])

  // Periods offered in the chooser for the current report type — only ones with data.
  const availablePeriods = useMemo(() => {
    if (reportType === 'monthly') return monthsWithData
    const quarters = new Set<string>()
    for (const m of monthsWithData) quarters.add(monthToQuarterKey(m))
    return [...quarters].sort((a, b) => comparePeriods(b, a))
  }, [reportType, monthsWithData])

  // Default to the latest available period until the user explicitly picks one.
  const periodKey = availablePeriods.includes(selectedPeriod)
    ? selectedPeriod
    : (availablePeriods[0] ?? '')
  const periodLabel = periodKey ? formatPeriod(periodKey) : '—'
  const constituentMonths = !periodKey
    ? []
    : reportType === 'quarterly'
      ? quarterToMonths(periodKey)
      : [periodKey]

  const togglePortfolio = (id: string) => {
    setSelectedPortfolios(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Only portfolios that actually have a P&L in the selected period.
  const portfoliosInPeriod = portfolioData.filter(p =>
    p.portfolio && p.pnlReports.some(r => constituentMonths.includes(r.period)),
  )

  // Detailed per-portfolio sections (the heavy build) for the selected period & portfolios.
  const sections = useMemo(() => {
    const months = !periodKey
      ? []
      : reportType === 'quarterly' ? quarterToMonths(periodKey) : [periodKey]
    return portfolioData
      .filter(p =>
        p.portfolio &&
        selectedPortfolios.has(p.allocation.portfolioId) &&
        p.pnlReports.some(r => months.includes(r.period)),
      )
      .map(p => buildInvestorReportSections({
        portfolio: p.portfolio!,
        config: p.config ?? undefined,
        allocation: p.allocation,
        investorSharePercent: p.investorSharePercent,
        isArunamiTeam: investor.isArunamiTeam,
        period: periodKey,
        pnlReports: p.pnlReports,
        projectionReports: p.projReports,
        managementReports: p.mgmtReports,
        notes: p.notes,
      }))
  }, [portfolioData, periodKey, reportType, selectedPortfolios, investor])

  const lines = sections.map(s => s.line).filter((l): l is AccumulatedReportLine => l != null)
  const totalEarnings = lines.reduce((s, l) => s + l.earnings, 0)
  const totalInvested = lines.reduce((s, l) => s + l.invested, 0)

  const isAllTime = reportType === 'alltime'

  // Lifetime summary across all portfolios & all published periods.
  const allTimeSummary = useMemo(
    () => computeAllTimeReport({
      investorName: investor.displayName,
      sources: portfolioData,
      publishedReports,
      isArunamiTeam: investor.isArunamiTeam,
    }),
    [investor, portfolioData, publishedReports],
  )

  const reportHtml = useMemo(
    () => isAllTime
      ? assembleAllTimeReportHtml(allTimeSummary)
      : assembleAccumulatedReportHtml({ investorName: investor.displayName, periodLabel, sections }),
    [isAllTime, allTimeSummary, investor, periodLabel, sections],
  )

  const hasContent = isAllTime ? allTimeSummary.lines.length > 0 : sections.length > 0

  const codeToPortfolioId = (code: string) =>
    portfolioData.find(p => p.allocation.portfolioCode === code)?.allocation.portfolioId

  const reportPortfolioIds = () =>
    (isAllTime ? allTimeSummary.lines : lines)
      .map(l => codeToPortfolioId(l.portfolioCode))
      .filter((id): id is string => Boolean(id))

  // Coverage label + communication metadata that differ for the all-time report.
  const coverageLabel = allTimeSummary.coverage.firstMonth && allTimeSummary.coverage.latestMonth
    ? `${formatPeriod(allTimeSummary.coverage.firstMonth)} – ${formatPeriod(allTimeSummary.coverage.latestMonth)}`
    : '—'
  const commSubject = isAllTime ? 'Laporan Sepanjang Waktu' : `Laporan ${periodLabel}`
  const commPeriod = isAllTime ? 'ALL_TIME' : periodLabel

  const buildPlainText = () => {
    if (isAllTime) {
      const s = allTimeSummary
      let text = `LAPORAN SEPANJANG WAKTU\n${'─'.repeat(40)}\n\n`
      text += `Yth. ${investor.displayName},\n\n`
      text += `Ringkasan kinerja seluruh investasi Anda (${coverageLabel}):\n\n`
      for (const l of s.lines) {
        text += `📊 ${resolveBrand({ ptName: l.portfolioName })} (${l.portfolioCode})\n`
        text += `   Investasi: ${formatCurrencyExact(l.invested)}\n`
        text += `   Earning Kumulatif: ${formatCurrencyExact(l.cumulativeEarnings)}\n`
        text += `   ROI All-Time: ${formatPercent(l.allTimeROI)}\n\n`
      }
      text += `${'─'.repeat(40)}\n`
      text += `TOTAL EARNING: ${formatCurrencyExact(s.totalCumulativeEarnings)}\n`
      text += `TOTAL INVESTASI: ${formatCurrencyExact(s.totalInvested)}\n\n`
      text += `Terima kasih atas kepercayaan Anda.\n— Tim Arunami`
      return text
    }

    let text = `LAPORAN INVESTOR - ${periodLabel}\n`
    text += `${'─'.repeat(40)}\n\n`
    text += `Yth. ${investor.displayName},\n\n`
    text += `Berikut adalah ringkasan investasi Anda untuk periode ${periodLabel}:\n\n`

    for (const line of lines) {
      text += `📊 ${resolveBrand({ ptName: line.portfolioName })} (${line.portfolioCode})\n`
      text += `   Investasi: ${formatCurrencyExact(line.invested)}\n`
      text += `   Net Profit: ${formatCurrencyExact(line.netProfit)}\n`
      text += `   Earning Anda: ${formatCurrencyExact(line.earnings)}\n`
      text += `   ROI Periode: ${formatPercent(line.monthlyROI)}\n\n`
    }

    text += `${'─'.repeat(40)}\n`
    text += `TOTAL EARNING: ${formatCurrencyExact(totalEarnings)}\n`
    text += `TOTAL INVESTASI: ${formatCurrencyExact(totalInvested)}\n\n`
    text += `Terima kasih atas kepercayaan Anda.\n`
    text += `— Tim Arunami`

    return text
  }

  const handleCopy = async () => {
    setSending(true)
    try {
      await navigator.clipboard.writeText(buildPlainText())
      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'clipboard',
        subject: commSubject,
        period: commPeriod,
        portfolioIds: reportPortfolioIds(),
        sentBy: admin!.uid,
      })
      toast.success('Laporan berhasil disalin ke clipboard')
      onDone?.()
    } catch {
      toast.error('Gagal menyalin ke clipboard')
    } finally {
      setSending(false)
    }
  }

  const handlePrint = async () => {
    setSending(true)
    try {
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
        return
      }

      printWindow.document.write(reportHtml)
      printWindow.document.close()
      printWindow.print()

      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'download',
        subject: commSubject,
        period: commPeriod,
        portfolioIds: reportPortfolioIds(),
        sentBy: admin!.uid,
      })
      toast.success('Laporan siap dicetak/diunduh')
    } catch {
      toast.error('Gagal membuka halaman cetak')
    } finally {
      setSending(false)
    }
  }

  const handlePublish = async () => {
    setSending(true)
    try {
      if (isAllTime) {
        await publishAllTimeReport({
          investorUid: investor.uid,
          investorName: investor.displayName,
          htmlContent: reportHtml,
          publishedBy: admin!.uid,
          coverageFirst: allTimeSummary.coverage.firstMonth ?? undefined,
          coverageLatest: allTimeSummary.coverage.latestMonth ?? undefined,
        })
      } else {
        await publishAccumulatedReport({
          investorUid: investor.uid,
          investorName: investor.displayName,
          period: periodKey,
          reportType: reportType as 'monthly' | 'quarterly',
          htmlContent: reportHtml,
          publishedBy: admin!.uid,
        })
      }
      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'publish',
        subject: isAllTime ? 'Laporan Sepanjang Waktu' : `Laporan Semua Proyek ${periodLabel}`,
        period: commPeriod,
        portfolioIds: reportPortfolioIds(),
        sentBy: admin!.uid,
      })
      toast.success('Laporan diterbitkan ke landing page investor')
      onDone?.()
    } catch {
      toast.error('Gagal menerbitkan laporan')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Period Selector — only periods that actually have data */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipe Laporan</Label>
          <Select value={reportType} onValueChange={v => setReportType(v as 'monthly' | 'quarterly' | 'alltime')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="quarterly">Kuartalan</SelectItem>
              <SelectItem value="alltime">Sepanjang Waktu (All-Time)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!isAllTime && (
          <div className="space-y-2">
            <Label>Periode</Label>
            <Select
              value={periodKey}
              onValueChange={setSelectedPeriod}
              disabled={availablePeriods.length === 0}
            >
              <SelectTrigger><SelectValue placeholder="Belum ada data" /></SelectTrigger>
              <SelectContent>
                {availablePeriods.map(p => (
                  <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isAllTime ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Laporan sepanjang waktu mengakumulasi kinerja seluruh proyek dari semua periode
          yang sudah diterbitkan ({coverageLabel}).
        </p>
      ) : availablePeriods.length === 0 && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Belum ada data P&amp;L untuk investor ini, sehingga laporan belum dapat dibuat.
        </p>
      )}

      {/* Portfolio Selection — only projects with data in the selected period */}
      {!isAllTime && portfoliosInPeriod.length > 0 && (
        <div className="space-y-2">
          <Label>Portofolio</Label>
          <div className="flex flex-wrap gap-2">
            {portfoliosInPeriod.map(p => {
              const isSelected = selectedPortfolios.has(p.allocation.portfolioId)
              return (
                <Badge
                  key={p.allocation.portfolioId}
                  variant={isSelected ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => togglePortfolio(p.allocation.portfolioId)}
                >
                  {p.allocation.portfolioCode}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview — full detailed report (per-portfolio pages + summary at the end) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Preview Laporan</p>
          <Badge variant="outline">{isAllTime ? 'Sepanjang Waktu' : periodLabel}</Badge>
        </div>

        {!isAllTime && sections.length === 0 ? (
          <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
            Pilih minimal satu portofolio dengan data untuk periode ini
          </p>
        ) : (
          <iframe
            title="Preview Laporan Investor"
            srcDoc={reportHtml}
            sandbox=""
            className="w-full min-h-[600px] rounded-lg border bg-white"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleCopy}
          disabled={!hasContent || sending}
        >
          <ClipboardCopy className="mr-1 h-4 w-4" />
          Salin ke Clipboard
        </Button>
        <Button
          variant="outline"
          onClick={handlePrint}
          disabled={!hasContent || sending}
        >
          <Printer className="mr-1 h-4 w-4" />
          Cetak / Unduh
        </Button>
        <Button
          onClick={handlePublish}
          disabled={!hasContent || sending}
          title="Terbitkan laporan ringkasan ke landing page investor"
        >
          <Send className="mr-1 h-4 w-4" />
          Terbitkan ke Investor
        </Button>
      </div>
    </div>
  )
}
