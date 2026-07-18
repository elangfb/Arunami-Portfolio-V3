import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInvestorPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { brandOf } from '@/lib/portfolioName'
import { contractStatus, daysRemainingLabel, type ContractSeverity } from '@/lib/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ContractBadge, ContractDurationBar } from '@/components/shared/ContractStatus'
import { TrendingUp, ArrowLeft, AlertTriangle, FileClock } from 'lucide-react'
import type { Portfolio } from '@/types'

export default function InvestorContractsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getInvestorPortfolios(user.uid).then(p => { setPortfolios(p); setLoading(false) })
  }, [user])

  const rows = useMemo(() => {
    return portfolios
      .map(p => ({ portfolio: p, ...contractStatus(p.contractStart, p.contractEnd) }))
      .sort((a, b) => {
        if (a.daysRemaining === null && b.daysRemaining === null) return 0
        if (a.daysRemaining === null) return 1
        if (b.daysRemaining === null) return -1
        return a.daysRemaining - b.daysRemaining
      })
  }, [portfolios])

  const criticalCount = rows.filter(r => r.severity === 'kritis').length

  const sevLabel = (s: ContractSeverity) =>
    s === 'kritis' ? 'kontrak segera berakhir' : s === 'segera' ? 'perlu ditinjau' : ''

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
          <Button variant="ghost" size="sm" onClick={() => navigate('/investor')}>
            <ArrowLeft className="mr-1 h-4 w-4" />Kembali
          </Button>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileClock className="h-6 w-6 text-[#1e5f3f]" />
            Kontrak & Perpanjangan
          </h1>
          <p className="text-muted-foreground">Masa berlaku kontrak untuk setiap portofolio Anda</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            {criticalCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-red-900">{criticalCount} kontrak akan segera berakhir</p>
                  <p className="text-sm text-red-700">Tim Arunami akan menghubungi Anda terkait keputusan perpanjangan.</p>
                </div>
              </div>
            )}

            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Portofolio</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Akhir</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Sisa Waktu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada portofolio.</TableCell></TableRow>
                  ) : rows.map(({ portfolio, severity, daysRemaining }) => (
                    <TableRow
                      key={portfolio.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/investor/portfolios/${portfolio.id}/contract`)}
                    >
                      <TableCell>
                        <p className="font-medium">{brandOf(portfolio)}</p>
                        <p className="text-xs text-muted-foreground">{portfolio.code}{sevLabel(severity) && ` · ${sevLabel(severity)}`}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{portfolio.contractStart || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{portfolio.contractEnd || '—'}</TableCell>
                      <TableCell className="text-center"><ContractBadge severity={severity} /></TableCell>
                      <TableCell className="text-right font-medium">{daysRemainingLabel(daysRemaining)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Duration bars for a quick visual scan */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.filter(r => r.severity !== 'unknown').map(({ portfolio }) => (
                <Card key={portfolio.id}>
                  <CardContent className="pt-4">
                    <p className="mb-2 text-sm font-medium">{brandOf(portfolio)}</p>
                    <ContractDurationBar start={portfolio.contractStart} end={portfolio.contractEnd} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
