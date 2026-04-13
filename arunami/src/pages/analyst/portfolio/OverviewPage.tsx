import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { formatCurrencyCompact, formatPercent, calcMoM } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart2, AlertTriangle } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const GREEN_PALETTE = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4']

export default function OverviewPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>

  if (!data && portfolio?.isGracePeriod) return (
    <div className="p-8">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h3 className="font-semibold text-amber-900">Proyek dalam Grace Period</h3>
            <p className="mt-1 text-sm text-amber-700">
              Data finansial (PnL & Proyeksi) belum tersedia karena proyek ini masih dalam masa grace period.
              Dashboard akan menampilkan data lengkap setelah dokumen PnL dan Proyeksi diupload.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  if (!data) return <div className="p-8 text-muted-foreground">Data finansial belum tersedia. Upload dokumen PnL terlebih dahulu.</div>

  const lastRevenue = data.revenueData.at(-1)?.aktual ?? 0
  const prevRevenue = data.revenueData.at(-2)?.aktual ?? 0
  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const prevProfit = data.profitData.at(-2)?.aktual ?? 0
  const lastTx = data.transactionData.at(-1)
  const totalTx = lastTx ? Object.values(lastTx.categories).reduce((s, v) => s + v, 0) : 0
  const prevTx = data.transactionData.at(-2)
  const prevTotalTx = prevTx ? Object.values(prevTx.categories).reduce((s, v) => s + v, 0) : 0

  // Total Investment ROI: net-for-investor / total investment
  const cfg = data.investorConfig
  const investorShare = lastProfit * (cfg.investorSharePercent / 100)
  const arunamiFee = investorShare * (cfg.arunamiFeePercent / 100)
  const netForInvestor = investorShare - arunamiFee
  const totalInvestment = portfolio?.investasiAwal ?? 0
  const totalInvestmentROI = totalInvestment > 0 ? (netForInvestor / totalInvestment) * 100 : 0

  const kpis = [
    {
      label: 'Revenue', value: formatCurrencyCompact(lastRevenue),
      change: calcMoM(lastRevenue, prevRevenue), icon: DollarSign,
    },
    {
      label: 'Net Profit', value: formatCurrencyCompact(lastProfit),
      change: calcMoM(lastProfit, prevProfit), icon: TrendingUp,
    },
    {
      label: 'Transaksi', value: totalTx.toLocaleString('id-ID'),
      change: calcMoM(totalTx, prevTotalTx), icon: ShoppingCart,
    },
    {
      label: 'Total Investment ROI', value: formatPercent(totalInvestmentROI),
      change: null, icon: BarChart2,
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Overview Portofolio</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ label, value, change, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-[#38a169]" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{value}</div>
              {change !== null && (
                <div className={`flex items-center gap-1 text-xs mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(change, true)} vs bulan lalu
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Bar Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Revenue — Proyeksi vs Aktual</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
              <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrencyCompact(v as number)} />
              <Legend />
              <Bar dataKey="proyeksi" fill={GREEN_PALETTE[2]} name="Proyeksi" radius={[4,4,0,0]} />
              <Bar dataKey="aktual" fill={GREEN_PALETTE[0]} name="Aktual" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Profit Chart — full width */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Profit — Proyeksi vs Aktual</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.profitData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
              <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrencyCompact(v as number)} />
              <Legend />
              <Bar dataKey="proyeksi" fill={GREEN_PALETTE[2]} name="Proyeksi" radius={[4,4,0,0]} />
              <Bar dataKey="aktual" fill={GREEN_PALETTE[0]} name="Aktual" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
