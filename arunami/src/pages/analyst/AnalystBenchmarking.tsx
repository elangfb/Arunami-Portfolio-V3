import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalystPortfolios } from '@/lib/firestore'
import { loadPortfolioMetrics, type PortfolioMetric } from '@/lib/analystMetrics'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { TrendingUp, ArrowLeft, BarChart3, Medal } from 'lucide-react'
import type { HealthLevel } from '@/types'

type MetricKey = 'annualizedYield' | 'monthlyYield' | 'revenue' | 'netProfit' | 'bagiHasil'

const METRICS: { key: MetricKey; label: string; type: 'percent' | 'currency' }[] = [
  { key: 'annualizedYield', label: 'Yield Tahunan', type: 'percent' },
  { key: 'monthlyYield', label: 'Yield Bulanan', type: 'percent' },
  { key: 'revenue', label: 'Revenue', type: 'currency' },
  { key: 'netProfit', label: 'Net Profit', type: 'currency' },
  { key: 'bagiHasil', label: 'Bagi Hasil', type: 'currency' },
]

const HEALTH_COLOR: Record<HealthLevel, string> = {
  sehat: '#38a169', siaga_3: '#eab308', siaga_2: '#f97316', siaga_1: '#ef4444',
}

export default function AnalystBenchmarking() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [metrics, setMetrics] = useState<PortfolioMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [metricKey, setMetricKey] = useState<MetricKey>('annualizedYield')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      setMetrics(await loadPortfolioMetrics(ports))
      setLoading(false)
    })()
  }, [user])

  const meta = METRICS.find(m => m.key === metricKey)!
  const fmt = (v: number) => (meta.type === 'percent' ? formatPercent(v) : formatCurrencyCompact(v))

  const ranked = useMemo(() => {
    return [...metrics].sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1 // no-data to the bottom
      return (b[metricKey] as number) - (a[metricKey] as number)
    })
  }, [metrics, metricKey])

  const chartData = ranked
    .filter(m => m.hasData)
    .map(m => ({
      name: m.portfolio.brandName || m.portfolio.name,
      value: m[metricKey] as number,
      color: HEALTH_COLOR[m.portfolio.healthLevel ?? 'sehat'],
    }))

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
            <BarChart3 className="h-6 w-6 text-[#38a169]" />
            Benchmarking
          </h1>
          <p className="text-muted-foreground">Bandingkan portofolio berdasarkan satu metrik</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {METRICS.map(m => (
            <Button
              key={m.key}
              variant={metricKey === m.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMetricKey(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Peringkat — {meta.label}</CardTitle></CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data untuk diperingkat.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 44)}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmt(v as number)} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(v as number)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="px-3 py-3 text-left font-medium w-12">#</th>
                      <th className="px-3 py-3 text-left font-medium">Portofolio</th>
                      <th className="px-3 py-3 text-center font-medium">Kesehatan</th>
                      <th className="px-3 py-3 text-right font-medium">{meta.label}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ranked.map((m, i) => (
                      <tr
                        key={m.portfolio.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => navigate(`/analyst/portfolios/${m.portfolio.id}/overview`)}
                      >
                        <td className="px-3 py-2.5">
                          {m.hasData && i < 3 ? <Medal className={`h-4 w-4 ${['text-yellow-500', 'text-gray-400', 'text-amber-700'][i]}`} /> : <span className="text-muted-foreground">{i + 1}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{m.portfolio.brandName || m.portfolio.name}</td>
                        <td className="px-3 py-2.5 text-center"><HealthBadge level={m.portfolio.healthLevel} reasons={m.portfolio.healthReasons} /></td>
                        <td className="px-3 py-2.5 text-right font-medium">
                          {m.hasData ? fmt(m[metricKey] as number) : <span className="text-muted-foreground">Tanpa data</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
