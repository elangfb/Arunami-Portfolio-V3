import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { calculateROI } from '@/lib/roi'
import { formatCurrencyExact, formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorReturnsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data return belum tersedia.</div>

  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  // Monthly breakdown
  const monthlyBreakdown = data.profitData.map(p => {
    const r = calculateROI(p.aktual, data.investorConfig)
    return { month: p.month, netProfit: p.aktual, returnPerSlot: r.returnPerSlot, monthlyROI: r.monthlyROI }
  })

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Return Saya</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Nominal / Slot', formatCurrencyCompact(data.investorConfig.nominalPerSlot)],
          ['Return / Slot (Bln Ini)', formatCurrencyCompact(roi.returnPerSlot)],
          ['Monthly ROI', formatPercent(roi.monthlyROI, true)],
          ['Annual ROI', formatPercent(roi.annualROI, true)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calculation table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Rincian Perhitungan (Bulan Terakhir)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {[
                ['Net Profit Bisnis', formatCurrencyExact(lastProfit)],
                [`Bagian Investor (${data.investorConfig.investorSharePercent}%)`, formatCurrencyExact(roi.investorShare)],
                [`Biaya Arunami (${data.investorConfig.arunamiFeePercent}%)`, `(${formatCurrencyExact(roi.arunamiFee)})`],
                ['Net untuk Investor', formatCurrencyExact(roi.netForInvestor)],
                [`Return per Slot (÷${data.investorConfig.totalSlots} slot)`, formatCurrencyExact(roi.returnPerSlot)],
                ['ROI Bulanan', formatPercent(roi.monthlyROI, true)],
                ['ROI Tahunan (×12)', formatPercent(roi.annualROI, true)],
              ].map(([label, value]) => (
                <tr key={label} className="hover:bg-muted/30">
                  <td className="py-2.5 text-muted-foreground">{label}</td>
                  <td className="py-2.5 text-right font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Monthly breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Riwayat Return Bulanan</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left py-2">Bulan</th>
                <th className="text-right py-2">Net Profit</th>
                <th className="text-right py-2">Return / Slot</th>
                <th className="text-right py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {monthlyBreakdown.map(row => (
                <tr key={row.month} className="border-b hover:bg-muted/30">
                  <td className="py-2.5 font-medium">{row.month}</td>
                  <td className="text-right py-2.5">{formatCurrencyCompact(row.netProfit)}</td>
                  <td className="text-right py-2.5">{formatCurrencyCompact(row.returnPerSlot)}</td>
                  <td className={`text-right py-2.5 font-medium ${row.monthlyROI >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.monthlyROI, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
