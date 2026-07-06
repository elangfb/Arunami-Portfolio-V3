import { useEffect, useMemo, useState } from 'react'
import { getReports } from '@/lib/firestore'
import { formatCurrencyExact, formatPercent } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ArrowRight, ArrowDown, ArrowUp } from 'lucide-react'
import type { PnLExtractedData, PortfolioReport } from '@/types'

interface IncomeStatement {
  revenue: number
  cogs: number
  grossProfit: number
  totalOpex: number
  ebitda: number
  ebit: number
  interest: number
  taxes: number
  netProfit: number
}

/** Sum opex lines that look like depreciation/amortization (for the EBITDA add-back). */
function depreciationFromOpex(pnl: PnLExtractedData): number {
  return (pnl.opex ?? [])
    .filter(o => /depres|penyusut|amort/i.test(o.name))
    .reduce((s, o) => s + (o.amount || 0), 0)
}

function toStatement(pnl: PnLExtractedData): IncomeStatement {
  const revenue = pnl.revenue || 0
  const cogs = pnl.cogs || 0
  const grossProfit = pnl.grossProfit || (revenue - cogs)
  const totalOpex = pnl.totalOpex || (pnl.opex ?? []).reduce((s, o) => s + o.amount, 0)
  const ebit = pnl.operatingProfit || (grossProfit - totalOpex)
  const da = depreciationFromOpex(pnl)
  return {
    revenue, cogs, grossProfit, totalOpex,
    ebitda: ebit + da,
    ebit,
    interest: pnl.interest || 0,
    taxes: pnl.taxes || 0,
    netProfit: pnl.netProfit || 0,
  }
}

const ROWS: { key: keyof IncomeStatement; label: string; margin?: boolean; strong?: boolean }[] = [
  { key: 'revenue', label: 'Revenue', strong: true },
  { key: 'cogs', label: 'COGS' },
  { key: 'grossProfit', label: 'Gross Profit', margin: true, strong: true },
  { key: 'totalOpex', label: 'Total Opex' },
  { key: 'ebitda', label: 'EBITDA', margin: true },
  { key: 'ebit', label: 'EBIT (Laba Operasi)', margin: true, strong: true },
  { key: 'interest', label: 'Bunga' },
  { key: 'taxes', label: 'Pajak' },
  { key: 'netProfit', label: 'Net Profit', margin: true, strong: true },
]

export function PnLComparisonModal({
  portfolioId, open, onClose,
}: {
  portfolioId: string
  open: boolean
  onClose: () => void
}) {
  const [pnlByPeriod, setPnlByPeriod] = useState<Map<string, PnLExtractedData>>(new Map())
  const [periods, setPeriods] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [periodA, setPeriodA] = useState('')
  const [periodB, setPeriodB] = useState('')

  useEffect(() => {
    if (!open || !portfolioId) return
    getReports(portfolioId, 'pnl')
      .then((reports: PortfolioReport[]) => {
        const map = new Map<string, PnLExtractedData>()
        for (const r of reports) map.set(r.period, r.extractedData as PnLExtractedData)
        const sorted = [...map.keys()].sort((a, b) => comparePeriods(b, a))
        setPnlByPeriod(map)
        setPeriods(sorted)
        setPeriodB(sorted[0] ?? '')
        setPeriodA(sorted[1] ?? sorted[0] ?? '')
      })
      .finally(() => setLoading(false))
  }, [open, portfolioId])

  const stmtA = useMemo(() => { const p = pnlByPeriod.get(periodA); return p ? toStatement(p) : null }, [pnlByPeriod, periodA])
  const stmtB = useMemo(() => { const p = pnlByPeriod.get(periodB); return p ? toStatement(p) : null }, [pnlByPeriod, periodB])

  const marginOf = (s: IncomeStatement, key: keyof IncomeStatement) =>
    s.revenue > 0 ? (s[key] / s.revenue) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Perbandingan Laba Rugi</DialogTitle>
          <DialogDescription>Bandingkan laporan laba rugi antar dua periode.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : periods.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data laba rugi untuk portofolio ini.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Select value={periodA} onValueChange={setPeriodA}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={periodB} onValueChange={setPeriodB}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium">Pos</th>
                    <th className="px-3 py-2 text-right font-medium">{periodA ? formatPeriod(periodA) : '—'}</th>
                    <th className="px-3 py-2 text-right font-medium">{periodB ? formatPeriod(periodB) : '—'}</th>
                    <th className="px-3 py-2 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ROWS.map(row => {
                    const a = stmtA?.[row.key] ?? 0
                    const b = stmtB?.[row.key] ?? 0
                    const delta = b - a
                    const up = delta >= 0
                    return (
                      <tr key={row.key} className={row.strong ? 'font-semibold' : ''}>
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 text-right">
                          {stmtA ? formatCurrencyExact(a) : '—'}
                          {row.margin && stmtA && <span className="ml-1 text-xs text-muted-foreground">({formatPercent(marginOf(stmtA, row.key))})</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {stmtB ? formatCurrencyExact(b) : '—'}
                          {row.margin && stmtB && <span className="ml-1 text-xs text-muted-foreground">({formatPercent(marginOf(stmtB, row.key))})</span>}
                        </td>
                        <td className={`px-3 py-2 text-right ${up ? 'text-emerald-600' : 'text-red-600'}`}>
                          {stmtA && stmtB ? (
                            <span className="inline-flex items-center justify-end gap-0.5">
                              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {formatCurrencyExact(Math.abs(delta))}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              EBITDA = EBIT + penyusutan/amortisasi yang terdeteksi pada opex. Δ = periode kanan − kiri.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
