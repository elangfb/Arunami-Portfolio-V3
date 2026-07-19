import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalystPortfolios } from '@/lib/firestore'
import { loadPortfolioMetrics, type MonthlyMetricRow } from '@/lib/analystMetrics'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Table2 } from 'lucide-react'
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
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Portofolio</TableHead>
                  <TableHead>Bulan</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Bagi Hasil</TableHead>
                  <TableHead className="text-right">Yield Bulanan</TableHead>
                  <TableHead className="text-right">Yield Tahunan</TableHead>
                  <TableHead className="text-right">Yield Disesuaikan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Belum ada data bulanan.</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow
                    key={`${r.portfolioId}-${r.month}`}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/analyst/portfolios/${r.portfolioId}/overview`)}
                  >
                    <TableCell className="font-medium">{r.brandName}</TableCell>
                    <TableCell className="text-muted-foreground">{formatPeriod(r.month)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCompact(r.revenue)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCompact(r.netProfit)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCompact(r.bagiHasil)}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.monthlyYield)}</TableCell>
                    <TableCell className="text-right">{formatPercent(r.annualizedYield)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatPercent(r.adjustedAnnualizedYield)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
    </main>
  )
}
