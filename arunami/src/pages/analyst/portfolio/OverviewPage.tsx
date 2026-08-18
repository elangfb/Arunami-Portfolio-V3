import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getFinancialData, getReports, getHealthRules, updatePortfolioHealth,
  getConfigTimeline, getPortfolioConfig,
} from '@/lib/firestore'
import { resolveInvestorConfigForPeriod, type ConfigVersion } from '@/lib/configTimeline'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { wholePortfolioAllocation } from '@/lib/analystMetrics'
import { computeHealth, DEFAULT_HEALTH_RULES, HEALTH_SOP, healthFreshness } from '@/lib/health'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent, calcMoM, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { HealthBadge } from '@/components/shared/HealthBadge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart2, AlertTriangle } from 'lucide-react'
import { formatPeriod, comparePeriods, formatFullDate } from '@/lib/dateUtils'
import { buildThreeColRows } from '@/lib/reportHtml'
import type { FinancialData, Portfolio, PortfolioConfig, PnLExtractedData, ProjectionExtractedData, PortfolioReport, HealthRules } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const GREEN_PALETTE = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4']

export default function OverviewPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [configTimeline, setConfigTimeline] = useState<ConfigVersion[]>([])
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [pnlReports, setPnlReports] = useState<PortfolioReport[]>([])
  const [projReports, setProjReports] = useState<PortfolioReport[]>([])
  // Which two months the comparison table puts side by side (both YYYY-MM).
  const [comparePeriodA, setComparePeriodA] = useState('')
  const [comparePeriodB, setComparePeriodB] = useState('')
  // Wanprestasi / health
  const [rules, setRules] = useState<HealthRules>(DEFAULT_HEALTH_RULES)
  const [latenessDays, setLatenessDays] = useState(0)
  const [lastContactDate, setLastContactDate] = useState('')
  const [wanprestasiOpen, setWanprestasiOpen] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  // When the stored level was last saved. Tracked locally because the layout
  // fetches the portfolio once — without this the stamp would keep showing the
  // pre-save timestamp until a full page reload.
  const [healthComputedAt, setHealthComputedAt] = useState<{ seconds: number } | Date | null>(null)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  useEffect(() => {
    if (portfolioId) getConfigTimeline(portfolioId).then(setConfigTimeline).catch(() => {})
  }, [portfolioId])

  useEffect(() => {
    if (portfolioId) getPortfolioConfig(portfolioId).then(setConfig).catch(() => {})
  }, [portfolioId])

  useEffect(() => { getHealthRules().then(setRules).catch(() => {}) }, [])

  useEffect(() => {
    setLatenessDays(portfolio?.latenessDays ?? 0)
    setLastContactDate(portfolio?.lastContactDate ?? '')
    setHealthComputedAt(portfolio?.healthComputedAt ?? null)
  }, [portfolio])

  // Live health — recomputed from the manual inputs + PnL-vs-projection series.
  const health = useMemo(
    () => computeHealth({ latenessDays, lastContactDate, profitData: data?.profitData, rules }),
    [latenessDays, lastContactDate, data, rules],
  )

  // How old the *saved* level is — this is what every dashboard badge reads,
  // and it only refreshes when someone saves the modal below.
  const freshness = useMemo(() => healthFreshness(healthComputedAt), [healthComputedAt])

  const saveWanprestasi = async () => {
    if (!portfolioId) return
    setSavingHealth(true)
    try {
      const result = computeHealth({ latenessDays, lastContactDate, profitData: data?.profitData, rules })
      await updatePortfolioHealth(portfolioId, {
        latenessDays,
        lastContactDate,
        healthLevel: result.level,
        healthReasons: result.reasons,
      })
      setHealthComputedAt(new Date())
      toast.success('Status wanprestasi diperbarui')
      setWanprestasiOpen(false)
    } catch (err) {
      console.error('Failed to update health', err)
      toast.error('Gagal memperbarui status')
    } finally {
      setSavingHealth(false)
    }
  }

  useEffect(() => {
    if (!portfolioId) return
    Promise.all([
      getReports(portfolioId, 'pnl'),
      getReports(portfolioId, 'projection'),
    ]).then(([pnls, projs]) => {
      setPnlReports(pnls)
      setProjReports(projs)
    })
  }, [portfolioId])

  // Periods the analyst can compare — only those with an actual PnL, newest
  // first, so the dropdowns never offer a month that would render as all "—".
  const pnlPeriods = useMemo(
    () => [...new Set(pnlReports.map(r => r.period))].sort(comparePeriods).reverse(),
    [pnlReports],
  )

  // Seed the pickers with the two newest reported months, and re-seed if the
  // current pick disappears (e.g. a report was deleted). Functional updates so
  // a manual choice survives unrelated re-renders.
  useEffect(() => {
    if (!pnlPeriods.length) return
    setComparePeriodA(prev => (pnlPeriods.includes(prev) ? prev : pnlPeriods[0]))
    setComparePeriodB(prev => (pnlPeriods.includes(prev) ? prev : pnlPeriods[1] ?? pnlPeriods[0]))
  }, [pnlPeriods])

  // Three-column comparison rows (month A / month B / projection for A) — same
  // data shape as the investor report's Laporan Keuangan section. Declared
  // here, above the early returns below, so the hook count stays stable across
  // the loading → loaded transition (otherwise React throws error #310).
  const comparisonRows = useMemo(() => {
    if (!comparePeriodA) return []
    const pnlOf = (period: string) =>
      (pnlReports.find(r => r.period === period)?.extractedData as PnLExtractedData | undefined) ?? null
    const proj = (projReports.find(r => r.period === comparePeriodA)?.extractedData as ProjectionExtractedData | undefined) ?? null
    return buildThreeColRows(pnlOf(comparePeriodA), pnlOf(comparePeriodB), proj)
  }, [comparePeriodA, comparePeriodB, pnlReports, projReports])

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

  // Anchor on the latest period that has actual PnL data, not the
  // chronologically last entry — projection-only future months would otherwise
  // show Rp 0 on the KPI cards.
  const latestTxIdx = data.transactionData.length - 1
  let latestPeriod: string | undefined = data.transactionData[latestTxIdx]?.month
  let prevPeriod: string | undefined = data.transactionData[latestTxIdx - 1]?.month
  if (!latestPeriod) {
    const revWithActual = [...data.revenueData].reverse().find(r => r.aktual !== 0)
    latestPeriod = revWithActual?.month
    if (latestPeriod) {
      const idx = data.revenueData.findIndex(r => r.month === latestPeriod)
      prevPeriod = data.revenueData[idx - 1]?.month
    }
  }

  const lastRevenue = latestPeriod ? data.revenueData.find(r => r.month === latestPeriod)?.aktual ?? 0 : 0
  const prevRevenue = prevPeriod ? data.revenueData.find(r => r.month === prevPeriod)?.aktual ?? 0 : 0
  const lastProfit = latestPeriod ? data.profitData.find(r => r.month === latestPeriod)?.aktual ?? 0 : 0
  const prevProfit = prevPeriod ? data.profitData.find(r => r.month === prevPeriod)?.aktual ?? 0 : 0
  const lastTx = latestPeriod ? data.transactionData.find(t => t.month === latestPeriod) : undefined
  const totalTx = lastTx ? Object.values(lastTx.categories).reduce((s, v) => s + v, 0) : 0
  const prevTx = prevPeriod ? data.transactionData.find(t => t.month === prevPeriod) : undefined
  const prevTotalTx = prevTx ? Object.values(prevTx.categories).reduce((s, v) => s + v, 0) : 0

  // Charts: show actuals plus only 3 months of projection ahead, rather than
  // the full multi-year projection horizon (which dwarfs the actuals).
  const trimToThreeMonthsAhead = <T extends { month: string }>(rows: T[]): T[] => {
    if (!latestPeriod) return rows
    const idx = rows.findIndex(r => r.month === latestPeriod)
    return idx === -1 ? rows : rows.slice(0, idx + 1 + 3)
  }
  const revenueChartData = trimToThreeMonthsAhead(data.revenueData)
  const profitChartData = trimToThreeMonthsAhead(data.profitData)

  // Total Investment ROI: run the one distribution engine over a whole-portfolio
  // stand-in allocation, rather than re-deriving net_profit_share by hand. The
  // inline version this replaces applied that one model regardless of
  // `returnModel` and ignored grace periods entirely.
  //
  // `resolveInvestorConfigForPeriod` falls back to the live config doc when the
  // timeline can't answer — which is every portfolio that has never had a config
  // change. The old `data.investorConfig` fallback was a snapshot frozen at the
  // first PnL upload (firestore.ts re-syncs only `returnModel`), so it went stale
  // on the common path, not a rare one.
  const totalInvestment = portfolio?.investasiAwal ?? 0
  const totalInvestmentROI = portfolio && config && totalInvestment > 0
    ? calculateDistribution({
        reportData: {
          period: latestPeriod ?? '',
          revenue: lastRevenue,
          netProfit: lastProfit,
          grossProfit: 0,
        },
        config: resolveInvestorConfigForPeriod(config, configTimeline, latestPeriod ?? ''),
        allocation: wholePortfolioAllocation(portfolio),
        portfolio,
      }).roiPercent
    : 0

  // Every KPI below reads a single month, so stamp the cards with which one —
  // a bare "Rp 1.2M" says nothing about the period it belongs to.
  const kpiPeriodLabel = latestPeriod ? formatPeriod(latestPeriod) : null

  const sameMonthSelected = comparePeriodA !== '' && comparePeriodA === comparePeriodB

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
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl font-bold">Overview Portofolio</h2>

      {/* Wanprestasi / health banner */}
      <div
        className={cn(
          'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
          freshness.isStale && 'border-amber-300 bg-amber-50/50',
        )}
      >
        <div className="flex items-start gap-3">
          <HealthBadge level={health.level} reasons={health.reasons} size="md" />
          <div>
            <p className="text-sm font-medium">Status Wanprestasi</p>
            <p className="text-xs text-muted-foreground">
              {health.reasons.length ? health.reasons.join(' · ') : 'Semua sinyal dalam batas aman'}
            </p>
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-xs',
                freshness.isStale ? 'font-medium text-amber-700' : 'text-muted-foreground',
              )}
            >
              {freshness.isStale && <AlertTriangle className="h-3 w-3 shrink-0" />}
              {freshness.label}
              {freshness.date && ` (${formatFullDate(freshness.date)})`}
              {freshness.isStale && ' — perlu ditinjau ulang'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWanprestasiOpen(true)} className="shrink-0">
          Update
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ label, value, change, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                {kpiPeriodLabel && (
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/70">
                    {kpiPeriodLabel}
                  </p>
                )}
              </div>
              <Icon className="h-4 w-4 shrink-0 text-[#38a169]" />
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

      {/* Three-column comparison: month A / month B / projection for A */}
      {comparisonRows.length > 0 && (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-sm">Perbandingan Bulanan</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={comparePeriodA} onValueChange={setComparePeriodA}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Bulan A" /></SelectTrigger>
                <SelectContent>
                  {pnlPeriods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">dibandingkan</span>
              <Select value={comparePeriodB} onValueChange={setComparePeriodB}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Bulan B" /></SelectTrigger>
                <SelectContent>
                  {pnlPeriods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              {sameMonthSelected && (
                <span className="text-xs text-amber-700">Pilih dua bulan berbeda untuk melihat selisih.</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="text-right">Aktual {formatPeriod(comparePeriodB)}</TableHead>
                  <TableHead className="text-right">Aktual {formatPeriod(comparePeriodA)}</TableHead>
                  <TableHead className="text-right">Proyeksi {formatPeriod(comparePeriodA)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonRows.map(r => {
                  const delta = (cur: number | null, base: number | null) => {
                    if (cur == null || base == null || base === 0) return null
                    return ((cur - base) / Math.abs(base)) * 100
                  }
                  // Both deltas describe month A relative to that column, so
                  // comparing a month against itself would just print +0.0%.
                  const dPrev = sameMonthSelected ? null : delta(r.current, r.previous)
                  const dProj = delta(r.current, r.projection)
                  // Percentages belong to month A, not to the column they are
                  // measured against — so they sit in month A's cell, each
                  // labelled with its baseline to keep the two apart.
                  const deltas = [
                    { d: dPrev, label: `vs ${formatPeriod(comparePeriodB)}` },
                    { d: dProj, label: 'vs proyeksi' },
                  ].filter((x): x is { d: number; label: string } => x.d !== null)
                  const cell = (v: number | null) => (
                    v == null
                      ? <TableCell className="text-right text-muted-foreground">—</TableCell>
                      : <TableCell className="text-right">{formatCurrencyExact(v)}</TableCell>
                  )
                  return (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      {cell(r.previous)}
                      {r.current == null
                        ? <TableCell className="text-right text-muted-foreground">—</TableCell>
                        : <TableCell className="text-right">
                            {formatCurrencyExact(r.current)}
                            {deltas.map(({ d, label }) => (
                              <div key={label} className={`text-[10px] ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {d >= 0 ? '+' : ''}{d.toFixed(1)}% {label}
                              </div>
                            ))}
                          </TableCell>}
                      {cell(r.projection)}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Persentase berada di kolom {formatPeriod(comparePeriodA)} dan menunjukkan perubahannya terhadap baseline yang tertulis.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Revenue Bar Chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Revenue — Proyeksi vs Aktual</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueChartData}>
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
            <BarChart data={profitChartData}>
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

      {/* Wanprestasi SOP monitor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Monitor Wanprestasi (SOP)</CardTitle>
          <HealthBadge level={health.level} reasons={health.reasons} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Keterlambatan</p>
              <p className="text-lg font-bold">{health.signals.latenessDays} hari</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tanpa Komunikasi</p>
              <p className="text-lg font-bold">
                {health.signals.silenceDays != null ? `${health.signals.silenceDays} hari` : '—'}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Bulan &lt; 80% Target</p>
              <p className="text-lg font-bold">{health.signals.underTargetMonths}</p>
            </div>
          </div>

          {health.level !== 'sehat' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{HEALTH_SOP[health.level].phase}</p>
              <p className="text-xs text-amber-700">{HEALTH_SOP[health.level].action}</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Laba Bersih vs Target (6 bulan terakhir)</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Aktual</TableHead>
                  <TableHead className="text-right">% Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profitData.filter(r => r.aktual !== 0).slice(-6).map(r => {
                  const pct = r.proyeksi > 0 ? (r.aktual / r.proyeksi) * 100 : null
                  const under = pct !== null && pct < 80
                  return (
                    <TableRow key={r.month}>
                      <TableCell>{formatPeriod(r.month)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyCompact(r.proyeksi)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyCompact(r.aktual)}</TableCell>
                      <TableCell className={`text-right ${under ? 'font-medium text-red-500' : ''}`}>
                        {pct !== null ? `${pct.toFixed(0)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Wanprestasi update modal */}
      <Dialog open={wanprestasiOpen} onOpenChange={setWanprestasiOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Status Wanprestasi</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Keterlambatan pembayaran/laporan (hari)</Label>
              <Input
                type="number"
                value={latenessDays}
                onChange={e => setLatenessDays(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tanggal kontak terakhir</Label>
              <Input
                type="date"
                value={lastContactDate}
                onChange={e => setLastContactDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Performa laba bersih (&lt; 80% target) dihitung otomatis dari data PnL vs proyeksi.
            </p>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Hasil perhitungan</p>
              <div className="mt-1 flex items-center gap-2">
                <HealthBadge level={health.level} />
                <span className="text-xs text-muted-foreground">
                  {health.reasons.length ? health.reasons.join(' · ') : 'Semua sinyal dalam batas aman'}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWanprestasiOpen(false)}>Batal</Button>
              <Button onClick={saveWanprestasi} disabled={savingHealth}>
                {savingHealth ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
