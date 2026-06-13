import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getInvestorPortfolios, getAllocationsForInvestor, getPublishedInvestorReports } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { ownershipFraction } from '@/lib/distributionStrategies'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, LogOut, Briefcase, FileText, Layers, ChevronRight } from 'lucide-react'
import type { Portfolio, InvestorAllocation, InvestorReportDoc } from '@/types'

export default function InvestorDashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [loading, setLoading] = useState(true)

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

  // Portfolios that have a published per-project report → show a quick link.
  const portfolioReportIds = useMemo(
    () => new Set(reports.filter(r => r.scope !== 'accumulated' && r.scope !== 'all_time').map(r => r.portfolioId)),
    [reports],
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
                  <p className="font-semibold">Laporan Saya</p>
                  <p className="text-xs text-muted-foreground">
                    Ringkasan kinerja seluruh proyek — sepanjang waktu & per periode
                  </p>
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
                        <CardTitle className="text-base">{p.brandName || p.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.code} · {p.stage}</p>
                      </div>
                      <span className="text-xs bg-[#1e5f3f]/10 text-[#1e5f3f] rounded-full px-2 py-0.5 font-medium">{p.periode}</span>
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
      </main>
    </div>
  )
}
