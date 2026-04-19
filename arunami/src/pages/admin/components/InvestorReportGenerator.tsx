import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { saveCommunication } from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { formatCurrencyExact, formatPercent, MONTH_NAMES_ID } from '@/lib/utils'
import { formatPeriod } from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ClipboardCopy, Printer, Mail } from 'lucide-react'
import type { AppUser, InvestorAllocation, FinancialData, PortfolioConfig, Portfolio } from '@/types'

interface PortfolioData {
  allocation: InvestorAllocation
  financial: FinancialData | null
  config: PortfolioConfig | null
  portfolio: Portfolio | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  investor: AppUser
  portfolioData: PortfolioData[]
}

interface ReportLine {
  portfolioName: string
  portfolioCode: string
  invested: number
  netProfit: number
  earnings: number
  monthlyROI: number
}

export default function InvestorReportGenerator({ open, onOpenChange, investor, portfolioData }: Props) {
  const { user: admin } = useAuthStore()
  const currentYear = new Date().getFullYear()
  const [month, setMonth] = useState(String(new Date().getMonth()))
  const [year, setYear] = useState(String(currentYear))
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(
    new Set(portfolioData.map(p => p.allocation.portfolioId)),
  )
  const [sending, setSending] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const periodKey = `${year}-${String(Number(month) + 1).padStart(2, '0')}`
  const periodLabel = formatPeriod(periodKey)

  const togglePortfolio = (id: string) => {
    setSelectedPortfolios(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const reportLines: ReportLine[] = portfolioData
    .filter(p => selectedPortfolios.has(p.allocation.portfolioId))
    .map(({ allocation, financial, config, portfolio: ptf }) => {
      let netProfit = 0
      let earnings = 0
      let monthlyROI = 0

      if (financial && config?.investorConfig && ptf) {
        const profitPoint = financial.profitData.find(d => d.month === periodKey)
        const revPoint = financial.revenueData.find(d => d.month === periodKey)
        netProfit = profitPoint?.aktual ?? 0

        const result = calculateDistribution({
          reportData: {
            period: periodKey,
            revenue: revPoint?.aktual ?? 0,
            netProfit,
            grossProfit: 0,
          },
          config: config.investorConfig,
          allocation,
          portfolio: ptf,
          isArunamiTeam: investor.isArunamiTeam,
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
      text += `   ROI Bulanan: ${formatPercent(line.monthlyROI)}\n\n`
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
        subject: `Laporan ${periodLabel}`,
        period: periodLabel,
        portfolioIds: reportLines.map(l => portfolioData.find(p => p.allocation.portfolioCode === l.portfolioCode)!.allocation.portfolioId),
        sentBy: admin!.uid,
      })
      toast.success('Laporan berhasil disalin ke clipboard')
      onOpenChange(false)
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

      printWindow.document.write(`
        <html>
        <head>
          <title>Laporan Investor - ${investor.displayName} - ${periodLabel}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1a1a1a; }
            h1 { color: #1e5f3f; font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 14px; color: #666; font-weight: normal; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f5f5f5; text-align: left; padding: 8px 12px; font-size: 12px; border-bottom: 2px solid #ddd; }
            td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #eee; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background: #f9fafb; }
            .footer { margin-top: 32px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <h1>Laporan Investor</h1>
          <h2>${investor.displayName} &mdash; ${periodLabel}</h2>
          <table>
            <thead>
              <tr>
                <th>Portofolio</th>
                <th class="text-right">Investasi</th>
                <th class="text-right">Net Profit</th>
                <th class="text-right">Earning</th>
                <th class="text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              ${reportLines.map(l => `
                <tr>
                  <td>${l.portfolioName} (${l.portfolioCode})</td>
                  <td class="text-right">${formatCurrencyExact(l.invested)}</td>
                  <td class="text-right">${formatCurrencyExact(l.netProfit)}</td>
                  <td class="text-right">${formatCurrencyExact(l.earnings)}</td>
                  <td class="text-right">${formatPercent(l.monthlyROI)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2">Total</td>
                <td class="text-right"></td>
                <td class="text-right">${formatCurrencyExact(totalEarnings)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">Diterbitkan oleh Tim Arunami</div>
        </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()

      await saveCommunication({
        investorUid: investor.uid,
        type: 'report',
        channel: 'download',
        subject: `Laporan ${periodLabel}`,
        period: periodLabel,
        portfolioIds: reportLines.map(l => portfolioData.find(p => p.allocation.portfolioCode === l.portfolioCode)!.allocation.portfolioId),
        sentBy: admin!.uid,
      })
      toast.success('Laporan siap dicetak/diunduh')
    } catch {
      toast.error('Gagal membuka halaman cetak')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Laporan — {investor.displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Period Selector */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bulan</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES_ID.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tahun</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Portfolio Selection */}
          <div className="space-y-2">
            <Label>Portofolio</Label>
            <div className="flex flex-wrap gap-2">
              {portfolioData.map(p => {
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
              <>
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
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
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
            <Button variant="outline" disabled title="Segera hadir">
              <Mail className="mr-1 h-4 w-4" />
              Kirim Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
