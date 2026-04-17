import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, Plus, X } from 'lucide-react'
import type { PnLUploadPending, MonthlyPnLRow, RevenueCategory } from '@/types'

interface Props {
  data: PnLUploadPending
  onDataChange: (next: PnLUploadPending) => void
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
  units: RevenueCategory[]
  onUnitsChange: (next: RevenueCategory[]) => void
}

const PALETTE = ['#1e5f3f', '#38a169', '#48bb78', '#68d391', '#9ae6b4', '#3182ce', '#d69e2e', '#dd6b20']
const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

interface RowDef {
  label: string
  key: string
  isBold?: boolean
  className?: string
  readOnly?: boolean
}

function getCellValue(month: MonthlyPnLRow, key: string): number {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    return month.opex?.find(o => o.name === name)?.amount ?? 0
  }
  return (month[key as keyof MonthlyPnLRow] as number) ?? 0
}

function setCellValue(month: MonthlyPnLRow, key: string, value: number): MonthlyPnLRow {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    const existingIdx = month.opex?.findIndex(o => o.name === name) ?? -1
    const nextOpex = existingIdx >= 0
      ? month.opex.map((o, i) => i === existingIdx ? { ...o, amount: value } : o)
      : [...(month.opex ?? []), { name, amount: value }]
    return { ...month, opex: nextOpex }
  }
  return { ...month, [key]: value } as MonthlyPnLRow
}

function recalculate(month: MonthlyPnLRow): MonthlyPnLRow {
  const revenue = Number(month.revenue) || 0
  const cogs = Number(month.cogs) || 0
  const totalOpex = (month.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const interest = Number(month.interest) || 0
  const taxes = Number(month.taxes) || 0

  const grossProfit = revenue - cogs
  const operatingProfit = grossProfit - totalOpex
  const netProfit = operatingProfit - interest - taxes

  return { ...month, grossProfit, totalOpex, operatingProfit, netProfit }
}

export function PnLReviewTable({
  data, onDataChange, onConfirm, onCancel, isConfirming, units, onUnitsChange,
}: Props) {
  const months = data.monthlyData

  const opexNames = [...new Set(months.flatMap(m => (m.opex ?? []).map(o => o.name)))]

  const rows: RowDef[] = [
    { label: 'Revenue', key: 'revenue', isBold: true },
    { label: 'COGS', key: 'cogs', className: 'text-red-600' },
    { label: 'Gross Profit', key: 'grossProfit', isBold: true, className: 'text-green-700', readOnly: true },
    ...opexNames.map(n => ({
      label: n,
      key: `opex:${n}`,
      className: 'text-muted-foreground text-xs',
    })),
    { label: 'Total Opex', key: 'totalOpex', className: 'text-red-600 font-medium', readOnly: true },
    { label: 'Operating Profit', key: 'operatingProfit', isBold: true, readOnly: true },
    { label: 'Interest', key: 'interest', className: 'text-red-600' },
    { label: 'Taxes', key: 'taxes', className: 'text-red-600' },
    { label: 'Net Profit', key: 'netProfit', isBold: true, readOnly: true },
  ]

  const getTotal = (key: string): number =>
    months.reduce((sum, m) => sum + getCellValue(m, key), 0)

  const handleCellChange = (monthIdx: number, key: string, value: number) => {
    const nextMonths = months.map((m, i) =>
      i === monthIdx ? recalculate(setCellValue(m, key, value)) : m
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAddOpex = () => {
    const name = window.prompt('Nama item opex baru:')
    if (!name?.trim()) return
    // Add to ALL months with amount 0
    const nextMonths = months.map(m => {
      const exists = (m.opex ?? []).some(o => o.name === name.trim())
      if (exists) return m
      return { ...m, opex: [...(m.opex ?? []), { name: name.trim(), amount: 0 }] }
    })
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleRemoveOpex = (opexName: string) => {
    // Remove from ALL months
    const nextMonths = months.map(m =>
      recalculate({ ...m, opex: (m.opex ?? []).filter(o => o.name !== opexName) })
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAddUnit = () => {
    const name = window.prompt('Nama unit baru (misal: Subscription MRR):')
    if (!name?.trim()) return
    const id = slugify(name) || `unit-${Date.now()}`
    if (units.some(u => u.id === id)) {
      alert('Unit dengan nama ini sudah ada.')
      return
    }
    const color = PALETTE[(units.length) % PALETTE.length]
    onUnitsChange([...units, { id, name: name.trim(), color }])
    onDataChange({
      ...data,
      unitBreakdown: { ...(data.unitBreakdown ?? {}), [id]: 0 },
    })
  }

  const handleRemoveUnit = (id: string) => {
    onUnitsChange(units.filter(u => u.id !== id))
    const nextBreakdown = { ...(data.unitBreakdown ?? {}) }
    delete nextBreakdown[id]
    onDataChange({ ...data, unitBreakdown: nextBreakdown })
  }

  const handleUnitChange = (id: string, value: number) => {
    onDataChange({
      ...data,
      unitBreakdown: { ...(data.unitBreakdown ?? {}), [id]: value },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Review &amp; Edit Laporan PnL</h3>
          <p className="text-sm text-muted-foreground">
            {data.period || `${months.length} bulan`}
          </p>
        </div>
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
          Menunggu Konfirmasi
        </Badge>
      </div>

      {/* Main multi-month review table */}
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
                {months.length > 1 && (
                  <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap min-w-[155px] border-l bg-muted/80">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => {
                const isNetProfit = row.key === 'netProfit'
                const total = getTotal(row.key)
                const isOpexRow = row.key.startsWith('opex:')
                return (
                  <tr key={row.key} className={row.isBold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                    <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : ''} ${row.className?.includes('text-xs') ? 'pl-8' : ''}`}>
                      <div className="flex items-center gap-1">
                        <span className="flex-1">{row.label}</span>
                        {isOpexRow && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleRemoveOpex(row.key.slice(5))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                    {months.map((m, monthIdx) => {
                      const val = getCellValue(m, row.key)
                      return (
                        <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
                          {row.readOnly ? (
                            <div className={`h-8 flex items-center justify-end px-3 text-sm tabular-nums ${
                              isNetProfit ? (val >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : ''
                            }`}>
                              {val.toLocaleString('id-ID')}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              value={val}
                              onChange={e => handleCellChange(monthIdx, row.key, Number(e.target.value) || 0)}
                              className={`h-8 text-right text-xs tabular-nums ${isNetProfit && val < 0 ? 'text-red-600' : ''}`}
                            />
                          )}
                        </td>
                      )
                    })}
                    {months.length > 1 && (
                      <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
                        isNetProfit
                          ? total >= 0 ? 'text-green-600' : 'text-red-600'
                          : row.className?.replace('text-xs', '') ?? ''
                      }`}>
                        {total.toLocaleString('id-ID')}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={months.length + (months.length > 1 ? 2 : 1)} className="px-4 py-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddOpex}>
                    <Plus className="h-3 w-3 mr-1" /> Tambah Opex
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Unit breakdown — shared across all months */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Unit Breakdown</p>
          <Button type="button" variant="outline" size="sm" onClick={handleAddUnit}>
            <Plus className="h-3 w-3 mr-1" /> Tambah Unit
          </Button>
        </div>
        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Belum ada unit. Tambahkan unit (misal: Subscription MRR, Setup Fee) untuk melacak breakdown per kategori.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {units.map(unit => (
              <div key={unit.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground truncate">{unit.name}</label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveUnit(unit.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  type="number"
                  value={data.unitBreakdown?.[unit.id] ?? 0}
                  onChange={e => handleUnitChange(unit.id, Number(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border p-4 space-y-2">
        <label className="text-sm font-medium">Catatan</label>
        <textarea
          value={data.notes ?? ''}
          onChange={e => onDataChange({ ...data, notes: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Catatan tambahan..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
          Batal
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isConfirming || months.length === 0}
          className="bg-[#38a169] hover:bg-[#2f855a]"
        >
          {isConfirming ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Menyimpan...</>
          ) : (
            <><CheckCircle2 className="h-4 w-4 mr-2" /> Konfirmasi &amp; Simpan ({months.length} bulan)</>
          )}
        </Button>
      </div>
    </div>
  )
}
