import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getAllUsers, getAllPortfolios, getAllAllocations, getDistributionBatches } from '@/lib/firestore'
import { buildAdminExport, downloadJson } from '@/lib/exportData'
import { kycStatusOf } from '@/lib/kyc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { HEALTH_LEVELS } from '@/lib/health'
import {
  Users, Briefcase, UserCheck, BarChart2, Download,
  ShieldCheck, Banknote, ChevronRight, CheckCircle2, ClipboardList,
} from 'lucide-react'
import type { AppUser, Portfolio, InvestorAllocation, DistributionBatch } from '@/types'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AppUser[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [batches, setBatches] = useState<DistributionBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const data = await buildAdminExport()
      const date = new Date().toISOString().slice(0, 10)
      downloadJson(data, `arunami-export-${date}.json`)
      toast.success('Data berhasil diekspor')
    } catch (err) {
      console.error('Export failed', err)
      toast.error('Gagal mengekspor data')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    Promise.all([getAllUsers(), getAllPortfolios(), getAllAllocations(), getDistributionBatches()])
      .then(([u, p, a, b]) => {
        setUsers(u)
        setPortfolios(p)
        setAllocations(a)
        setBatches(b)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const analysts = users.filter(u => u.role === 'analyst')
  const investors = users.filter(u => u.role === 'investor')

  // Additive operational task queue — actionable counts deep-linked to their page.
  const allocatedUids = new Set(allocations.map(a => a.investorUid))
  const tasks = [
    {
      key: 'kyc',
      label: 'Investor menunggu verifikasi KYC',
      icon: ShieldCheck,
      count: investors.filter(u => !u.archived && kycStatusOf(u.kycStatus) === 'pending').length,
      to: '/admin/kyc',
    },
    {
      key: 'batches',
      label: 'Batch distribusi perlu diproses',
      icon: Banknote,
      count: batches.filter(b => b.status !== 'completed' && b.lines.some(l => l.status === 'pending')).length,
      to: '/admin/distributions',
    },
    {
      key: 'analyst',
      label: 'Portofolio tanpa analis',
      icon: Briefcase,
      count: portfolios.filter(p => (p.assignedAnalysts?.length ?? 0) === 0).length,
      to: '/admin/portfolios',
    },
    {
      key: 'alloc',
      label: 'Investor tanpa alokasi',
      icon: UserCheck,
      count: investors.filter(u => !u.archived && !allocatedUids.has(u.uid)).length,
      to: '/admin/investors',
    },
  ]
  const openTasks = tasks.filter(t => t.count > 0)

  const healthCounts = HEALTH_LEVELS.map(level => ({
    level,
    count: portfolios.filter(p => (p.healthLevel ?? 'sehat') === level).length,
  }))

  const stats = [
    { label: 'Total Pengguna', value: users.length, icon: Users, color: 'text-blue-600' },
    { label: 'Total Portofolio', value: portfolios.length, icon: Briefcase, color: 'text-[#38a169]' },
    { label: 'Analis', value: analysts.length, icon: BarChart2, color: 'text-purple-600' },
    { label: 'Investor', value: investors.length, icon: UserCheck, color: 'text-orange-600' },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Admin</h1>
          <p className="text-muted-foreground">Selamat datang di panel administrasi ARUNAMI</p>
        </div>
        <Button onClick={handleExport} disabled={exporting} className="shrink-0">
          <Download className="mr-1 h-4 w-4" />
          {exporting ? 'Mengekspor…' : 'Ekspor Data'}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-5 w-5 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && portfolios.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distribusi Kesehatan Portofolio</CardTitle>
          </CardHeader>
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
      )}

      {!loading && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-[#38a169]" />
              Perlu Tindak Lanjut
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Semua beres — tidak ada tugas tertunda.
              </div>
            ) : (
              <div className="space-y-2">
                {openTasks.map(({ key, label, icon: Icon, count, to }) => (
                  <button
                    key={key}
                    onClick={() => navigate(to)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{label}</span>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                      {count}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar Portofolio</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada portofolio</p>
            ) : (
              <div className="space-y-3">
                {portfolios.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.code} · {p.stage}
                        {p.isGracePeriod && (
                          <span className="ml-2 font-medium text-amber-600">
                            · Grace{p.graceConfig?.returnMode === 'fixed_yield' ? ' (Yield)' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{p.assignedInvestors.length} investor</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengguna Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pengguna</p>
            ) : (
              <div className="space-y-3">
                {users.slice(0, 6).map(u => (
                  <div key={u.uid} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] text-xs font-bold">
                      {u.displayName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
