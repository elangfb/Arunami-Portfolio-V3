import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { formatPeriod } from '@/lib/dateUtils'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }
const COLORS = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4']

export default function RevenuePage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data finansial belum tersedia.</div>

  // Variance table
  const varianceData = data.revenueData.map((r, i) => {
    const profit = data.profitData[i]
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
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Revenue & Profit</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue — Proyeksi vs Aktual</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                <YAxis tickFormatter={v => formatCurrencyCompact(v as number)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => formatCurrencyCompact(v as number)} />
                <Legend />
                <Line type="monotone" dataKey="proyeksi" stroke={COLORS[2]} strokeDasharray="4 4" name="Proyeksi" dot={false} />
                <Line type="monotone" dataKey="aktual" stroke={COLORS[0]} strokeWidth={2} name="Aktual" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Profit — Proyeksi vs Aktual</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.profitData}>
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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4">Bulan</th>
                <th className="text-right py-2 px-4">Rev. Aktual</th>
                <th className="text-right py-2 px-4">Rev. Proyeksi</th>
                <th className="text-right py-2 px-4">Varians</th>
                <th className="text-right py-2 px-4">Profit Aktual</th>
                <th className="text-right py-2 px-4">Profit Proyeksi</th>
                <th className="text-right py-2">Varians</th>
              </tr>
            </thead>
            <tbody>
              {varianceData.map(row => (
                <tr key={row.month} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4 font-medium">{formatPeriod(row.month)}</td>
                  <td className="text-right py-2 px-4">{formatCurrencyCompact(row.revenueAktual)}</td>
                  <td className="text-right py-2 px-4">{formatCurrencyCompact(row.revenueProyeksi)}</td>
                  <td className={`text-right py-2 px-4 font-medium ${row.revenueVar >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.revenuePct, true)}
                  </td>
                  <td className="text-right py-2 px-4">{formatCurrencyCompact(row.profitAktual)}</td>
                  <td className="text-right py-2 px-4">{formatCurrencyCompact(row.profitProyeksi)}</td>
                  <td className={`text-right py-2 font-medium ${row.profitVar >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPercent(row.profitPct, true)}
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
