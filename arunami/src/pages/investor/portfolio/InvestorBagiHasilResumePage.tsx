import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getTransferProofsForInvestor, getBagiHasilManualEntries } from '@/lib/firestore'
import { formatCurrencyExact, formatCurrencyCompact } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FileImage, Inbox } from 'lucide-react'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

interface ResumeRow {
  key: string
  period: string
  bagiHasil: number
  principal: number | null
  source: 'manual' | 'otomatis'
  proofUrl?: string | null
}

export default function InvestorBagiHasilResumePage() {
  const { portfolioId, portfolioConfig } = useOutletContext<InvestorPortfolioOutletContext>()
  const { user } = useAuthStore()
  const [rows, setRows] = useState<ResumeRow[]>([])
  const [loading, setLoading] = useState(true)

  const showPrincipal = !!portfolioConfig?.returnsPrincipal

  useEffect(() => {
    if (!portfolioId || !user) return
    Promise.all([
      getTransferProofsForInvestor(user.uid),
      getBagiHasilManualEntries(portfolioId, user.uid),
    ]).then(([proofs, manual]) => {
      const linkedRows: ResumeRow[] = proofs
        .filter(p => p.portfolioId === portfolioId)
        .map(p => ({
          key: `proof_${p.id}`,
          period: p.period,
          bagiHasil: p.amount,
          principal: p.principalAmount ?? null,
          source: 'otomatis',
          proofUrl: p.fileUrl,
        }))
      const manualRows: ResumeRow[] = manual.map(m => ({
        key: `manual_${m.id}`,
        period: m.period,
        bagiHasil: m.bagiHasilAmount,
        principal: m.principalAmount,
        source: 'manual',
        proofUrl: m.fileUrl ?? null,
      }))
      // DF-01: manual entry wins on a period collision — drop the automated proof
      // row for any period that also has a manual entry so the total counts once.
      const manualPeriods = new Set(manual.map(m => m.period))
      const dedupedLinked = linkedRows.filter(r => !manualPeriods.has(r.period))
      const merged = [...dedupedLinked, ...manualRows].sort(
        (a, b) => comparePeriods(b.period, a.period),
      )
      setRows(merged)
      setLoading(false)
    })
  }, [portfolioId, user])

  const totalBagiHasil = useMemo(() => rows.reduce((s, r) => s + r.bagiHasil, 0), [rows])
  const totalPrincipal = useMemo(
    () => rows.reduce((s, r) => s + (r.principal ?? 0), 0),
    [rows],
  )

  if (loading) {
    return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Resume Bagi Hasil</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rekap pembayaran bagi hasil{showPrincipal ? ' dan pengembalian pokok' : ''} —
          riwayat lama dicatat manual, periode berjalan otomatis dari bukti transfer.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ['Total Bagi Hasil', formatCurrencyCompact(totalBagiHasil)],
          ...(showPrincipal
            ? [['Total Pengembalian Pokok', formatCurrencyCompact(totalPrincipal)] as const]
            : []),
          ['Jumlah Pembayaran', `${rows.length}×`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Riwayat Pembayaran ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada catatan bagi hasil.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Bagi Hasil</TableHead>
                  {showPrincipal && <TableHead className="text-right">Pengembalian Pokok</TableHead>}
                  <TableHead className="text-right">Sumber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{formatPeriod(row.period)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyExact(row.bagiHasil)}</TableCell>
                    {showPrincipal && (
                      <TableCell className="text-right">
                        {row.principal != null ? formatCurrencyExact(row.principal) : '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {row.proofUrl ? (
                        <a
                          href={row.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#1e5f3f] hover:underline"
                        >
                          <FileImage className="h-3.5 w-3.5" />
                          <Badge variant="outline" className="border-[#1e5f3f]/30 text-[#1e5f3f] text-[10px]">
                            {row.source === 'otomatis' ? 'Otomatis' : 'Manual'}
                          </Badge>
                        </a>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {row.source === 'otomatis' ? 'Otomatis' : 'Manual'}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-muted/30 font-semibold">
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrencyExact(totalBagiHasil)}</TableCell>
                  {showPrincipal && <TableCell className="text-right">{formatCurrencyExact(totalPrincipal)}</TableCell>}
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
