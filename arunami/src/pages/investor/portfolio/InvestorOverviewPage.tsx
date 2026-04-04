import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { calculateROI } from '@/lib/roi'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, BarChart2 } from 'lucide-react'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorOverviewPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data belum tersedia.</div>

  const lastRevenue = data.revenueData.at(-1)?.aktual ?? 0
  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  const kpis = [
    { label: 'Revenue (Bulan Ini)', value: formatCurrencyCompact(lastRevenue), icon: DollarSign },
    { label: 'Net Profit (Bulan Ini)', value: formatCurrencyCompact(lastProfit), icon: TrendingUp },
    { label: 'ROI / Slot (Bulanan)', value: formatPercent(roi.monthlyROI, true), icon: BarChart2 },
  ]

  // Revenue chart — aktual only (no projection for investor)
  const revenueChartData = data.revenueData.map(r => ({ month: r.month, aktual: r.aktual }))

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Overview Portofolio</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-[#38a169]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
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
