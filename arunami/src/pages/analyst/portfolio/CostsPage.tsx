import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getReports } from '@/lib/firestore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { comparePeriods, formatPeriod } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Portfolio, PortfolioReport, PnLExtractedData, ProjectionExtractedData } from '@/types'

interface Context {
  portfolio: Portfolio | null
  portfolioId: string | undefined
  selectedPeriod?: string
  availablePeriods?: string[]
}

interface Row {
  name: string
  amount: number
  percentage: number
  momPct: number | null
  projPct: number | null
}

export default function CostsPage() {
  const { portfolioId, selectedPeriod, availablePeriods } = useOutletContext<Context>()
  const [pnlReports, setPnlReports] = useState<PortfolioReport[]>([])
  const [projectionReports, setProjectionReports] = useState<PortfolioReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    ;(async () => {
      const [pnls, projs] = await Promise.all([
        getReports(portfolioId, 'pnl'),
        getReports(portfolioId, 'projection'),
      ])
      setPnlReports(pnls)
      setProjectionReports(projs)
      setLoading(false)
    })()
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (pnlReports.length === 0) return <div className="p-8 text-muted-foreground">Data biaya belum tersedia. Upload laporan PnL terlebih dahulu.</div>

  // On the investor route the layout passes availablePeriods (published only)
  // and selectedPeriod. Filter the report set so this page agrees with the
  // sidebar dropdown. Analyst route doesn't pass these → show everything.
  const publishedSet = availablePeriods && availablePeriods.length > 0
    ? new Set(availablePeriods)
    : null
  const visiblePnl = publishedSet
    ? pnlReports.filter(r => publishedSet.has(r.period))
    : pnlReports

  if (visiblePnl.length === 0) {
    return <div className="p-8 text-muted-foreground">Belum ada laporan PnL untuk periode yang dipilih.</div>
  }

  const sortedPnl = [...visiblePnl].sort((a, b) => comparePeriods(a.period, b.period))
  // Prefer the period chosen in the sidebar dropdown (investor route);
  // fall back to the most recent available.
  const fromSelected = selectedPeriod ? sortedPnl.find(r => r.period === selectedPeriod) : undefined
  const latest = fromSelected ?? sortedPnl.at(-1)!
  const latestIdx = sortedPnl.findIndex(r => r.period === latest.period)
  const prev = latestIdx > 0 ? sortedPnl[latestIdx - 1] : undefined
  const latestData = latest.extractedData as PnLExtractedData
  const prevData = prev ? (prev.extractedData as PnLExtractedData) : null

  const matchingProjection = projectionReports.find(p => p.period === latest.period)
  const projData = matchingProjection ? (matchingProjection.extractedData as ProjectionExtractedData) : null

  const totalCost = (latestData.opex ?? []).reduce((s, o) => s + (o.amount || 0), 0)

  const rows: Row[] = (latestData.opex ?? []).map(item => {
    const prevItem = prevData?.opex?.find(o => o.name === item.name)
    const projItem = projData?.projectedOpex?.find(o => o.name === item.name)
    const momPct = prevItem && prevItem.amount > 0
      ? ((item.amount - prevItem.amount) / prevItem.amount) * 100
      : null
    const projPct = projItem && projItem.amount > 0
      ? ((item.amount - projItem.amount) / projItem.amount) * 100
      : null
    const percentage = totalCost > 0 ? (item.amount / totalCost) * 100 : 0
    return { name: item.name, amount: item.amount, percentage, momPct, projPct }
  })

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Struktur Biaya</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Breakdown Biaya Operasional — {formatPeriod(latest.period)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrencyCompact(totalCost)}
            {prev && <> · Bulan sebelumnya: {formatPeriod(prev.period)}</>}
            {projData && <> · Proyeksi tersedia</>}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rows.map(item => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{formatCurrencyCompact(item.amount)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({item.percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#38a169] transition-all"
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2">Item Biaya</th>
                  <th className="text-right py-2 px-2">Jumlah</th>
                  <th className="text-right py-2 px-2">%</th>
                  <th className="text-right py-2 px-2">vs Bulan Lalu</th>
                  <th className="text-right py-2 px-2">vs Proyeksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => (
                  <tr key={item.name} className="border-b hover:bg-muted/30">
                    <td className="py-2.5">{item.name}</td>
                    <td className="text-right py-2.5 px-2 font-medium">{formatCurrencyCompact(item.amount)}</td>
                    <td className="text-right py-2.5 px-2 text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                    <td className={`text-right py-2.5 px-2 font-medium ${
                      item.momPct == null ? 'text-muted-foreground' : item.momPct > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {item.momPct == null ? '—' : formatPercent(item.momPct, true)}
                    </td>
                    <td className={`text-right py-2.5 px-2 font-medium ${
                      item.projPct == null ? 'text-muted-foreground' : item.projPct > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {item.projPct == null ? '—' : formatPercent(item.projPct, true)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5">Total</td>
                  <td className="text-right py-2.5 px-2">{formatCurrencyCompact(totalCost)}</td>
                  <td className="text-right py-2.5 px-2">100%</td>
                  <td className="text-right py-2.5 px-2 text-muted-foreground">—</td>
                  <td className="text-right py-2.5 px-2 text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Kenaikan biaya (positif) ditampilkan merah; penurunan (negatif) ditampilkan hijau.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
