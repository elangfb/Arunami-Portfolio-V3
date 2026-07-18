import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getAnalystPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { brandOf } from '@/lib/portfolioName'
import { contractStatus, daysRemainingLabel, type ContractSeverity } from '@/lib/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ContractBadge, ContractDurationBar } from '@/components/shared/ContractStatus'
import { TrendingUp, ArrowLeft, AlertTriangle, FileClock } from 'lucide-react'
import type { Portfolio } from '@/types'

interface Row {
  portfolio: Portfolio
  severity: ContractSeverity
  daysRemaining: number | null
}

export default function AnalystRenewals() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getAnalystPortfolios(user.uid).then(data => { setPortfolios(data); setLoading(false) })
  }, [user])

  const rows = useMemo<Row[]>(() => {
    return portfolios
      .map(p => {
        const { severity, daysRemaining } = contractStatus(p.contractStart, p.contractEnd)
        return { portfolio: p, severity, daysRemaining }
      })
      // Portfolios with a contract first, sorted by soonest expiry; no-contract last.
      .sort((a, b) => {
        if (a.daysRemaining === null && b.daysRemaining === null) return 0
        if (a.daysRemaining === null) return 1
        if (b.daysRemaining === null) return -1
        return a.daysRemaining - b.daysRemaining
      })
  }, [portfolios])

  const counts = useMemo(() => {
    const c: Record<ContractSeverity, number> = { kritis: 0, segera: 0, aman: 0, unknown: 0 }
    rows.forEach(r => { c[r.severity]++ })
    return c
  }, [rows])

  const critical = rows.filter(r => r.severity === 'kritis')

  const kpis: { label: string; value: number; tone: string }[] = [
    { label: 'Kritis (<90 hari)', value: counts.kritis, tone: 'text-red-600' },
    { label: 'Segera (<180 hari)', value: counts.segera, tone: 'text-yellow-600' },
    { label: 'Aman (>180 hari)', value: counts.aman, tone: 'text-green-600' },
    { label: 'Tanpa Kontrak', value: counts.unknown, tone: 'text-muted-foreground' },
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
            <FileClock className="h-6 w-6 text-[#38a169]" />
            Perpanjangan Kontrak
          </h1>
          <p className="text-muted-foreground">Pantau kontrak portofolio berdasarkan waktu jatuh tempo</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpis.map(k => (
                <Card key={k.label}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className={`mt-1 text-3xl font-bold ${k.tone}`}>{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {critical.length > 0 && (
              <Card className="border-red-300">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Perlu Tindakan Segera ({critical.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {critical.map(({ portfolio, daysRemaining }) => (
                    <Link
                      key={portfolio.id}
                      to={`/analyst/portfolios/${portfolio.id}/overview`}
                      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm hover:bg-red-100"
                    >
                      <span className="font-medium">{brandOf(portfolio)}</span>
                      <span className="font-medium text-red-700">{daysRemainingLabel(daysRemaining)}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Portofolio</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Akhir</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Durasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada portofolio.</TableCell></TableRow>
                  ) : rows.map(({ portfolio, severity }) => (
                    <TableRow
                      key={portfolio.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/analyst/portfolios/${portfolio.id}/overview`)}
                    >
                      <TableCell>
                        <p className="font-medium">{brandOf(portfolio)}</p>
                        <p className="text-xs text-muted-foreground">{portfolio.code}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{portfolio.contractStart || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{portfolio.contractEnd || '—'}</TableCell>
                      <TableCell className="text-center"><ContractBadge severity={severity} /></TableCell>
                      <TableCell>
                        <ContractDurationBar start={portfolio.contractStart} end={portfolio.contractEnd} className="min-w-[140px]" />
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
