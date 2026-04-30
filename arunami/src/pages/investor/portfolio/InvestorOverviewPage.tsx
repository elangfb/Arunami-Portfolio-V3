import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData, getAllocationsForInvestor, getPortfolioConfigOrDefault } from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, BarChart2, PieChart } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, InvestorAllocation, PortfolioConfig } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

export default function InvestorOverviewPage() {
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
      getPortfolioConfigOrDefault(portfolioId),
    ]).then(([d, allocs, cfg]) => {
      setData(d)
      setAllocation(allocs.find(a => a.portfolioId === portfolioId) ?? null)
      setConfig(cfg)
      setLoading(false)
    })
  }, [portfolioId, user])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data belum tersedia.</div>
  if (availablePeriods.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          <p className="font-medium">Belum ada laporan yang diterbitkan.</p>
          <p className="mt-1 text-sm">KPI akan muncul setelah analyst mempublikasikan laporan untuk akun Anda.</p>
        </div>
      </div>
    )
  }

  const activePeriod = selectedPeriod || availablePeriods[0]
  const revEntry = data.revenueData.find(r => r.month === activePeriod)
  const profEntry = data.profitData.find(r => r.month === activePeriod)
  const lastRevenue = revEntry?.aktual ?? 0
  const lastProfit = profEntry?.aktual ?? 0
  const periodLabel = formatPeriod(activePeriod)

  // Calculate distribution using strategy pattern
  let myResult: ReturnType<typeof calculateDistribution> | null = null
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

  const kpis = [
    { label: `Revenue (${periodLabel})`, value: formatCurrencyCompact(lastRevenue), icon: DollarSign },
    { label: `Net Profit (${periodLabel})`, value: formatCurrencyCompact(lastProfit), icon: TrendingUp },
    { label: 'Kepemilikan', value: `${ownershipPct.toFixed(1)}%`, icon: PieChart },
    { label: `Earning Saya (${periodLabel})`, value: formatCurrencyCompact(myResult?.perInvestorAmount ?? 0), icon: BarChart2 },
  ]

  const publishedSet = new Set(availablePeriods)
  const revenueChartData = data.revenueData
    .filter(r => publishedSet.has(r.month))
    .map(r => ({ month: r.month, aktual: r.aktual }))

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Overview Portofolio</h2>

      {/* My Allocation Card */}
      {allocation && myResult && (
        <div className="rounded-lg border bg-[#1e5f3f]/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Alokasi Saya</span>
            <Badge variant="secondary">{ownershipPct.toFixed(1)}% kepemilikan</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Investasi</p>
              <p className="font-semibold">{formatCurrencyCompact(allocation.investedAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Earning {periodLabel}</p>
              <p className="font-semibold">{formatCurrencyCompact(myResult.perInvestorAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ROI Bulanan</p>
              <p className={`font-semibold ${myResult.roiPercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {formatPercent(myResult.roiPercent, true)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-[#38a169]" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Revenue Aktual</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
              <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatCurrencyCompact(v as number)} />
              <Bar dataKey="aktual" fill="#1e5f3f" name="Revenue" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
