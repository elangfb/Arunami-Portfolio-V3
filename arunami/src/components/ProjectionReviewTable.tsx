import { useState } from 'react'
import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import type {
  ProjectionUploadPending,
  MonthlyProjectionRow,
  CustomCategoryType,
  RowOrder,
} from '@/types'
import {
  customNetAdjustment,
  addCategoryAcrossMonths,
  removeCategoryAcrossMonths,
  addSubItemAcrossMonths,
  removeSubItemAcrossMonths,
  setSubItemAmountInMonth,
  unionCategories,
} from '@/lib/customCategories'
import {
  applyOrderToCategories,
  applyOrderToNames,
  moveInOrder,
  setSubItemOrder,
  type MoveDirection,
} from '@/lib/rowOrder'
import { CustomCategoryRows } from '@/components/CustomCategoryRows'
import { AddCustomCategoryDialog } from '@/components/AddCustomCategoryDialog'

interface Props {
  data: ProjectionUploadPending
  onDataChange: (next: ProjectionUploadPending) => void
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
  rowOrder?: RowOrder
  onRowOrderChange?: (next: RowOrder) => void
}

interface RowDef {
  label: string
  key: string
  isBold?: boolean
  className?: string
  readOnly?: boolean
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

/**
 * Projection recalc: only Net Profit is auto-calculated. Gross Profit and
 * Total Opex remain free-form user-editable (preserves existing behavior).
 */
function recalculateNetProfit(month: MonthlyProjectionRow): MonthlyProjectionRow {
  const grossProfit = Number(month.projectedGrossProfit) || 0
  const totalOpex = Number(month.totalOpex) || 0
  const projectedNetProfit =
    grossProfit - totalOpex + customNetAdjustment(month.customCategories)
  return { ...month, projectedNetProfit }
}

export function ProjectionReviewTable({
  data, onDataChange, onConfirm, onCancel, isConfirming,
  rowOrder, onRowOrderChange,
}: Props) {
  const months = data.monthlyData
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)

  const rawOpexNames = [...new Set(months.flatMap(m => m.opexBreakdown.map(o => o.name)))]
  const opexNames = applyOrderToNames(rawOpexNames, rowOrder?.opex)

  const rowsBeforeCustom: RowDef[] = [
    { label: 'Projected Revenue', key: 'projectedRevenue', isBold: true },
    { label: 'COGS', key: 'projectedCogs', className: 'text-red-600' },
    { label: 'Gross Profit', key: 'projectedGrossProfit', isBold: true, className: 'text-green-700' },
    ...opexNames.map(name => ({
      label: name,
      key: `opex:${name}`,
      className: 'text-muted-foreground text-xs',
    })),
    { label: 'Total Opex', key: 'totalOpex', className: 'text-red-600 font-medium' },
  ]
  const netProfitRow: RowDef = {
    label: 'Net Profit', key: 'projectedNetProfit', isBold: true, readOnly: true,
  }

  const rawCustomCategories = unionCategories(months.map(m => m.customCategories))
  const customCategories = applyOrderToCategories(
    rawCustomCategories,
    rowOrder?.customCategories,
    rowOrder?.customSubItems,
  )

  const getTotal = (key: string): number =>
    months.reduce((sum, m) => sum + getCellValue(m, key), 0)

  const handleCellChange = (monthIdx: number, key: string, value: number) => {
    const nextMonths = months.map((m, i) =>
      i === monthIdx ? recalculateNetProfit(setCellValue(m, key, value)) : m,
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAddOpex = () => {
    const name = window.prompt('Nama item opex baru:')
    if (!name?.trim()) return
    const nextMonths = months.map(m => {
      const exists = m.opexBreakdown.some(o => o.name === name.trim())
      if (exists) return m
      return { ...m, opexBreakdown: [...m.opexBreakdown, { name: name.trim(), amount: 0 }] }
    })
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleRemoveOpex = (opexName: string) => {
    const nextMonths = months.map(m =>
      recalculateNetProfit({
        ...m,
        opexBreakdown: m.opexBreakdown.filter(o => o.name !== opexName),
      }),
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleMoveOpex = (opexName: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const next = moveInOrder(rowOrder?.opex, rawOpexNames, opexName, direction)
    onRowOrderChange({ ...(rowOrder ?? {}), opex: next })
  }

  const handleMoveCategory = (catId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const availableIds = rawCustomCategories.map(c => c.id)
    const next = moveInOrder(rowOrder?.customCategories, availableIds, catId, direction)
    onRowOrderChange({ ...(rowOrder ?? {}), customCategories: next })
  }

  const handleMoveSubItem = (catId: string, subId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const cat = rawCustomCategories.find(c => c.id === catId)
    if (!cat) return
    const availableIds = cat.subItems.map(s => s.id)
    const next = moveInOrder(rowOrder?.customSubItems?.[catId], availableIds, subId, direction)
    onRowOrderChange(setSubItemOrder(rowOrder, catId, next))
  }

  const handleAddCategory = (name: string, type: CustomCategoryType) => {
    const { months: nextMonths } = addCategoryAcrossMonths(months, name, type)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculateNetProfit) })
  }

  const handleRemoveCategory = (catId: string) => {
    const nextMonths = removeCategoryAcrossMonths(months, catId).map(recalculateNetProfit)
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAddSubItem = (catId: string) => {
    const catName = customCategories.find(c => c.id === catId)?.name ?? 'Kategori'
    const name = window.prompt(`Nama sub-kategori baru untuk "${catName}":`)
    if (!name?.trim()) return
    const { months: nextMonths } = addSubItemAcrossMonths(months, catId, name)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculateNetProfit) })
  }

  const handleRemoveSubItem = (catId: string, subId: string) => {
    const nextMonths = removeSubItemAcrossMonths(months, catId, subId).map(recalculateNetProfit)
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleCustomAmountChange = (
    monthKey: string,
    catId: string,
    subId: string,
    value: number,
  ) => {
    const monthIdx = months.findIndex(m => m.month === monthKey)
    if (monthIdx < 0) return
    const nextMonths = setSubItemAmountInMonth(months, monthIdx, catId, subId, value).map(
      (m, i) => (i === monthIdx ? recalculateNetProfit(m) : m),
    )
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
              {rowsBeforeCustom.map(row => {
                const total = getTotal(row.key)
                const isOpexRow = row.key.startsWith('opex:')
                const opexName = isOpexRow ? row.key.slice(5) : ''
                const opexIdx = isOpexRow ? opexNames.indexOf(opexName) : -1
                const isFirstOpex = opexIdx === 0
                const isLastOpex = opexIdx === opexNames.length - 1
                return (
                  <tr key={row.key} className={row.isBold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                    <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : ''} ${row.className?.includes('text-xs') ? 'pl-8' : ''}`}>
                      <div className="flex items-center gap-1">
                        {isOpexRow && onRowOrderChange && (
                          <div className="flex flex-col shrink-0">
                            <button
                              type="button"
                              disabled={isFirstOpex}
                              onClick={() => handleMoveOpex(opexName, 'up')}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                              title="Pindah ke atas"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={isLastOpex}
                              onClick={() => handleMoveOpex(opexName, 'down')}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                              title="Pindah ke bawah"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        <span className="flex-1">{row.label}</span>
                        {isOpexRow && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleRemoveOpex(opexName)}
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
                          <Input
                            type="number"
                            value={val}
                            onChange={e => handleCellChange(monthIdx, row.key, Number(e.target.value) || 0)}
                            className="h-8 text-right text-xs tabular-nums"
                          />
                        </td>
                      )
                    })}
                    <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
                      row.className?.replace('text-xs', '') ?? ''
                    }`}>
                      {total.toLocaleString('id-ID')}
                    </td>
                  </tr>
                )
              })}

              <CustomCategoryRows
                categories={customCategories}
                columns={months.map(m => ({ key: m.month, editable: true }))}
                showGrandTotal={true}
                getAmount={(monthKey, catId, subId) => {
                  const m = months.find(mm => mm.month === monthKey)
                  const cat = m?.customCategories?.find(c => c.id === catId)
                  return cat?.subItems.find(s => s.id === subId)?.amount ?? 0
                }}
                onAmountChange={handleCustomAmountChange}
                onRemoveCategory={handleRemoveCategory}
                onAddSubItem={handleAddSubItem}
                onRemoveSubItem={handleRemoveSubItem}
                onMoveCategory={onRowOrderChange ? handleMoveCategory : undefined}
                onMoveSubItem={onRowOrderChange ? handleMoveSubItem : undefined}
              />

              {/* Net Profit row (readOnly, auto-calculated) */}
              <tr className="bg-muted/20">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 border-r font-semibold">
                  {netProfitRow.label}
                </td>
                {months.map(m => {
                  const val = getCellValue(m, netProfitRow.key)
                  return (
                    <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
                      <div className={`h-8 flex items-center justify-end px-3 text-sm tabular-nums ${
                        val >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                      }`}>
                        {val.toLocaleString('id-ID')}
                      </div>
                    </td>
                  )
                })}
                {(() => {
                  const total = getTotal(netProfitRow.key)
                  return (
                    <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
                      total >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {total.toLocaleString('id-ID')}
                    </td>
                  )
                })()}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={months.length + 2} className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleAddOpex}>
                      <Plus className="h-3 w-3 mr-1" /> Tambah Opex
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddCategoryOpen(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Tambah Kategori
                    </Button>
                  </div>
                </td>
              </tr>
            </tfoot>
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

      <AddCustomCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        onSubmit={handleAddCategory}
        existingNames={customCategories.map(c => c.name)}
      />
    </div>
  )
}
