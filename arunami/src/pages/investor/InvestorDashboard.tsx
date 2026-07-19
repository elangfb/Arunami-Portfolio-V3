import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getInvestorPortfolios, getAllocationsForInvestor, getPublishedInvestorReports } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { brandOf, makeBrandResolver } from '@/lib/portfolioName'
import { ownershipFraction } from '@/lib/distributionStrategies'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { AnnouncementsBanner } from '@/components/shared/AnnouncementsBanner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, CartesianGrid,
} from 'recharts'
import {
  Briefcase, FileText, Wallet, TrendingUp, Percent, AlertTriangle,
  ArrowUpRight, ArrowDownRight, ChevronRight,
} from 'lucide-react'
import { HEALTH_LABELS } from '@/lib/health'
import TransferProofNotificationBanner from '@/components/investor/TransferProofNotificationBanner'
import { useTransferProofNotifications } from '@/components/investor/useTransferProofNotifications'
import TransferProofHistoryList from '@/components/investor/TransferProofHistoryList'
import { ALL_TIME_PERIOD } from '@/types'
import type { Portfolio, InvestorAllocation, InvestorReportDoc } from '@/types'

const DONUT_COLORS = ['#1e5f3f', '#38a169', '#3182ce', '#d69e2e', '#805ad5', '#dd6b20', '#319795', '#e53e3e']

export default function InvestorDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [allocView, setAllocView] = useState<'porto' | 'industri'>('porto')
  const { notifications, reload: reloadNotifications } = useTransferProofNotifications(user?.uid)
  const resolveBrand = useMemo(() => makeBrandResolver(portfolios), [portfolios])

  useEffect(() => {
    if (user) {
      Promise.all([
        getInvestorPortfolios(user.uid),
        getAllocationsForInvestor(user.uid),
        getPublishedInvestorReports(user.uid),
      ]).then(([p, a, r]) => {
        setPortfolios(p)
        setAllocations(a)
        setReports(r)
        setLoading(false)
      })
    }
  }, [user])

  // Portfolios that have a published per-project report → show a quick link on the card.
  const portfolioReportIds = useMemo(
    () => new Set(reports.filter(r => r.scope !== 'accumulated' && r.scope !== 'all_time').map(r => r.portfolioId)),
    [reports],
  )

  // Bagi hasil recap — transfer-proof notifications are 1:1 with the payouts IR
  // sends, so summing their amounts gives the total profit-sharing received.
  const totalBagiHasil = useMemo(() => notifications.reduce((s, n) => s + n.amount, 0), [notifications])
  const totalInvested = useMemo(() => allocations.reduce((s, a) => s + a.investedAmount, 0), [allocations])
  const bagiHasilRatio = totalInvested > 0 ? (totalBagiHasil / totalInvested) * 100 : 0

  // Monthly distribution trend (real periods only — exclude the all-time recap).
  const distTrend = useMemo(() => {
    const byPeriod = new Map<string, number>()
    for (const n of notifications) {
      if (n.period === ALL_TIME_PERIOD) continue
      byPeriod.set(n.period, (byPeriod.get(n.period) ?? 0) + n.amount)
    }
    return [...byPeriod.entries()]
      .sort((a, b) => comparePeriods(a[0], b[0]))
      .map(([period, total]) => ({ period, label: formatPeriod(period), total }))
  }, [notifications])
  const latestDist = distTrend.length ? distTrend[distTrend.length - 1] : null
  const prevDist = distTrend.length > 1 ? distTrend[distTrend.length - 2] : null
  const momPct = latestDist && prevDist && prevDist.total > 0
    ? ((latestDist.total - prevDist.total) / prevDist.total) * 100
    : null

  // Allocation mix — by portfolio or grouped by industry.
  const allocByPortfolio = useMemo(
    () => allocations
      .filter(a => a.investedAmount > 0)
      .map(a => ({ name: portfolios.find(p => p.id === a.portfolioId)?.brandName || a.portfolioName, value: a.investedAmount })),
    [allocations, portfolios],
  )
  const allocByIndustry = useMemo(() => {
    const byInd = new Map<string, number>()
    for (const a of allocations) {
      if (a.investedAmount <= 0) continue
      const p = portfolios.find(pp => pp.id === a.portfolioId)
      const key = p ? (INDUSTRY_PRESETS[p.industryType]?.label ?? p.industryType) : 'Lainnya'
      byInd.set(key, (byInd.get(key) ?? 0) + a.investedAmount)
    }
    return [...byInd.entries()].map(([name, value]) => ({ name, value }))
  }, [allocations, portfolios])
  const activeAlloc = allocView === 'porto' ? allocByPortfolio : allocByIndustry

  const healthAlerts = useMemo(
    () => portfolios.filter(p => (p.healthLevel ?? 'sehat') !== 'sehat'),
    [portfolios],
  )

  const hasKpis = !loading && (allocations.length > 0 || notifications.length > 0)

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <AnnouncementsBanner role="investor" />

      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Ringkasan investasi dan bagi hasil Anda</p>
      </div>

      {/* Bukti transfer alerts — only visible while uncleared ones exist. */}
      <TransferProofNotificationBanner
        notifications={notifications}
        resolveBrand={resolveBrand}
        onChanged={reloadNotifications}
      />

      {/* KPI stat grid. */}
      {hasKpis && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Nilai Investasi</p>
                <Wallet className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[#1e5f3f]">{formatCurrencyCompact(totalInvested)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{portfolios.length} portofolio aktif</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Bagi Hasil</p>
                <TrendingUp className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[#1e5f3f]">{formatCurrencyCompact(totalBagiHasil)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {notifications.length > 0 ? `Dari ${notifications.length} pembayaran` : 'Belum ada pembayaran'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Distribusi {latestDist ? latestDist.label : ''}
                </p>
                <Wallet className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">
                {latestDist ? formatCurrencyCompact(latestDist.total) : '—'}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs">
                {momPct !== null ? (
                  <>
                    {momPct >= 0
                      ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                      : <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
                    <span className={momPct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {momPct >= 0 ? '+' : ''}{formatPercent(momPct)}
                    </span>
                    <span className="text-muted-foreground">vs {prevDist?.label}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Periode terakhir</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rasio Bagi Hasil</p>
                <Percent className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">{formatPercent(bagiHasilRatio)}</p>
              <p className="mt-1 text-xs text-muted-foreground">dari total investasi</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Holdings needing attention (health). */}
      {!loading && healthAlerts.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Perlu Perhatian Anda
              <Badge variant="outline" className="ml-auto font-normal">{healthAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {healthAlerts.map(p => (
              <button
                key={p.id}
                onClick={() => navigate(`/investor/portfolios/${p.id}/overview`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{brandOf(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.healthReasons?.length ? p.healthReasons.join(' · ') : HEALTH_LABELS[p.healthLevel ?? 'sehat']}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <HealthBadge level={p.healthLevel} reasons={p.healthReasons} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Allocation mix + distribution trend. */}
      {!loading && (activeAlloc.length > 0 || distTrend.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {activeAlloc.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm">Alokasi Investasi</CardTitle>
                <Tabs value={allocView} onValueChange={v => setAllocView(v as 'porto' | 'industri')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="porto" className="text-xs">Portofolio</TabsTrigger>
                    <TabsTrigger value="industri" className="text-xs">Industri</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <ResponsiveContainer width="100%" height={200} className="max-w-[240px]">
                    <PieChart>
                      <Pie data={activeAlloc} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                        {activeAlloc.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <RTooltip formatter={v => formatCurrencyExact(v as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full flex-1 space-y-1.5">
                    {activeAlloc.map((d, i) => {
                      const pct = totalInvested > 0 ? (d.value / totalInvested) * 100 : 0
                      return (
                        <div key={d.name} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
                          <span className="font-medium">{formatCurrencyCompact(d.value)}</span>
                          <span className="w-9 text-right text-muted-foreground">{Math.round(pct)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {distTrend.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tren Distribusi Bulanan</CardTitle>
                <p className="text-xs text-muted-foreground">Total bagi hasil diterima per periode</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={distTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={l => String(l).split(' ')[0]}
                    />
                    <RTooltip formatter={v => formatCurrencyExact(v as number)} labelClassName="text-xs" />
                    <Line type="monotone" dataKey="total" stroke="#1e5f3f" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold">Portofolio Saya</h2>
        <p className="text-muted-foreground">Portofolio yang ditugaskan kepada Anda</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : portfolios.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Belum ada portofolio yang ditugaskan kepada Anda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map(p => {
            const alloc = allocations.find(a => a.portfolioId === p.id)
            const hasReport = portfolioReportIds.has(p.id)
            return (
              <Card
                key={p.id}
                className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col"
                onClick={() => navigate(`/investor/portfolios/${p.id}/overview`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{brandOf(p)}</CardTitle>
                      {brandOf(p) !== p.name && (
                        <p className="text-xs text-muted-foreground mt-1">{p.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{p.code} · {p.stage}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-[#1e5f3f]/10 text-[#1e5f3f] rounded-full px-2 py-0.5 font-medium">{p.periode}</span>
                      <HealthBadge level={p.healthLevel} reasons={p.healthReasons} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 flex-1 flex flex-col">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Investasi Awal</span>
                    <span className="font-semibold text-[#1e5f3f]">{formatCurrencyCompact(p.investasiAwal)}</span>
                  </div>
                  {alloc && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Kepemilikan</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{formatPercent(ownershipFraction(alloc, p) * 100)}</Badge>
                        <span className="font-medium text-xs">{formatCurrencyCompact(alloc.investedAmount)}</span>
                      </div>
                    </div>
                  )}
                  {hasReport && (
                    <Link
                      to={`/investor/portfolios/${p.id}/report`}
                      onClick={e => e.stopPropagation()}
                      className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-[#1e5f3f] hover:underline"
                    >
                      <FileText className="h-4 w-4" />Lihat Laporan Proyek
                    </Link>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Income trail — full history of received transfer proofs. */}
      {notifications.length > 0 && (
        <Tabs defaultValue="history" className="mt-2">
          <TabsList>
            <TabsTrigger value="history">Riwayat Bukti Transfer</TabsTrigger>
          </TabsList>
          <TabsContent value="history">
            <TransferProofHistoryList notifications={notifications} resolveBrand={resolveBrand} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  )
}
