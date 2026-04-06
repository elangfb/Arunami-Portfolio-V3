import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllUsers, getAllAllocations } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyCompact } from '@/lib/utils'
import { Search, Eye, Users, Wallet, Layers } from 'lucide-react'
import type { AppUser, InvestorAllocation, InvestorSummary } from '@/types'

export default function AdminInvestors() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [summaries, setSummaries] = useState<InvestorSummary[]>([])

  useEffect(() => {
    ;(async () => {
      const [users, allocations] = await Promise.all([getAllUsers(), getAllAllocations()])
      const investors = users.filter(u => u.role === 'investor')

      const allocByInvestor = new Map<string, InvestorAllocation[]>()
      for (const a of allocations) {
        const arr = allocByInvestor.get(a.investorUid) ?? []
        arr.push(a)
        allocByInvestor.set(a.investorUid, arr)
      }

      const result: InvestorSummary[] = investors.map(user => {
        const allocs = allocByInvestor.get(user.uid) ?? []
        return {
          user,
          allocations: allocs,
          totalInvested: allocs.reduce((s, a) => s + a.investedAmount, 0),
          totalSlots: allocs.reduce((s, a) => s + a.slots, 0),
          portfolioCount: allocs.length,
        }
      })

      setSummaries(result)
      setLoading(false)
    })()
  }, [])

  const filtered = summaries.filter(s => {
    const q = search.toLowerCase()
    return s.user.displayName.toLowerCase().includes(q) || s.user.email.toLowerCase().includes(q)
  })

  const totalInvestors = summaries.length
  const totalInvested = summaries.reduce((s, i) => s + i.totalInvested, 0)
  const totalSlots = summaries.reduce((s, i) => s + i.totalSlots, 0)

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Investor</h1>
          <p className="text-muted-foreground">Kelola data dan komunikasi dengan investor</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari investor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
              <Users className="h-5 w-5 text-[#1e5f3f]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Investor</p>
              <p className="text-xl font-bold">{totalInvestors}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
              <Wallet className="h-5 w-5 text-[#1e5f3f]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Investasi</p>
              <p className="text-xl font-bold">{formatCurrencyCompact(totalInvested)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
              <Layers className="h-5 w-5 text-[#1e5f3f]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Slot Teralokasi</p>
              <p className="text-xl font-bold">{totalSlots}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
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
                    <th className="text-center py-2.5 px-3 font-medium">Total Slot</th>
                    <th className="text-right py-2.5 px-3 font-medium">Total Investasi</th>
                    <th className="text-right py-2.5 px-3 font-medium w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(s => (
                    <tr key={s.user.uid} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] font-bold text-sm shrink-0">
                            {s.user.displayName?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{s.user.displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {s.allocations.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {s.allocations.map(a => (
                              <Badge key={a.id} variant="outline" className="text-xs">
                                {a.portfolioCode} ({a.slots})
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="secondary">{s.totalSlots}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {formatCurrencyCompact(s.totalInvested)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/investors/${s.user.uid}`)}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Detail
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
