import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
            <table className="w-full text-sm text-black">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-black">
                  <th className="py-2 pr-3 font-medium">Tanggal</th>
                  <th className="py-2 pr-3 font-medium">Jenis</th>
                  <th className="py-2 pr-3 font-medium">Diubah Oleh</th>
                  <th className="py-2 pr-3 font-medium">Dari → Menjadi</th>
                  <th className="py-2 pr-3 font-medium">Berlaku</th>
                  <th className="py-2 pr-3 font-medium">Alasan</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => {
                  const change = renderChange(row)
                  return (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3 whitespace-nowrap">{formatDate(row.changedAt?.seconds)}</td>
                      <td className="py-3 pr-3">
                        <Badge variant="outline" className="whitespace-nowrap">{change.label}</Badge>
                      </td>
                      <td className="py-3 pr-3">{row.changedByName}</td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                        {change.from} → <span className="font-semibold text-[#38a169]">{change.to}</span>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {row.effectiveFromPeriod ? formatPeriod(row.effectiveFromPeriod) : '-'}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="text-black">{row.reasonNote || '-'}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
