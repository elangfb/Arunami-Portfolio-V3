import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, Portfolio } from '@/types'

interface Context {
  portfolio: Portfolio | null
  portfolioId: string | undefined
  selectedPeriod?: string
  availablePeriods?: string[]
}
const COLORS = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4']

export default function RevenuePage() {
  const { portfolioId, selectedPeriod, availablePeriods } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data finansial belum tersedia.</div>

  // Investor route gates time-series to published periods only. Analyst route
  // doesn't pass these context fields so we show everything.
  const publishedSet = availablePeriods && availablePeriods.length > 0
    ? new Set(availablePeriods)
    : null
  let filteredRevenue = publishedSet
    ? data.revenueData.filter(r => publishedSet.has(r.month))
    : data.revenueData
  let filteredProfit = publishedSet
    ? data.profitData.filter(p => publishedSet.has(p.month))
    : data.profitData

  // Analyst route (no published gate): cap the projection horizon to 3 months
  // past the latest actual, so the multi-year projection doesn't dwarf the
  // actuals in the charts and Tabel Varians. Revenue/Profit are parallel
  // arrays indexed by the same months, so they share one cutoff to stay aligned.
  if (!publishedSet) {
    const PROJECTION_MONTHS_AHEAD = 3
    let lastActualIdx = -1
    filteredRevenue.forEach((r, i) => { if (r.aktual !== 0) lastActualIdx = i })
    if (lastActualIdx !== -1) {
      const end = lastActualIdx + 1 + PROJECTION_MONTHS_AHEAD
      filteredRevenue = filteredRevenue.slice(0, end)
      filteredProfit = filteredProfit.slice(0, end)
    }
  }
  void selectedPeriod // currently used only to trigger re-render; KPIs gated above

  // Variance table
  const varianceData = filteredRevenue.map((r, i) => {
    const profit = filteredProfit[i]
    const revenueVar = r.aktual - r.proyeksi
    const profitVar = (profit?.aktual ?? 0) - (profit?.proyeksi ?? 0)
    return {
      month: r.month,
      revenueAktual: r.aktual,
      revenueProyeksi: r.proyeksi,
      revenueVar,
      revenuePct: r.proyeksi ? (revenueVar / r.proyeksi) * 100 : 0,
      profitAktual: profit?.aktual ?? 0,
      profitProyeksi: profit?.proyeksi ?? 0,
      profitVar,
      profitPct: profit?.proyeksi ? (profitVar / profit.proyeksi) * 100 : 0,
    }
  })

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl font-bold">Revenue & Profit</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue — Proyeksi vs Aktual</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={filteredRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => formatCurrencyCompact(v as number)} />
                <Legend />
                <Bar dataKey="proyeksi" fill={COLORS[2]} name="Proyeksi" radius={[4,4,0,0]} />
                <Bar dataKey="aktual" fill={COLORS[0]} name="Aktual" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Profit — Proyeksi vs Aktual</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={filteredProfit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => formatCurrencyCompact(v as number)} />
                <Legend />
                <Bar dataKey="proyeksi" fill={COLORS[2]} name="Proyeksi" radius={[4,4,0,0]} />
                <Bar dataKey="aktual" fill={COLORS[0]} name="Aktual" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Mix */}
      {data.revenueMix.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue Mix</CardTitle></CardHeader>
          <CardContent className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={data.revenueMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {data.revenueMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrencyCompact(v as number)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.revenueMix.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{formatCurrencyCompact(item.value)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({formatPercent(item.percentage)})</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Variance Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Tabel Varians</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead className="text-right">Rev. Aktual</TableHead>
                <TableHead className="text-right">Rev. Proyeksi</TableHead>
                <TableHead className="text-right">Varians</TableHead>
                <TableHead className="text-right">Profit Aktual</TableHead>
                <TableHead className="text-right">Profit Proyeksi</TableHead>
                <TableHead className="text-right">Varians</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {varianceData.map(row => (
                <TableRow key={row.month} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{formatPeriod(row.month)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyCompact(row.revenueAktual)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyCompact(row.revenueProyeksi)}</TableCell>
                  <TableCell className={`text-right font-medium ${row.revenueVar >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.revenuePct, true)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyCompact(row.profitAktual)}</TableCell>
                  <TableCell className="text-right">{formatCurrencyCompact(row.profitProyeksi)}</TableCell>
                  <TableCell className={`text-right font-medium ${row.profitVar >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.profitPct, true)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
