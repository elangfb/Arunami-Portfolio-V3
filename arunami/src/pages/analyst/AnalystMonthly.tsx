import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalystPortfolios } from '@/lib/firestore'
import { loadPortfolioMetrics, type MonthlyMetricRow } from '@/lib/analystMetrics'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, ArrowLeft, Table2 } from 'lucide-react'
import type { Portfolio } from '@/types'

export default function AnalystMonthly() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [rows, setRows] = useState<MonthlyMetricRow[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      setPortfolios(ports)
      const metrics = await loadPortfolioMetrics(ports)
      setRows(metrics.flatMap(m => m.monthly))
      setLoading(false)
    })()
  }, [user])

  const months = useMemo(
    () => [...new Set(rows.map(r => r.month))].sort((a, b) => comparePeriods(b, a)),
    [rows],
  )

  const filtered = useMemo(() => {
    return rows
      .filter(r => portfolioFilter === 'all' || r.portfolioId === portfolioFilter)
      .filter(r => monthFilter === 'all' || r.month === monthFilter)
      .sort((a, b) => comparePeriods(b.month, a.month) || a.brandName.localeCompare(b.brandName))
  }, [rows, portfolioFilter, monthFilter])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e5f3f]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">ARUNAMI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/analyst')}>
            <ArrowLeft className="mr-1 h-4 w-4" />Kembali
          </Button>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Table2 className="h-6 w-6 text-[#38a169]" />
            Data Bulanan
          </h1>
          <p className="text-muted-foreground">Financial lintas portofolio per bulan</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua portofolio</SelectItem>
              {portfolios.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.brandName || p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua bulan</SelectItem>
              {months.map(m => <SelectItem key={m} value={m}>{formatPeriod(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="px-3 py-3 text-left font-medium">Portofolio</th>
                    <th className="px-3 py-3 text-left font-medium">Bulan</th>
                    <th className="px-3 py-3 text-right font-medium">Revenue</th>
                    <th className="px-3 py-3 text-right font-medium">Net Profit</th>
                    <th className="px-3 py-3 text-right font-medium">Bagi Hasil</th>
                    <th className="px-3 py-3 text-right font-medium">Yield Bulanan</th>
                    <th className="px-3 py-3 text-right font-medium">Yield Tahunan</th>
                    <th className="px-3 py-3 text-right font-medium">Yield Disesuaikan</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Belum ada data bulanan.</td></tr>
                  ) : filtered.map(r => (
                    <tr
                      key={`${r.portfolioId}-${r.month}`}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/analyst/portfolios/${r.portfolioId}/overview`)}
                    >
                      <td className="px-3 py-2.5 font-medium">{r.brandName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatPeriod(r.month)}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrencyCompact(r.revenue)}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrencyCompact(r.netProfit)}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrencyCompact(r.bagiHasil)}</td>
                      <td className="px-3 py-2.5 text-right">{formatPercent(r.monthlyYield)}</td>
                      <td className="px-3 py-2.5 text-right">{formatPercent(r.annualizedYield)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{formatPercent(r.adjustedAnnualizedYield)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
