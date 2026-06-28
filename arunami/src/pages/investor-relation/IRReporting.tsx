import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  getAllUsers, getAllAllocations, getInvestorReportSources, getPublishedInvestorReports,
} from '@/lib/firestore'
import type { InvestorReportSource } from '@/lib/firestore'
import { comparePeriods } from '@/lib/dateUtils'
import { formatCurrencyCompact } from '@/lib/utils'
import { makeBrandResolver } from '@/lib/portfolioName'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Search, FileText, ChevronRight } from 'lucide-react'
import InvestorReportForm from '@/pages/admin/components/InvestorReportForm'
import InvestorReportHistory from '@/pages/admin/components/InvestorReportHistory'
import type { AppUser, InvestorAllocation, InvestorReportDoc, Portfolio } from '@/types'

type View = 'home' | 'investor' | 'generate'

interface InvestorRow {
  user: AppUser
  allocations: InvestorAllocation[]
  totalInvested: number
}

export default function IRReporting() {
  const [view, setView] = useState<View>('home')

  // Home (investor picker)
  const [rows, setRows] = useState<InvestorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Selected investor
  const [investor, setInvestor] = useState<AppUser | null>(null)
  const [portfolioData, setPortfolioData] = useState<InvestorReportSource[]>([])
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [investorLoading, setInvestorLoading] = useState(false)
  const resolveBrand = useMemo(
    () => makeBrandResolver(portfolioData.map(p => p.portfolio).filter((x): x is Portfolio => !!x)),
    [portfolioData],
  )

  useEffect(() => {
    ;(async () => {
      const [users, allocations] = await Promise.all([getAllUsers(), getAllAllocations()])
      const investors = users.filter(u => u.role === 'investor')

      const byInvestor = new Map<string, InvestorAllocation[]>()
      for (const a of allocations) {
        const arr = byInvestor.get(a.investorUid) ?? []
        arr.push(a)
        byInvestor.set(a.investorUid, arr)
      }

      setRows(
        investors.map(user => {
          const allocs = byInvestor.get(user.uid) ?? []
          return {
            user,
            allocations: allocs,
            totalInvested: allocs.reduce((s, a) => s + a.investedAmount, 0),
          }
        }),
      )
      setLoading(false)
    })()
  }, [])

  const loadInvestor = async (user: AppUser) => {
    setInvestor(user)
    setView('investor')
    setInvestorLoading(true)
    try {
      const [data, published] = await Promise.all([
        getInvestorReportSources(user.uid),
        getPublishedInvestorReports(user.uid),
      ])
      setPortfolioData(data)
      setReports([...published].sort((a, b) => comparePeriods(b.period, a.period)))
    } catch {
      toast.error('Gagal memuat data investor')
    } finally {
      setInvestorLoading(false)
    }
  }

  const refreshReports = async () => {
    if (!investor) return
    const published = await getPublishedInvestorReports(investor.uid)
    setReports([...published].sort((a, b) => comparePeriods(b.period, a.period)))
  }

  const backToHome = () => {
    setView('home')
    setInvestor(null)
    setPortfolioData([])
    setReports([])
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return r.user.displayName.toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q)
  })

  // ─── Home: investor picker ─────────────────────────────────────────────────
  if (view === 'home') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Review &amp; Publishing</h1>
            <p className="text-muted-foreground">Pilih investor untuk membuat & menerbitkan laporan</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari investor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar Investor ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? 'Tidak ada investor yang cocok' : 'Belum ada investor'}
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-medium">Nama</th>
                      <th className="text-left py-2.5 px-3 font-medium">Portofolio Aktif</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total Investasi</th>
                      <th className="text-right py-2.5 px-3 font-medium w-28">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(r => (
                      <tr key={r.user.uid} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] font-bold text-sm shrink-0">
                              {r.user.displayName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.user.displayName}</p>
                              <p className="text-xs text-muted-foreground truncate">{r.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {r.allocations.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {r.allocations.map(a => (
                                <Badge key={a.id} variant="outline" className="text-xs">
                                  {a.portfolioCode}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatCurrencyCompact(r.totalInvested)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => loadInvestor(r.user)}>
                            Pilih
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!investor) return null

  // ─── Investor view: history + create button ────────────────────────────────
  if (view === 'investor') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={backToHome}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{investor.displayName}</h1>
              {investor.isArunamiTeam && (
                <Badge variant="outline" className="border-green-600 text-green-700">Tim Arunami</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{investor.email}</p>
          </div>
          <Button onClick={() => setView('generate')}>
            <FileText className="mr-2 h-4 w-4" />
            Buat Laporan
          </Button>
        </div>

        {investorLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <InvestorReportHistory reports={reports} resolveBrand={resolveBrand} onChanged={refreshReports} />
        )}
      </div>
    )
  }

  // ─── Generate view: inline report form ─────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setView('investor')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Buat Laporan</h1>
          <p className="text-sm text-muted-foreground">{investor.displayName}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <InvestorReportForm
            investor={investor}
            portfolioData={portfolioData}
            publishedReports={reports}
            onDone={async () => {
              await refreshReports()
              setView('investor')
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
