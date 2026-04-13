import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2 } from 'lucide-react'
import type { ProjectionUploadPending, MonthlyProjectionRow } from '@/types'

interface Props {
  data: ProjectionUploadPending
  onDataChange: (next: ProjectionUploadPending) => void
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
}

interface RowDef {
  label: string
  // Either a direct field on MonthlyProjectionRow or 'opex:<name>'
  key: string
  isBold?: boolean
  className?: string
}

function getCellValue(month: MonthlyProjectionRow, key: string): number {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    return month.opexBreakdown.find(o => o.name === name)?.amount ?? 0
  }
  return (month[key as keyof MonthlyProjectionRow] as number) ?? 0
}

function setCellValue(month: MonthlyProjectionRow, key: string, value: number): MonthlyProjectionRow {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    const existingIdx = month.opexBreakdown.findIndex(o => o.name === name)
    const nextOpex = existingIdx >= 0
      ? month.opexBreakdown.map((o, i) => i === existingIdx ? { ...o, amount: value } : o)
      : [...month.opexBreakdown, { name, amount: value }]
    return { ...month, opexBreakdown: nextOpex }
  }
  return { ...month, [key]: value } as MonthlyProjectionRow
}

export function ProjectionReviewTable({ data, onDataChange, onConfirm, onCancel, isConfirming }: Props) {
  const months = data.monthlyData

  const opexNames = [...new Set(months.flatMap(m => m.opexBreakdown.map(o => o.name)))]

  const rows: RowDef[] = [
    { label: 'Projected Revenue', key: 'projectedRevenue', isBold: true },
    { label: 'COGS', key: 'projectedCogs', className: 'text-red-600' },
    { label: 'Gross Profit', key: 'projectedGrossProfit', isBold: true, className: 'text-green-700' },
    ...opexNames.map(name => ({
      label: name,
      key: `opex:${name}`,
      className: 'text-muted-foreground text-xs',
    })),
    { label: 'Total Opex', key: 'totalOpex', className: 'text-red-600 font-medium' },
    { label: 'Net Profit', key: 'projectedNetProfit', isBold: true },
  ]

  const getTotal = (key: string): number =>
    months.reduce((sum, m) => sum + getCellValue(m, key), 0)

  const handleCellChange = (monthIdx: number, key: string, value: number) => {
    const nextMonths = months.map((m, i) => i === monthIdx ? setCellValue(m, key, value) : m)
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAssumptionsChange = (value: string) => {
    onDataChange({ ...data, assumptions: value })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Review &amp; Edit Proyeksi Bulanan</h3>
          <p className="text-sm text-muted-foreground">{data.period} &middot; COGS {data.cogsPercent}% of Revenue</p>
        </div>
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
          Menunggu Konfirmasi
        </Badge>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-medium min-w-[180px] border-r">
                  Variable
                </th>
                {months.map(m => (
                  <th key={m.month} className="px-4 py-2.5 text-right font-medium whitespace-nowrap min-w-[160px]">
                    {formatPeriod(m.month)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap min-w-[155px] border-l bg-muted/80">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => {
                const isNetProfit = row.key === 'projectedNetProfit'
                const total = getTotal(row.key)
                return (
                  <tr key={row.key} className={row.isBold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                    <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : ''} ${row.className?.includes('text-xs') ? 'pl-8' : ''}`}>
                      {row.label}
                    </td>
                    {months.map((m, monthIdx) => {
                      const val = getCellValue(m, row.key)
                      return (
                        <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
                          <Input
                            type="number"
                            value={val}
                            onChange={e => handleCellChange(monthIdx, row.key, Number(e.target.value) || 0)}
                            className={`h-8 text-right text-xs tabular-nums ${isNetProfit && val < 0 ? 'text-red-600' : ''}`}
                          />
                        </td>
                      )
                    })}
                    <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
                      isNetProfit
                        ? total >= 0 ? 'text-green-600' : 'text-red-600'
                        : row.className?.replace('text-xs', '') ?? ''
                    }`}>
                      {total.toLocaleString('id-ID')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <label className="text-sm font-medium">Asumsi</label>
        <textarea
          value={data.assumptions ?? ''}
          onChange={e => handleAssumptionsChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Catatan asumsi proyeksi..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
          Batal
        </Button>
        <Button onClick={onConfirm} disabled={isConfirming} className="bg-[#38a169] hover:bg-[#2f855a]">
          {isConfirming ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Menyimpan...</>
          ) : (
            <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Monthly Projections</>
          )}
        </Button>
      </div>
    </div>
  )
}
