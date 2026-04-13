import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData, getAllocationsForInvestor, getPortfolioConfig } from '@/lib/firestore'
import { calculateInvestorROI } from '@/lib/roi'
import { formatCurrencyExact, formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, InvestorAllocation, SlotBasedConfig } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

export default function InvestorReturnsPage() {
  const { portfolioId, selectedPeriod, availablePeriods } = useOutletContext<InvestorPortfolioOutletContext>()
  const { user } = useAuthStore()
  const [data, setData] = useState<FinancialData | null>(null)
  const [allocation, setAllocation] = useState<InvestorAllocation | null>(null)
  const [slotConfig, setSlotConfig] = useState<SlotBasedConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId || !user) return
    Promise.all([
      getFinancialData(portfolioId),
      getAllocationsForInvestor(user.uid),
      getPortfolioConfig(portfolioId),
    ]).then(([d, allocs, config]) => {
      setData(d)
      setAllocation(allocs.find(a => a.portfolioId === portfolioId) ?? null)
      if (config?.investorConfig?.type === 'slot_based') {
        setSlotConfig(config.investorConfig as SlotBasedConfig)
      }
      setLoading(false)
    })
  }, [portfolioId, user])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data return belum tersedia.</div>
  if (availablePeriods.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          <p className="font-medium">Belum ada laporan yang diterbitkan.</p>
          <p className="mt-1 text-sm">Return akan muncul setelah analyst mempublikasikan laporan untuk akun Anda.</p>
        </div>
      </div>
    )
  }

  const mySlots = allocation?.slots ?? 0
  const totalSlots = slotConfig?.totalSlots ?? data.investorConfig.totalSlots
  const nominalPerSlot = slotConfig?.nominalPerSlot ?? data.investorConfig.nominalPerSlot
  const investorSharePct = slotConfig?.investorSharePercent ?? data.investorConfig.investorSharePercent
  const arunamiFeePct = slotConfig?.arunamiFeePercent ?? data.investorConfig.arunamiFeePercent

  const activePeriod = selectedPeriod || availablePeriods[0]
  const activeEntry = data.profitData.find(p => p.month === activePeriod)
  const lastProfit = activeEntry?.aktual ?? 0
  const periodLabel = formatPeriod(activePeriod)
  const myRoi = calculateInvestorROI(lastProfit, mySlots, totalSlots, investorSharePct, arunamiFeePct, nominalPerSlot)

  // Monthly breakdown — gated to only published periods
  const publishedSet = new Set(availablePeriods)
  const monthlyBreakdown = data.profitData
    .filter(p => publishedSet.has(p.month))
    .map(p => {
      const r = calculateInvestorROI(p.aktual, mySlots, totalSlots, investorSharePct, arunamiFeePct, nominalPerSlot)
      return { month: p.month, netProfit: p.aktual, myEarnings: r.earnings, monthlyROI: r.monthlyROI }
    })

  // Cumulative earnings
  const totalEarnings = monthlyBreakdown.reduce((sum, m) => sum + m.myEarnings, 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Return Saya</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Slot Saya', `${mySlots} / ${totalSlots}`],
          ['Investasi Saya', formatCurrencyCompact(allocation?.investedAmount ?? mySlots * nominalPerSlot)],
          [`Earning ${periodLabel}`, formatCurrencyCompact(myRoi.earnings)],
          ['Total Earning', formatCurrencyCompact(totalEarnings)],
          ['Kepemilikan', `${myRoi.ownershipPct.toFixed(1)}%`],
          ['Nominal / Slot', formatCurrencyCompact(nominalPerSlot)],
          ['Monthly ROI', formatPercent(myRoi.monthlyROI, true)],
          ['Annual ROI', formatPercent(myRoi.annualROI, true)],
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
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Rincian Perhitungan (Bulan Terakhir)</CardTitle>
            {allocation && <Badge variant="secondary">{mySlots} slot</Badge>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {[
                ['Net Profit Bisnis', formatCurrencyExact(lastProfit)],
                [`Bagian Investor (${investorSharePct}%)`, formatCurrencyExact(lastProfit * investorSharePct / 100)],
                [`Biaya Arunami (${arunamiFeePct}%)`, `(${formatCurrencyExact(lastProfit * investorSharePct / 100 * arunamiFeePct / 100)})`],
                ['Net untuk Semua Investor', formatCurrencyExact(lastProfit * investorSharePct / 100 * (1 - arunamiFeePct / 100))],
                [`Kepemilikan Saya (${mySlots}/${totalSlots} slot = ${myRoi.ownershipPct.toFixed(1)}%)`, ''],
                ['Earning Saya', formatCurrencyExact(myRoi.earnings)],
                ['ROI Bulanan', formatPercent(myRoi.monthlyROI, true)],
                ['ROI Tahunan (×12)', formatPercent(myRoi.annualROI, true)],
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
                <th className="text-right py-2">Net Profit Bisnis</th>
                <th className="text-right py-2">Earning Saya</th>
                <th className="text-right py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {monthlyBreakdown.map(row => (
                <tr key={row.month} className="border-b hover:bg-muted/30">
                  <td className="py-2.5 font-medium">{formatPeriod(row.month)}</td>
                  <td className="text-right py-2.5">{formatCurrencyCompact(row.netProfit)}</td>
                  <td className="text-right py-2.5">{formatCurrencyCompact(row.myEarnings)}</td>
                  <td className={`text-right py-2.5 font-medium ${row.monthlyROI >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.monthlyROI, true)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <td className="py-2.5">Total</td>
                <td className="text-right py-2.5">{formatCurrencyCompact(monthlyBreakdown.reduce((s, p) => s + p.netProfit, 0))}</td>
                <td className="text-right py-2.5">{formatCurrencyCompact(totalEarnings)}</td>
                <td className="text-right py-2.5">—</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
