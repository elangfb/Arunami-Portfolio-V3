import { useState, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { saveCommunication, publishAccumulatedReport } from '@/lib/firestore'
import type { InvestorPortfolioData } from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { buildAccumulatedReportHtml } from '@/lib/reportHtml'
import { formatCurrencyExact, formatPercent } from '@/lib/utils'
import { formatPeriod, buildQuarterKey, quarterToMonths, comparePeriods } from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ClipboardCopy, Printer, Send } from 'lucide-react'
import type { AppUser, FinancialData } from '@/types'

type PortfolioData = InvestorPortfolioData

interface Props {
  investor: AppUser
  portfolioData: PortfolioData[]
  /** Called after a report is successfully copied, printed, or published. */
  onDone?: () => void
}

interface ReportLine {
  portfolioName: string
  portfolioCode: string
  invested: number
  netProfit: number
  earnings: number
  monthlyROI: number
}

/** A month has reportable data if revenue or profit has a non-zero actual. */
function monthHasData(financial: FinancialData | null, month: string): boolean {
  if (!financial) return false
  const rev = financial.revenueData.find(d => d.month === month)?.aktual ?? 0
  const profit = financial.profitData.find(d => d.month === month)?.aktual ?? 0
  return rev !== 0 || profit !== 0
}

/** Quarter key (e.g. "2026-Q2") that a "YYYY-MM" month falls into. */
function monthToQuarterKey(month: string): string {
  const [y, mm] = month.split('-')
  return buildQuarterKey(y, Math.floor((Number(mm) - 1) / 3) + 1)
}

export default function InvestorReportForm({ investor, portfolioData, onDone }: Props) {
  const { user: admin } = useAuthStore()
  const [reportType, setReportType] = useState<'monthly' | 'quarterly'>('monthly')
  const [selectedPeriod, setSelectedPeriod] = useState('')  // '' = follow latest available
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(
    new Set(portfolioData.map(p => p.allocation.portfolioId)),
  )
  const [sending, setSending] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // Every month (across the investor's portfolios) that has actual data.
  const monthsWithData = useMemo(() => {
    const set = new Set<string>()
    for (const p of portfolioData) {
      if (!p.financial) continue
      for (const d of [...p.financial.revenueData, ...p.financial.profitData]) {
        if (d.aktual !== 0) set.add(d.month)
      }
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
  const monthsInPeriod = reportType === 'quarterly' ? 3 : 1
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

  // Only portfolios that actually have data in the selected period — a project
  // with no report for the month would otherwise show a misleading "0".
  const portfoliosInPeriod = portfolioData.filter(p =>
    constituentMonths.some(m => monthHasData(p.financial, m)),
  )

  const reportLines: ReportLine[] = portfoliosInPeriod
    .filter(p => selectedPortfolios.has(p.allocation.portfolioId))
    .map(({ allocation, financial, config, portfolio: ptf }) => {
      let netProfit = 0
      let earnings = 0
      let monthlyROI = 0

      if (financial && config?.investorConfig && ptf) {
        const monthlyProfits = constituentMonths.map(
          m => financial.profitData.find(d => d.month === m)?.aktual ?? 0,
        )
        const monthlyRevenue = constituentMonths.map(
          m => financial.revenueData.find(d => d.month === m)?.aktual ?? 0,
        )
        netProfit = monthlyProfits.reduce((s, v) => s + v, 0)
        const revenue = monthlyRevenue.reduce((s, v) => s + v, 0)

        const result = calculateDistribution({
          reportData: {
            period: periodKey,
            revenue,
            netProfit,
            grossProfit: 0,
          },
          config: config.investorConfig,
          allocation,
          portfolio: ptf,
          isArunamiTeam: investor.isArunamiTeam,
          monthsInPeriod,
          scheduleMonths: constituentMonths,
        })
        earnings = result.perInvestorAmount
        monthlyROI = result.roiPercent
      }

      return {
        portfolioName: allocation.portfolioName,
        portfolioCode: allocation.portfolioCode,
        invested: allocation.investedAmount,
        netProfit,
        earnings,
        monthlyROI,
      }
    })

  const totalEarnings = reportLines.reduce((s, l) => s + l.earnings, 0)
  const totalInvested = reportLines.reduce((s, l) => s + l.invested, 0)

  const buildPlainText = () => {
    let text = `LAPORAN INVESTOR - ${periodLabel}\n`
    text += `${'─'.repeat(40)}\n\n`
    text += `Yth. ${investor.displayName},\n\n`
    text += `Berikut adalah ringkasan investasi Anda untuk periode ${periodLabel}:\n\n`

    for (const line of reportLines) {
      text += `📊 ${line.portfolioName} (${line.portfolioCode})\n`
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

  const reportPortfolioIds = () =>
    reportLines.map(l => portfolioData.find(p => p.allocation.portfolioCode === l.portfolioCode)!.allocation.portfolioId)

  const handleCopy = async () => {
    setSending(true)
    try {
      await navigator.clipboard.writeText(buildPlainText())
      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'clipboard',
        subject: `Laporan ${periodLabel}`,
        period: periodLabel,
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

      printWindow.document.write(
        buildAccumulatedReportHtml({ investorName: investor.displayName, periodLabel, lines: reportLines }),
      )
      printWindow.document.close()
      printWindow.print()

      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'download',
        subject: `Laporan ${periodLabel}`,
        period: periodLabel,
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
      const html = buildAccumulatedReportHtml({
        investorName: investor.displayName,
        periodLabel,
        lines: reportLines,
      })
      await publishAccumulatedReport({
        investorUid: investor.uid,
        investorName: investor.displayName,
        period: periodKey,
        reportType,
        htmlContent: html,
        publishedBy: admin!.uid,
      })
      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'publish',
        subject: `Laporan Semua Proyek ${periodLabel}`,
        period: periodLabel,
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
          <Select value={reportType} onValueChange={v => setReportType(v as 'monthly' | 'quarterly')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="quarterly">Kuartalan</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      </div>

      {availablePeriods.length === 0 && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Belum ada data finansial aktual untuk investor ini, sehingga laporan belum dapat dibuat.
        </p>
      )}

      {/* Portfolio Selection — only projects with data in the selected period */}
      {portfoliosInPeriod.length > 0 && (
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

      {/* Preview */}
      <div ref={reportRef} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Preview Laporan</p>
          <Badge variant="outline">{periodLabel}</Badge>
        </div>

        {reportLines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Pilih minimal satu portofolio
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Portofolio</th>
                  <th className="text-right py-2 px-3 font-medium">Net Profit</th>
                  <th className="text-right py-2 px-3 font-medium">Earning</th>
                  <th className="text-right py-2 px-3 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reportLines.map(line => (
                  <tr key={line.portfolioCode}>
                    <td className="py-2 px-3">
                      <p className="font-medium">{line.portfolioName}</p>
                      <p className="text-xs text-muted-foreground">{line.portfolioCode}</p>
                    </td>
                    <td className="py-2 px-3 text-right">{formatCurrencyExact(line.netProfit)}</td>
                    <td className="py-2 px-3 text-right font-medium">{formatCurrencyExact(line.earnings)}</td>
                    <td className="py-2 px-3 text-right">{formatPercent(line.monthlyROI)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-medium">
                  <td className="py-2 px-3" colSpan={2}>Total</td>
                  <td className="py-2 px-3 text-right">{formatCurrencyExact(totalEarnings)}</td>
                  <td className="py-2 px-3 text-right"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleCopy}
          disabled={reportLines.length === 0 || sending}
        >
          <ClipboardCopy className="mr-1 h-4 w-4" />
          Salin ke Clipboard
        </Button>
        <Button
          variant="outline"
          onClick={handlePrint}
          disabled={reportLines.length === 0 || sending}
        >
          <Printer className="mr-1 h-4 w-4" />
          Cetak / Unduh
        </Button>
        <Button
          onClick={handlePublish}
          disabled={reportLines.length === 0 || sending}
          title="Terbitkan laporan ringkasan ke landing page investor"
        >
          <Send className="mr-1 h-4 w-4" />
          Terbitkan ke Investor
        </Button>
      </div>
    </div>
  )
}
