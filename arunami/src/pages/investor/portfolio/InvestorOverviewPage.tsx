import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData, getAllocationsForInvestor, getPortfolioConfig } from '@/lib/firestore'
import { calculateROI, calculateInvestorROI } from '@/lib/roi'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, BarChart2, PieChart } from 'lucide-react'
import type { FinancialData, Portfolio, InvestorAllocation, SlotBasedConfig } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorOverviewPage() {
  const { portfolioId } = useOutletContext<Context>()
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
  if (!data) return <div className="p-8 text-muted-foreground">Data belum tersedia.</div>

  const lastRevenue = data.revenueData.at(-1)?.aktual ?? 0
  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  const mySlots = allocation?.slots ?? 0
  const totalSlots = slotConfig?.totalSlots ?? data.investorConfig.totalSlots
  const nominalPerSlot = slotConfig?.nominalPerSlot ?? data.investorConfig.nominalPerSlot
  const investorSharePct = slotConfig?.investorSharePercent ?? data.investorConfig.investorSharePercent
  const arunamiFeePct = slotConfig?.arunamiFeePercent ?? data.investorConfig.arunamiFeePercent

  const myRoi = allocation
    ? calculateInvestorROI(lastProfit, mySlots, totalSlots, investorSharePct, arunamiFeePct, nominalPerSlot)
    : null

  const kpis = [
    { label: 'Revenue (Bulan Ini)', value: formatCurrencyCompact(lastRevenue), icon: DollarSign },
    { label: 'Net Profit (Bulan Ini)', value: formatCurrencyCompact(lastProfit), icon: TrendingUp },
    { label: 'Slot Saya', value: allocation ? `${mySlots} / ${totalSlots}` : `${totalSlots} total`, icon: PieChart },
    { label: 'Earning Saya (Bulan Ini)', value: myRoi ? formatCurrencyCompact(myRoi.earnings) : formatCurrencyCompact(roi.returnPerSlot), icon: BarChart2 },
  ]

  const revenueChartData = data.revenueData.map(r => ({ month: r.month, aktual: r.aktual }))

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Overview Portofolio</h2>

      {/* My Allocation Card */}
      {allocation && myRoi && (
        <div className="rounded-lg border bg-[#1e5f3f]/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Alokasi Saya</span>
            <Badge variant="secondary">{mySlots} slot · {myRoi.ownershipPct.toFixed(1)}% kepemilikan</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Investasi</p>
              <p className="font-semibold">{formatCurrencyCompact(allocation.investedAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Earning Bulan Ini</p>
              <p className="font-semibold">{formatCurrencyCompact(myRoi.earnings)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ROI Bulanan</p>
              <p className={`font-semibold ${myRoi.monthlyROI >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {formatPercent(myRoi.monthlyROI, true)}
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
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
