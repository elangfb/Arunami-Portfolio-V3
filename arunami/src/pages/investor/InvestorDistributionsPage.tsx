import { useEffect, useMemo, useState } from 'react'
import {
  getInvestorPortfolios, getTransferProofsForInvestor, getBagiHasilManualEntriesForInvestor,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyExact, formatCurrencyCompact } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Wallet, FileImage, Inbox, Layers } from 'lucide-react'
import type { Portfolio } from '@/types'

interface LedgerRow {
  key: string
  portfolioId: string | null
  portfolioName: string
  period: string
  bagiHasil: number
  principal: number | null
  source: 'otomatis' | 'manual'
  proofUrl?: string | null
}

export default function InvestorDistributionsPage() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [ports, proofs, manual] = await Promise.all([
        getInvestorPortfolios(user.uid),
        getTransferProofsForInvestor(user.uid),
        getBagiHasilManualEntriesForInvestor(user.uid),
      ])
      setPortfolios(ports)
      const manualRows: LedgerRow[] = manual.map(m => ({
        key: `manual_${m.id}`,
        portfolioId: m.portfolioId,
        portfolioName: m.portfolioName,
        period: m.period,
        bagiHasil: m.bagiHasilAmount,
        principal: m.principalAmount,
        source: 'manual',
        proofUrl: m.fileUrl ?? null,
      }))
      // DF-01: a manual entry wins over an automated proof for the same
      // (portfolio × period) so a backfilled payout isn't double-counted.
      const manualKeys = new Set(manual.map(m => `${m.portfolioId}_${m.period}`))
      const proofRows: LedgerRow[] = proofs
        .filter(p => !manualKeys.has(`${p.portfolioId}_${p.period}`))
        .map(p => ({
          key: `proof_${p.id}`,
          portfolioId: p.portfolioId,
          portfolioName: p.portfolioName,
          period: p.period,
          bagiHasil: p.amount,
          principal: p.principalAmount ?? null,
          source: 'otomatis',
          proofUrl: p.fileUrl,
        }))
      setRows([...proofRows, ...manualRows].sort((a, b) => comparePeriods(b.period, a.period)))
      setLoading(false)
    })()
  }, [user])

  const periods = useMemo(
    () => [...new Set(rows.map(r => r.period))].sort((a, b) => comparePeriods(b, a)),
    [rows],
  )

  const filtered = useMemo(
    () => rows
      .filter(r => portfolioFilter === 'all' || r.portfolioId === portfolioFilter)
      .filter(r => periodFilter === 'all' || r.period === periodFilter),
    [rows, portfolioFilter, periodFilter],
  )

  const totalPaid = filtered.reduce((s, r) => s + r.bagiHasil, 0)
  const totalPrincipal = filtered.reduce((s, r) => s + (r.principal ?? 0), 0)
  const hasPrincipal = filtered.some(r => (r.principal ?? 0) > 0)

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wallet className="h-6 w-6 text-[#1e5f3f]" />
            Distribusi Bagi Hasil
          </h1>
          <p className="text-muted-foreground">Seluruh pembayaran bagi hasil lintas portofolio Anda</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total Diterima" value={formatCurrencyCompact(totalPaid)} />
              {hasPrincipal && <StatCard label="Pengembalian Pokok" value={formatCurrencyCompact(totalPrincipal)} />}
              <StatCard label="Jumlah Pembayaran" value={`${filtered.length}×`} />
              <StatCard label="Portofolio" value={`${new Set(filtered.map(r => r.portfolioId)).size}`} />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
                <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua portofolio</SelectItem>
                  {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{p.brandName || p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua periode</SelectItem>
                  {periods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead>Portofolio</TableHead>
                    <TableHead className="text-right">Bagi Hasil</TableHead>
                    {hasPrincipal && <TableHead className="text-right">Pengembalian Pokok</TableHead>}
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Bukti</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={hasPrincipal ? 6 : 5} className="py-10 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                      Belum ada distribusi.
                    </TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{formatPeriod(r.period)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.portfolioName}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrencyExact(r.bagiHasil)}</TableCell>
                      {hasPrincipal && <TableCell className="text-right text-muted-foreground">{r.principal != null ? formatCurrencyExact(r.principal) : '—'}</TableCell>}
                      <TableCell className="text-center"><Badge variant="success">Dibayar</Badge></TableCell>
                      <TableCell className="text-right">
                        {r.proofUrl ? (
                          <a href={r.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1e5f3f] hover:underline">
                            <FileImage className="h-3.5 w-3.5" />Lihat
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              Distribusi yang masih diproses atau ditahan akan muncul di sini setelah transfer dikirim.
            </p>
          </>
        )}
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
