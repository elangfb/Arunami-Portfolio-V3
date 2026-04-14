import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, Plus, X } from 'lucide-react'
import type { PnLExtractedData, RevenueCategory } from '@/types'

interface Props {
  data: PnLExtractedData
  onDataChange: (next: PnLExtractedData) => void
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
  // Either a direct field on PnLExtractedData or 'opex:<name>'
  key: string
  isBold?: boolean
  className?: string
  readOnly?: boolean // derived values (Gross Profit, Operating Profit, Net Profit, Total Opex)
}

function getCellValue(data: PnLExtractedData, key: string): number {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    return data.opex?.find(o => o.name === name)?.amount ?? 0
  }
  if (key.startsWith('unit:')) {
    const id = key.slice(5)
    return data.unitBreakdown?.[id] ?? 0
  }
  return (data[key as keyof PnLExtractedData] as number) ?? 0
}

function setCellValue(data: PnLExtractedData, key: string, value: number): PnLExtractedData {
  if (key.startsWith('opex:')) {
    const name = key.slice(5)
    const existingIdx = data.opex?.findIndex(o => o.name === name) ?? -1
    const nextOpex = existingIdx >= 0
      ? data.opex.map((o, i) => i === existingIdx ? { ...o, amount: value } : o)
      : [...(data.opex ?? []), { name, amount: value }]
    return { ...data, opex: nextOpex }
  }
  if (key.startsWith('unit:')) {
    const id = key.slice(5)
    return { ...data, unitBreakdown: { ...(data.unitBreakdown ?? {}), [id]: value } }
  }
  return { ...data, [key]: value } as PnLExtractedData
}

/**
 * Recalculate derived values so the table always shows consistent totals
 * even as the analyst edits raw inputs.
 */
function recalculate(data: PnLExtractedData): PnLExtractedData {
  const revenue = Number(data.revenue) || 0
  const cogs = Number(data.cogs) || 0
  const totalOpex = (data.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const interest = Number(data.interest) || 0
  const taxes = Number(data.taxes) || 0

  const grossProfit = revenue - cogs
  const operatingProfit = grossProfit - totalOpex
  const netProfit = operatingProfit - interest - taxes

  return { ...data, grossProfit, totalOpex, operatingProfit, netProfit }
}

export function PnLReviewTable({
  data, onDataChange, onConfirm, onCancel, isConfirming, units, onUnitsChange,
}: Props) {
  const opexNames = (data.opex ?? []).map(o => o.name)

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
    { label: 'Jumlah Transaksi', key: 'transactionCount' },
  ]

  const handleCellChange = (key: string, value: number) => {
    const next = setCellValue(data, key, value)
    onDataChange(recalculate(next))
  }

  const handleAddOpex = () => {
    const name = window.prompt('Nama item opex baru:')
    if (!name?.trim()) return
    const next = setCellValue(data, `opex:${name.trim()}`, 0)
    onDataChange(recalculate(next))
  }

  const handleRemoveOpex = (name: string) => {
    const nextOpex = (data.opex ?? []).filter(o => o.name !== name)
    onDataChange(recalculate({ ...data, opex: nextOpex }))
  }

  const handlePeriodChange = (value: string) => {
    onDataChange({ ...data, period: value })
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
    // Seed the unit value in data so the input renders with 0 not undefined
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Review &amp; Edit Laporan PnL</h3>
          <p className="text-sm text-muted-foreground">{data.period ? formatPeriod(data.period) : 'Pilih periode'}</p>
        </div>
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
          Menunggu Konfirmasi
        </Badge>
      </div>

      {/* Period field */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <label className="text-sm font-medium whitespace-nowrap">Periode</label>
        <Input
          type="month"
          value={data.period ?? ''}
          onChange={e => handlePeriodChange(e.target.value)}
          className="h-9 w-48"
        />
      </div>

      {/* Main review table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-medium min-w-[200px] border-r">
                  Variable
                </th>
                <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap min-w-[180px]">
                  {data.period ? formatPeriod(data.period) : 'Periode'}
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => {
                const val = getCellValue(data, row.key)
                const isOpexRow = row.key.startsWith('opex:')
                const isNet = row.key === 'netProfit'
                return (
                  <tr key={row.key} className={row.isBold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                    <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : ''} ${row.className?.includes('text-xs') ? 'pl-8' : ''}`}>
                      {row.label}
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {row.readOnly ? (
                        <div className={`h-8 flex items-center justify-end px-3 text-sm tabular-nums ${
                          isNet ? (val >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold') : ''
                        }`}>
                          {val.toLocaleString('id-ID')}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={val}
                          onChange={e => handleCellChange(row.key, Number(e.target.value) || 0)}
                          className="h-8 text-right text-xs tabular-nums"
                        />
                      )}
                    </td>
                    <td className="px-2 text-center">
                      {isOpexRow && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveOpex(row.key.slice(5))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-4 py-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddOpex}>
                    <Plus className="h-3 w-3 mr-1" /> Tambah Opex
                  </Button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Unit breakdown — dynamic list. Analyst adds categories via + button
          on first upload; the parent persists them to PortfolioConfig so
          subsequent uploads pre-populate the unit titles. */}
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
                  onChange={e => handleCellChange(`unit:${unit.id}`, Number(e.target.value) || 0)}
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
          onChange={e => onDataChange({ ...data, notes: e.target.value } as PnLExtractedData)}
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
        <Button onClick={onConfirm} disabled={isConfirming || !data.period} className="bg-[#38a169] hover:bg-[#2f855a]">
          {isConfirming ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Menyimpan...</>
          ) : (
            <><CheckCircle2 className="h-4 w-4 mr-2" /> Konfirmasi &amp; Simpan</>
          )}
        </Button>
      </div>
    </div>
  )
}
