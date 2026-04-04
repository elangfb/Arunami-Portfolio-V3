import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { calculateROI } from '@/lib/roi'
import { formatCurrencyExact, formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorReportPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  const handleDownload = () => {
    if (!data || !portfolio) return
    const lastProfit = data.profitData.at(-1)?.aktual ?? 0
    const lastRevenue = data.revenueData.at(-1)?.aktual ?? 0
    const roi = calculateROI(lastProfit, data.investorConfig)
    const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

    const content = `
=====================================
   LAPORAN PORTOFOLIO ARUNAMI
=====================================
Tanggal Unduh   : ${now}
Investor        : ${user?.displayName}
-------------------------------------
INFORMASI PORTOFOLIO
-------------------------------------
Nama            : ${portfolio.name}
Kode            : ${portfolio.code}
Tahap           : ${portfolio.stage}
Periode         : ${portfolio.periode}
Investasi Awal  : ${formatCurrencyExact(portfolio.investasiAwal)}
-------------------------------------
KINERJA KEUANGAN (BULAN TERAKHIR)
-------------------------------------
Revenue         : ${formatCurrencyExact(lastRevenue)}
Net Profit      : ${formatCurrencyExact(lastProfit)}
-------------------------------------
PERHITUNGAN RETURN INVESTOR
-------------------------------------
Total Slot      : ${data.investorConfig.totalSlots}
Nominal / Slot  : ${formatCurrencyExact(data.investorConfig.nominalPerSlot)}
Investor Share  : ${data.investorConfig.investorSharePercent}%
Biaya Arunami   : ${data.investorConfig.arunamiFeePercent}%

Bagian Investor : ${formatCurrencyExact(roi.investorShare)}
Biaya Arunami   : (${formatCurrencyExact(roi.arunamiFee)})
Net Investor    : ${formatCurrencyExact(roi.netForInvestor)}
Return / Slot   : ${formatCurrencyExact(roi.returnPerSlot)}
Monthly ROI     : ${formatPercent(roi.monthlyROI, true)}
Annual ROI      : ${formatPercent(roi.annualROI, true)}
-------------------------------------
Dokumen ini digenerate secara otomatis oleh ARUNAMI Platform.
=====================================
`.trim()

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laporan-${portfolio.code}-${now.replace(/ /g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data belum tersedia untuk di-download.</div>

  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const lastRevenue = data.revenueData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Download Laporan</h2>

      <Card>
        <CardHeader><CardTitle className="text-sm">Pratinjau Laporan</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y">
            {[
              ['Portofolio', portfolio?.name ?? '-'],
              ['Investor', user?.displayName ?? '-'],
              ['Revenue (Bln Ini)', formatCurrencyCompact(lastRevenue)],
              ['Net Profit (Bln Ini)', formatCurrencyCompact(lastProfit)],
              ['Return / Slot', formatCurrencyCompact(roi.returnPerSlot)],
              ['Monthly ROI', formatPercent(roi.monthlyROI, true)],
              ['Annual ROI', formatPercent(roi.annualROI, true)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Button onClick={handleDownload} className="w-full" size="lg">
        <Download className="mr-2 h-5 w-5" />
        Download Laporan (.txt)
      </Button>
    </div>
  )
}
