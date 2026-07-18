import { useEffect, useMemo, useState } from 'react'
import { getAllPortfolios, getPortfolioConfigOrDefault, getAllAllocations } from '@/lib/firestore'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { brandOf } from '@/lib/portfolioName'
import { Coins, Wallet, Percent, TrendingUp } from 'lucide-react'
import type { Portfolio } from '@/types'

interface FeeRow {
  portfolio: Portfolio
  aum: number
  feePercent: number
  /** Projected annual platform fee = AUM × fee%. */
  annualFee: number
}

export default function AdminPlatformFees() {
  const [rows, setRows] = useState<FeeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [portfolios, allocations] = await Promise.all([getAllPortfolios(), getAllAllocations()])
      // AUM per portfolio = sum of investor allocations, falling back to the
      // target investment when no allocations have been recorded yet.
      const aumByPortfolio = new Map<string, number>()
      for (const a of allocations) {
        aumByPortfolio.set(a.portfolioId, (aumByPortfolio.get(a.portfolioId) ?? 0) + a.investedAmount)
      }
      const result = await Promise.all(
        portfolios.map(async (p): Promise<FeeRow> => {
          const config = await getPortfolioConfigOrDefault(p.id)
          const feePercent = config.investorConfig?.arunamiFeePercent ?? 0
          const aum = aumByPortfolio.get(p.id) || p.investasiAwal
          return { portfolio: p, aum, feePercent, annualFee: aum * (feePercent / 100) }
        }),
      )
      setRows(result.sort((a, b) => b.annualFee - a.annualFee))
      setLoading(false)
    })()
  }, [])

  const totals = useMemo(() => {
    const aum = rows.reduce((s, r) => s + r.aum, 0)
    const annualFee = rows.reduce((s, r) => s + r.annualFee, 0)
    const weightedFee = aum > 0 ? (annualFee / aum) * 100 : 0
    return { aum, annualFee, weightedFee, monthlyFee: annualFee / 12 }
  }, [rows])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Coins className="h-6 w-6 text-[#38a169]" />
          Biaya Platform
        </h1>
        <p className="text-muted-foreground">Proyeksi pendapatan fee Arunami dari AUM (AUM × fee%)</p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Wallet} label="Total AUM" value={formatCurrencyCompact(totals.aum)} />
            <StatCard icon={Percent} label="Rata-rata Fee (tertimbang)" value={formatPercent(totals.weightedFee)} />
            <StatCard icon={TrendingUp} label="Proyeksi Fee / Tahun" value={formatCurrencyCompact(totals.annualFee)} />
            <StatCard icon={Coins} label="Proyeksi Fee / Bulan" value={formatCurrencyCompact(totals.monthlyFee)} />
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="px-3 py-3 text-left font-medium">Portofolio</TableHead>
                    <TableHead className="px-3 py-3 text-right font-medium">AUM</TableHead>
                    <TableHead className="px-3 py-3 text-right font-medium">Fee %</TableHead>
                    <TableHead className="px-3 py-3 text-right font-medium">Fee / Tahun</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Belum ada portofolio.</TableCell></TableRow>
                  ) : rows.map(r => (
                    <TableRow key={r.portfolio.id} className="hover:bg-muted/30">
                      <TableCell className="px-3 py-2.5 font-medium">{brandOf(r.portfolio)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">{formatCurrencyExact(r.aum)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">{formatPercent(r.feePercent)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-medium text-[#1e5f3f]">{formatCurrencyExact(r.annualFee)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {rows.length > 0 && (
                  <TableFooter>
                    <TableRow className="border-t bg-muted/30 font-semibold">
                      <TableCell className="px-3 py-2.5">Total</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">{formatCurrencyExact(totals.aum)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">{formatPercent(totals.weightedFee)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right text-[#1e5f3f]">{formatCurrencyExact(totals.annualFee)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </Card>

          <p className="mt-3 text-xs text-muted-foreground">
            Proyeksi menggunakan fee % dari konfigurasi bagi hasil tiap portofolio, diterapkan atas AUM
            (total alokasi investor, atau target investasi bila belum ada alokasi). Angka bersifat estimasi.
          </p>
        </>
      )}
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
