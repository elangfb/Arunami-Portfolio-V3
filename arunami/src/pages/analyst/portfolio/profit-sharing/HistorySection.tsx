import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { History } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import type { EquityChangeEntry, ConfigChangeKind } from '@/types'

function formatDate(seconds?: number): string {
  if (!seconds) return '-'
  const d = new Date(seconds * 1000)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const KIND_LABEL: Record<ConfigChangeKind, string> = {
  investor_share: 'Investor Share',
  arunami_fee: 'Arunami Fee',
  fixed_yield: 'Fixed Yield',
  revenue_share: 'Revenue Share',
  scheduled_payment: 'Jadwal Pembayaran',
  dividend_declared: 'Dividen',
  custom_formula: 'Formula Custom',
  return_model: 'Model Distribusi',
}

function renderChange(row: EquityChangeEntry): { label: string; from: string; to: string } {
  if (row.changeKind) {
    return {
      label: KIND_LABEL[row.changeKind],
      from: row.fromValue ?? '-',
      to: row.toValue ?? '-',
    }
  }
  // Legacy rows: only investor % was tracked.
  return {
    label: 'Investor Share',
    from: `${row.fromInvestorPercent}%`,
    to: `${row.toInvestorPercent}%`,
  }
}

export default function HistorySection({ history }: { history: EquityChangeEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-black" />
          <CardTitle className="text-base text-black">Riwayat Perubahan</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-black">
            Belum ada riwayat perubahan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-black">
              <TableHeader>
                <TableRow className="text-left text-xs uppercase tracking-wide text-black">
                  <TableHead className="py-2 pr-3 font-medium text-black">Tanggal</TableHead>
                  <TableHead className="py-2 pr-3 font-medium text-black">Jenis</TableHead>
                  <TableHead className="py-2 pr-3 font-medium text-black">Diubah Oleh</TableHead>
                  <TableHead className="py-2 pr-3 font-medium text-black">Dari → Menjadi</TableHead>
                  <TableHead className="py-2 pr-3 font-medium text-black">Berlaku</TableHead>
                  <TableHead className="py-2 pr-3 font-medium text-black">Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(row => {
                  const change = renderChange(row)
                  return (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="py-3 pr-3 whitespace-nowrap">{formatDate(row.changedAt?.seconds)}</TableCell>
                      <TableCell className="py-3 pr-3">
                        <Badge variant="outline" className="whitespace-nowrap">{change.label}</Badge>
                      </TableCell>
                      <TableCell className="py-3 pr-3">{row.changedByName}</TableCell>
                      <TableCell className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                        {change.from} → <span className="font-semibold text-[#38a169]">{change.to}</span>
                      </TableCell>
                      <TableCell className="py-3 pr-3 whitespace-nowrap">
                        {row.effectiveFromPeriod ? formatPeriod(row.effectiveFromPeriod) : '-'}
                      </TableCell>
                      <TableCell className="py-3 pr-3">
                        <div className="text-black">{row.reasonNote || '-'}</div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
