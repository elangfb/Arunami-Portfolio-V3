import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getAnalystPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact } from '@/lib/utils'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, LogOut, Briefcase, Search, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'
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
        <div className="flex h-16 items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e5f3f]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">ARUNAMI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Halo, {user?.displayName}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" />Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Analis</h1>
            <p className="text-muted-foreground">Kelola dan analisis semua portofolio investasi</p>
          </div>
          {!loading && portfolios.length > 0 && (
            <div className="relative w-64">
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
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="cursor-pointer select-none text-left px-3 py-3 font-medium" onClick={() => toggleSort('name')}>Nama Portofolio<SortIcon col="name" /></th>
                    <th className="cursor-pointer select-none text-left px-3 py-3 font-medium" onClick={() => toggleSort('code')}>Kode<SortIcon col="code" /></th>
                    <th className="cursor-pointer select-none text-left px-3 py-3 font-medium" onClick={() => toggleSort('stage')}>Tahap<SortIcon col="stage" /></th>
                    <th className="cursor-pointer select-none text-left px-3 py-3 font-medium" onClick={() => toggleSort('periode')}>Periode<SortIcon col="periode" /></th>
                    <th className="cursor-pointer select-none text-left px-3 py-3 font-medium" onClick={() => toggleSort('industryType')}>Industri<SortIcon col="industryType" /></th>
                    <th className="cursor-pointer select-none text-right px-3 py-3 font-medium" onClick={() => toggleSort('investasiAwal')}>Investasi Awal<SortIcon col="investasiAwal" /></th>
                    <th className="cursor-pointer select-none text-center px-3 py-3 font-medium" onClick={() => toggleSort('investors')}>Investor<SortIcon col="investors" /></th>
                    <th className="text-center px-3 py-3 font-medium">Grace Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map(p => (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/analyst/portfolios/${p.id}/overview`)}
                    >
                      <td className="px-3 py-3 align-middle">
                        <div className="font-medium">{p.name}</div>
                        {p.brandName && (
                          <div className="text-xs text-muted-foreground">{p.brandName}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-muted-foreground">{p.code}</td>
                      <td className="px-3 py-3 align-middle text-muted-foreground">{p.stage}</td>
                      <td className="px-3 py-3 align-middle">
                        <Badge variant="outline">{p.periode}</Badge>
                      </td>
                      <td className="px-3 py-3 align-middle text-muted-foreground">
                        {INDUSTRY_PRESETS[p.industryType]?.label ?? p.industryType}
                      </td>
                      <td className="px-3 py-3 align-middle text-right font-medium text-[#1e5f3f]">
                        {formatCurrencyCompact(p.investasiAwal)}
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        {p.assignedInvestors.length}
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        {p.isGracePeriod
                          ? <Badge variant="warning">Grace</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
