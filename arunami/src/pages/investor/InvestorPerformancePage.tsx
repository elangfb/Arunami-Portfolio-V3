import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getInvestorPortfolios, getAllocationsForInvestor,
  getTransferProofsForInvestor, getBagiHasilManualEntriesForInvestor,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TrendingUp, ArrowLeft, BarChart3, Wallet, Percent } from 'lucide-react'
import type { Portfolio, InvestorAllocation } from '@/types'

interface Payout { portfolioId: string | null; period: string; amount: number }
interface HoldingPerf {
  portfolio: Portfolio
  invested: number
  received: number
  realizedYield: number
}

export default function InvestorPerformancePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [ports, allocs, proofs, manual] = await Promise.all([
        getInvestorPortfolios(user.uid),
        getAllocationsForInvestor(user.uid),
        getTransferProofsForInvestor(user.uid),
        getBagiHasilManualEntriesForInvestor(user.uid),
      ])
      setPortfolios(ports)
      setAllocations(allocs)
      // Manual wins per (portfolio × period) so a backfill isn't double-counted.
      const manualKeys = new Set(manual.map(m => `${m.portfolioId}_${m.period}`))
      const merged: Payout[] = [
        ...manual.map(m => ({ portfolioId: m.portfolioId, period: m.period, amount: m.bagiHasilAmount })),
        ...proofs
          .filter(p => !manualKeys.has(`${p.portfolioId}_${p.period}`))
          .map(p => ({ portfolioId: p.portfolioId, period: p.period, amount: p.amount })),
      ]
      setPayouts(merged)
      setLoading(false)
    })()
  }, [user])

  const holdings: HoldingPerf[] = useMemo(() => {
    const receivedByPortfolio = new Map<string, number>()
    for (const p of payouts) {
      if (!p.portfolioId) continue
      receivedByPortfolio.set(p.portfolioId, (receivedByPortfolio.get(p.portfolioId) ?? 0) + p.amount)
    }
    return portfolios.map(pf => {
      const invested = allocations.filter(a => a.portfolioId === pf.id).reduce((s, a) => s + a.investedAmount, 0)
      const received = receivedByPortfolio.get(pf.id) ?? 0
      return { portfolio: pf, invested, received, realizedYield: invested > 0 ? (received / invested) * 100 : 0 }
    }).sort((a, b) => b.realizedYield - a.realizedYield)
  }, [portfolios, allocations, payouts])

  const totals = useMemo(() => {
    const invested = holdings.reduce((s, h) => s + h.invested, 0)
    const received = holdings.reduce((s, h) => s + h.received, 0)
    return { invested, received, blendedYield: invested > 0 ? (received / invested) * 100 : 0 }
  }, [holdings])

  // Distribution matrix: rows = period (newest first), cols = portfolio.
  const matrix = useMemo(() => {
    const periods = [...new Set(payouts.map(p => p.period))].sort((a, b) => comparePeriods(b, a))
    const byKey = new Map<string, number>()
    for (const p of payouts) byKey.set(`${p.portfolioId}_${p.period}`, (byKey.get(`${p.portfolioId}_${p.period}`) ?? 0) + p.amount)
    return { periods, byKey }
  }, [payouts])

  const chartData = holdings
    .filter(h => h.invested > 0)
    .map(h => ({ name: h.portfolio.brandName || h.portfolio.name, value: h.realizedYield }))

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
            <BarChart3 className="h-6 w-6 text-[#1e5f3f]" />
            Kinerja Investasi
          </h1>
          <p className="text-muted-foreground">Yield terrealisasi dan distribusi bagi hasil lintas portofolio</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard icon={Wallet} label="Total Investasi" value={formatCurrencyCompact(totals.invested)} />
              <StatCard icon={TrendingUp} label="Total Bagi Hasil" value={formatCurrencyCompact(totals.received)} />
              <StatCard icon={Percent} label="Yield Terrealisasi (blended)" value={formatPercent(totals.blendedYield)} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Yield Terrealisasi per Portofolio</CardTitle></CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data untuk ditampilkan.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 44)}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => formatPercent(v as number)} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={v => formatPercent(v as number)} />
                      <Bar dataKey="value" fill="#1e5f3f" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Matriks Distribusi (periode × portofolio)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {matrix.periods.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Belum ada distribusi.</p>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Periode</TableHead>
                        {holdings.map(h => (
                          <TableHead key={h.portfolio.id} className="text-right">{h.portfolio.brandName || h.portfolio.name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrix.periods.map(period => (
                        <TableRow key={period}>
                          <TableCell className="font-medium">{formatPeriod(period)}</TableCell>
                          {holdings.map(h => {
                            const amt = matrix.byKey.get(`${h.portfolio.id}_${period}`) ?? 0
                            return (
                              <TableCell key={h.portfolio.id} className="text-right">
                                {amt > 0 ? formatCurrencyExact(amt) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
          <Icon className="h-5 w-5 text-[#1e5f3f]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
