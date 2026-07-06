import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getAnalystPortfolios } from '@/lib/firestore'
import { loadPortfolioMetrics, type PortfolioMetric } from '@/lib/analystMetrics'
import { useAuthStore } from '@/store/authStore'
import { brandOf } from '@/lib/portfolioName'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { HEALTH_LEVELS } from '@/lib/health'
import { contractStatus } from '@/lib/contracts'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, ArrowLeft, LayoutDashboard, AlertTriangle, Wallet, Percent, Briefcase, FileWarning } from 'lucide-react'
import type { Portfolio } from '@/types'

/** Current reporting period as YYYY-MM. */
function currentPeriodKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Alert {
  portfolio: Portfolio
  kind: 'health' | 'contract'
  text: string
}

export default function AnalystOverview() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [metrics, setMetrics] = useState<PortfolioMetric[]>([])
  const [loading, setLoading] = useState(true)
  const period = currentPeriodKey()

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      setPortfolios(ports)
      setMetrics(await loadPortfolioMetrics(ports, period))
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const totalInvestment = useMemo(
    () => portfolios.filter(p => !p.isGracePeriod).reduce((s, p) => s + p.investasiAwal, 0),
    [portfolios],
  )
  const totalBagiHasil = useMemo(() => metrics.reduce((s, m) => s + m.bagiHasil, 0), [metrics])
  const avgYield = useMemo(() => {
    const withData = metrics.filter(m => m.hasData)
    return withData.length ? withData.reduce((s, m) => s + m.annualizedYield, 0) / withData.length : 0
  }, [metrics])

  const healthCounts = useMemo(
    () => HEALTH_LEVELS.map(level => ({
      level, count: portfolios.filter(p => (p.healthLevel ?? 'sehat') === level).length,
    })),
    [portfolios],
  )

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = []
    for (const p of portfolios) {
      if (p.healthLevel && p.healthLevel !== 'sehat') {
        out.push({ portfolio: p, kind: 'health', text: p.healthReasons?.[0] ?? 'Perlu perhatian (wanprestasi)' })
      }
      if (contractStatus(p.contractStart, p.contractEnd).severity === 'kritis') {
        out.push({ portfolio: p, kind: 'contract', text: 'Kontrak akan segera berakhir' })
      }
    }
    return out
  }, [portfolios])

  const notSubmitted = useMemo(
    () => metrics.filter(m => !m.portfolio.isGracePeriod && !m.hasCurrentPeriod),
    [metrics],
  )

  const stats = [
    { label: 'Total Portofolio', value: String(portfolios.length), icon: Briefcase, tone: 'text-[#38a169]' },
    { label: 'Total Investasi Aktif', value: formatCurrencyCompact(totalInvestment), icon: Wallet, tone: 'text-blue-600' },
    { label: 'Total Bagi Hasil (terakhir)', value: formatCurrencyCompact(totalBagiHasil), icon: TrendingUp, tone: 'text-purple-600' },
    { label: 'Rata-rata Yield (p.a.)', value: formatPercent(avgYield), icon: Percent, tone: 'text-orange-600' },
  ]

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
            <LayoutDashboard className="h-6 w-6 text-[#38a169]" />
            Ringkasan Global
          </h1>
          <p className="text-muted-foreground">Kinerja seluruh portofolio yang Anda kelola</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, tone }) => (
                <Card key={label}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                    <Icon className={`h-5 w-5 ${tone}`} />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Distribusi Kesehatan</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {healthCounts.map(({ level, count }) => (
                    <div key={level} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                      <HealthBadge level={level} />
                      <span className="text-lg font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-500" />Perhatian</CardTitle></CardHeader>
                <CardContent>
                  {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Tidak ada peringatan aktif.</p>
                  ) : (
                    <div className="space-y-2">
                      {alerts.map((a, i) => (
                        <Link
                          key={`${a.portfolio.id}-${a.kind}-${i}`}
                          to={`/analyst/portfolios/${a.portfolio.id}/overview`}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
                        >
                          <span className="font-medium">{brandOf(a.portfolio)}</span>
                          <span className="text-xs text-muted-foreground">{a.text}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileWarning className="h-4 w-4 text-muted-foreground" />Belum Submit Bulan Ini</CardTitle></CardHeader>
                <CardContent>
                  {notSubmitted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Semua portofolio sudah melaporkan data bulan ini.</p>
                  ) : (
                    <div className="space-y-2">
                      {notSubmitted.map(m => (
                        <Link
                          key={m.portfolio.id}
                          to={`/analyst/portfolios/${m.portfolio.id}/pnl`}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
                        >
                          <span className="font-medium">{brandOf(m.portfolio)}</span>
                          <span className="text-xs text-muted-foreground">{m.portfolio.code}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
