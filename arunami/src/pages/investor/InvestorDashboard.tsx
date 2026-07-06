import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getInvestorPortfolios, getAllocationsForInvestor, getPublishedInvestorReports } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { brandOf, makeBrandResolver } from '@/lib/portfolioName'
import { ownershipFraction } from '@/lib/distributionStrategies'
import { contractStatus } from '@/lib/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { AnnouncementsBanner } from '@/components/shared/AnnouncementsBanner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { TrendingUp, LogOut, Briefcase, FileText, Layers, ChevronRight, Wallet, FileClock, BarChart3, FolderOpen, User, AlertTriangle } from 'lucide-react'
import { HEALTH_LABELS } from '@/lib/health'
import TransferProofNotificationBanner from '@/components/investor/TransferProofNotificationBanner'
import { useTransferProofNotifications } from '@/components/investor/useTransferProofNotifications'
import TransferProofHistoryList from '@/components/investor/TransferProofHistoryList'
import type { Portfolio, InvestorAllocation, InvestorReportDoc } from '@/types'

const DONUT_COLORS = ['#1e5f3f', '#38a169', '#3182ce', '#d69e2e', '#805ad5', '#dd6b20', '#319795', '#e53e3e']

export default function InvestorDashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [loading, setLoading] = useState(true)
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

  // Whether the investor has any all-projects report (accumulated or all-time)
  // worth surfacing on the dedicated "My Report" page.
  const hasAllProjectReports = useMemo(
    () => reports.some(r => r.scope === 'accumulated' || r.scope === 'all_time'),
    [reports],
  )
  const unreadAllProjectReports = useMemo(
    () => reports.filter(r => (r.scope === 'accumulated' || r.scope === 'all_time') && !r.isRead).length,
    [reports],
  )
  // Holdings whose contract expires within 90 days (renewal-soon).
  const renewalSoonCount = useMemo(
    () => portfolios.filter(p => contractStatus(p.contractStart, p.contractEnd).severity === 'kritis').length,
    [portfolios],
  )
  const hasContracts = useMemo(
    () => portfolios.some(p => p.contractEnd),
    [portfolios],
  )

  // Portfolios that have a published per-project report → show a quick link.
  const portfolioReportIds = useMemo(
    () => new Set(reports.filter(r => r.scope !== 'accumulated' && r.scope !== 'all_time').map(r => r.portfolioId)),
    [reports],
  )

  // Bagi hasil recap — transfer-proof notifications are 1:1 with the payouts IR
  // sends, so summing their amounts gives the total profit-sharing received.
  const totalBagiHasil = useMemo(() => notifications.reduce((s, n) => s + n.amount, 0), [notifications])
  const totalInvested = useMemo(() => allocations.reduce((s, a) => s + a.investedAmount, 0), [allocations])

  // Allocation donut (by invested amount) + holdings needing attention (health).
  const allocationDonut = useMemo(
    () => allocations
      .filter(a => a.investedAmount > 0)
      .map(a => ({ name: portfolios.find(p => p.id === a.portfolioId)?.brandName || a.portfolioName, value: a.investedAmount })),
    [allocations, portfolios],
  )
  const healthAlerts = useMemo(
    () => portfolios.filter(p => (p.healthLevel ?? 'sehat') !== 'sehat'),
    [portfolios],
  )

  const handleLogout = async () => {
    await signOut(auth); setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

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
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">Halo, {user?.displayName}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" />Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <AnnouncementsBanner role="investor" />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/investor/distributions')}>
            <Wallet className="mr-1 h-4 w-4" />Distribusi
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/investor/performance')}>
            <BarChart3 className="mr-1 h-4 w-4" />Kinerja
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/investor/documents')}>
            <FolderOpen className="mr-1 h-4 w-4" />Dokumen
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/investor/profile')}>
            <User className="mr-1 h-4 w-4" />Profil
          </Button>
        </div>

        {/* Bukti transfer alerts — only visible while uncleared ones exist. */}
        <TransferProofNotificationBanner
          notifications={notifications}
          resolveBrand={resolveBrand}
          onChanged={reloadNotifications}
        />

        {/* Total bagi hasil recap — all profit-sharing received, in one view. */}
        {!loading && (allocations.length > 0 || notifications.length > 0) && (
          <Card className="border-0 bg-[#1e5f3f] text-white">
            <CardContent className="py-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-white/80">Total Bagi Hasil Diterima</p>
                    <p className="text-3xl font-bold tracking-tight">{formatCurrencyExact(totalBagiHasil)}</p>
                    <p className="mt-0.5 text-xs text-white/70">
                      {notifications.length > 0
                        ? `Dari ${notifications.length} pembayaran`
                        : 'Belum ada pembayaran bagi hasil'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 sm:border-l sm:border-white/20 sm:pl-6">
                  <div>
                    <p className="text-xs text-white/70">Total Investasi</p>
                    <p className="text-lg font-semibold">{formatCurrencyCompact(totalInvested)}</p>
                  </div>
                  {totalInvested > 0 && (
                    <div>
                      <p className="text-xs text-white/70">Bagi Hasil / Investasi</p>
                      <p className="text-lg font-semibold">{formatPercent((totalBagiHasil / totalInvested) * 100)}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Allocation mix + holdings needing attention (additive enrichments). */}
        {!loading && (allocationDonut.length > 0 || healthAlerts.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {allocationDonut.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Komposisi Alokasi</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={allocationDonut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {allocationDonut.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <RTooltip formatter={v => formatCurrencyExact(v as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {allocationDonut.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {healthAlerts.length > 0 && (
              <Card className="border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />Perlu Perhatian
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {healthAlerts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/investor/portfolios/${p.id}/overview`)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{brandOf(p)}</p>
                        <p className="text-xs text-muted-foreground">{HEALTH_LABELS[p.healthLevel ?? 'sehat']}</p>
                      </div>
                      <HealthBadge level={p.healthLevel} reasons={p.healthReasons} />
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* All-projects reports live on the dedicated "My Report" page. */}
        {hasAllProjectReports && (
          <Card
            className="border-[#1e5f3f]/30 cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => navigate('/investor/reports')}
          >
            <CardContent className="flex items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                  <Layers className="h-5 w-5 text-[#1e5f3f]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">Laporan Saya</p>
                    {unreadAllProjectReports > 0 && (
                      <Badge variant="warning">{unreadAllProjectReports} baru</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ringkasan kinerja seluruh proyek — sepanjang waktu & per periode
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        )}

        {hasContracts && (
          <Card
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => navigate('/investor/contracts')}
          >
            <CardContent className="flex items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                  <FileClock className="h-5 w-5 text-[#1e5f3f]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">Kontrak & Perpanjangan</p>
                    {renewalSoonCount > 0 && (
                      <Badge variant="danger">{renewalSoonCount} segera berakhir</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Masa berlaku kontrak setiap portofolio Anda</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-2xl font-bold">Portofolio Saya</h1>
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
    </div>
  )
}
