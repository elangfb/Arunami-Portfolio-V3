import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getAnalystPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact } from '@/lib/utils'
import { brandOf } from '@/lib/portfolioName'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { AnnouncementsBanner } from '@/components/shared/AnnouncementsBanner'
import { TrendingUp, LogOut, Briefcase, Search, ChevronUp, ChevronDown, ArrowUpDown, FileClock, LayoutDashboard, Table2, BarChart3, Presentation, Mail, StickyNote } from 'lucide-react'
import type { Portfolio } from '@/types'

type SortKey = 'name' | 'code' | 'stage' | 'periode' | 'industryType' | 'investasiAwal' | 'investors'

export default function AnalystDashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (!user) return
    getAnalystPortfolios(user.uid).then(data => { setPortfolios(data); setLoading(false) })
  }, [user])

  const handleLogout = async () => {
    await signOut(auth); setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = portfolios.filter(p => {
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.brandName ?? '').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'investasiAwal':
        cmp = a.investasiAwal - b.investasiAwal
        break
      case 'investors':
        cmp = a.assignedInvestors.length - b.assignedInvestors.length
        break
      default:
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/40" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 inline h-3 w-3" />
      : <ChevronDown className="ml-1 inline h-3 w-3" />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
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

      <main className="p-4 sm:p-6 lg:p-8">
        <AnnouncementsBanner role="analyst" />
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/overview')}>
            <LayoutDashboard className="mr-1 h-4 w-4" />Ringkasan Global
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/monthly')}>
            <Table2 className="mr-1 h-4 w-4" />Data Bulanan
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/benchmarking')}>
            <BarChart3 className="mr-1 h-4 w-4" />Benchmarking
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/renewals')}>
            <FileClock className="mr-1 h-4 w-4" />Perpanjangan Kontrak
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/engagement')}>
            <Mail className="mr-1 h-4 w-4" />Engagement
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/notes')}>
            <StickyNote className="mr-1 h-4 w-4" />Catatan Global
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analyst/meeting')}>
            <Presentation className="mr-1 h-4 w-4" />Mode Rapat
          </Button>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Analis</h1>
            <p className="text-muted-foreground">Kelola dan analisis semua portofolio investasi</p>
          </div>
          {!loading && portfolios.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari portofolio..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : portfolios.length === 0 ? (
          <Card><CardContent className="py-16 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Belum ada portofolio tersedia</p>
          </CardContent></Card>
        ) : sorted.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Tidak ada portofolio yang cocok</CardContent></Card>
        ) : (
          <>
          {/* Mobile: card list */}
          <div className="space-y-3 md:hidden">
            {sorted.map(p => (
              <Card
                key={p.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/analyst/portfolios/${p.id}/overview`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{brandOf(p)}</div>
                      {brandOf(p) !== p.name && (
                        <div className="truncate text-xs text-muted-foreground">{p.name}</div>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">{p.code} · {p.stage}</div>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0">{p.periode}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{INDUSTRY_PRESETS[p.industryType]?.label ?? p.industryType}</span>
                    <span className="font-semibold text-[#1e5f3f]">{formatCurrencyCompact(p.investasiAwal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{p.assignedInvestors.length} investor</span>
                      <HealthBadge level={p.healthLevel} reasons={p.healthReasons} />
                    </div>
                    {p.isGracePeriod
                      ? <Badge variant="warning">Grace · {p.graceConfig?.returnMode === 'fixed_yield' ? 'Yield' : 'Tanpa payout'}</Badge>
                      : <span>—</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>Nama Portofolio<SortIcon col="name" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('code')}>Kode<SortIcon col="code" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('stage')}>Tahap<SortIcon col="stage" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('periode')}>Periode<SortIcon col="periode" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('industryType')}>Industri<SortIcon col="industryType" /></TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('investasiAwal')}>Investasi Awal<SortIcon col="investasiAwal" /></TableHead>
                  <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort('investors')}>Investor<SortIcon col="investors" /></TableHead>
                  <TableHead className="text-center">Kesehatan</TableHead>
                  <TableHead className="text-center">Grace Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(p => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/analyst/portfolios/${p.id}/overview`)}
                  >
                    <TableCell>
                      <div className="font-medium">{brandOf(p)}</div>
                      {brandOf(p) !== p.name && (
                        <div className="text-xs text-muted-foreground">{p.name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.code}</TableCell>
                    <TableCell className="text-muted-foreground">{p.stage}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.periode}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {INDUSTRY_PRESETS[p.industryType]?.label ?? p.industryType}
                    </TableCell>
                    <TableCell className="text-right font-medium text-[#1e5f3f]">
                      {formatCurrencyCompact(p.investasiAwal)}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.assignedInvestors.length}
                    </TableCell>
                    <TableCell className="text-center">
                      <HealthBadge level={p.healthLevel} reasons={p.healthReasons} />
                    </TableCell>
                    <TableCell className="text-center">
                      {p.isGracePeriod
                        ? <Badge variant="warning">Grace · {p.graceConfig?.returnMode === 'fixed_yield' ? 'Yield' : 'Tanpa payout'}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          </>
        )}
      </main>
    </div>
  )
}
