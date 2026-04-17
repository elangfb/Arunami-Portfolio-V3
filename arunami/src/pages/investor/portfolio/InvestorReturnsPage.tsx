import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData, getAllocationsForInvestor, getPortfolioConfig } from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import type { DistributionResult } from '@/lib/distributionStrategies'
import { formatCurrencyExact, formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, InvestorAllocation, PortfolioConfig } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

export default function InvestorReturnsPage() {
  const { portfolio, portfolioId, selectedPeriod, availablePeriods } = useOutletContext<InvestorPortfolioOutletContext>()
  const { user } = useAuthStore()
  const [data, setData] = useState<FinancialData | null>(null)
  const [allocation, setAllocation] = useState<InvestorAllocation | null>(null)
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId || !user) return
    Promise.all([
      getFinancialData(portfolioId),
      getAllocationsForInvestor(user.uid),
      getPortfolioConfig(portfolioId),
    ]).then(([d, allocs, cfg]) => {
      setData(d)
      setAllocation(allocs.find(a => a.portfolioId === portfolioId) ?? null)
      setConfig(cfg)
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

  const activePeriod = selectedPeriod || availablePeriods[0]
  const activeEntry = data.profitData.find(p => p.month === activePeriod)
  const activeRev = data.revenueData.find(r => r.month === activePeriod)
  const lastProfit = activeEntry?.aktual ?? 0
  const lastRevenue = activeRev?.aktual ?? 0
  const periodLabel = formatPeriod(activePeriod)

  // Calculate distribution for active period
  let myResult: DistributionResult | null = null
  if (allocation && portfolio && config?.investorConfig) {
    myResult = calculateDistribution({
      reportData: { period: activePeriod, revenue: lastRevenue, netProfit: lastProfit, grossProfit: 0 },
      config: config.investorConfig,
      allocation,
      portfolio,
      isArunamiTeam: user?.isArunamiTeam,
    })
  }

  const ownershipPct = allocation?.ownershipPercent
    ?? (portfolio && portfolio.investasiAwal > 0 && allocation
      ? (allocation.investedAmount / portfolio.investasiAwal) * 100
      : 0)

  // Monthly breakdown — gated to only published periods
  const publishedSet = new Set(availablePeriods)
  const monthlyBreakdown = data.profitData
    .filter(p => publishedSet.has(p.month))
    .map(p => {
      const revP = data.revenueData.find(r => r.month === p.month)
      let result: DistributionResult | null = null
      if (allocation && portfolio && config?.investorConfig) {
        result = calculateDistribution({
          reportData: { period: p.month, revenue: revP?.aktual ?? 0, netProfit: p.aktual, grossProfit: 0 },
          config: config.investorConfig,
          allocation,
          portfolio,
          isArunamiTeam: user?.isArunamiTeam,
        })
      }
      return {
        month: p.month,
        netProfit: p.aktual,
        myEarnings: result?.perInvestorAmount ?? 0,
        monthlyROI: result?.roiPercent ?? 0,
      }
    })

  const totalEarnings = monthlyBreakdown.reduce((sum, m) => sum + m.myEarnings, 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Return Saya</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Kepemilikan', `${ownershipPct.toFixed(1)}%`],
          ['Investasi Saya', formatCurrencyCompact(allocation?.investedAmount ?? 0)],
          [`Earning ${periodLabel}`, formatCurrencyCompact(myResult?.perInvestorAmount ?? 0)],
          ['Total Earning', formatCurrencyCompact(totalEarnings)],
          ['Model Distribusi', config?.investorConfig ? myResult?.label ?? '-' : '-'],
          ['Monthly ROI', formatPercent(myResult?.roiPercent ?? 0, true)],
          ['Annual ROI', formatPercent(myResult?.annualRoiPercent ?? 0, true)],
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
            <CardTitle className="text-sm">Rincian Perhitungan ({periodLabel})</CardTitle>
            {myResult && <Badge variant="secondary">{myResult.label}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {myResult ? (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {Object.entries(myResult.breakdown).map(([key, val]) => (
                  <tr key={key} className="hover:bg-muted/30">
                    <td className="py-2.5 text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 text-right font-medium">
                      {typeof val === 'number' && key.includes('ercent')
                        ? formatPercent(val)
                        : typeof val === 'number' && key.includes('ownership')
                          ? formatPercent(val)
                          : formatCurrencyExact(val as number)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="py-2.5">Earning Saya</td>
                  <td className="py-2.5 text-right">{formatCurrencyExact(myResult.perInvestorAmount)}</td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="py-2.5 text-muted-foreground">ROI Bulanan</td>
                  <td className="py-2.5 text-right font-medium">{formatPercent(myResult.roiPercent, true)}</td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="py-2.5 text-muted-foreground">ROI Tahunan</td>
                  <td className="py-2.5 text-right font-medium">{formatPercent(myResult.annualRoiPercent, true)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Data perhitungan belum tersedia.</p>
          )}
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
