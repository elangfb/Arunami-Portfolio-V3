import { useState } from 'react'
import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import type {
  PnLUploadPending,
  MonthlyPnLRow,
  RevenueCategory,
  CustomCategoryType,
  RowOrder,
  CustomCategory,
} from '@/types'
import {
  customNetAdjustment,
  addCategoryAcrossMonths,
  removeCategoryAcrossMonths,
  addSubItemAcrossMonths,
  removeSubItemAcrossMonths,
  setSubItemAmountInMonth,
  unionCategories,
  unionCogsSubItems,
  addCogsSubItemAcrossMonths,
  removeCogsSubItemAcrossMonths,
  setCogsSubItemAmountInMonth,
} from '@/lib/customCategories'
import {
  resolveBodyOrder,
  moveInBody,
  applySubItemOrder,
  moveSubItemInCategory,
  setSubItemOrder,
  type MoveDirection,
} from '@/lib/rowOrder'
import { CustomCategoryBlock } from '@/components/CustomCategoryBlock'
import {
  AddCustomCategoryDialog,
  type AddCategoryPayload,
} from '@/components/AddCustomCategoryDialog'

interface Props {
  data: PnLUploadPending
  onDataChange: (next: PnLUploadPending) => void
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
  units: RevenueCategory[]
  onUnitsChange: (next: RevenueCategory[]) => void
  rowOrder?: RowOrder
  onRowOrderChange?: (next: RowOrder) => void
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
  // If COGS has a breakdown, derive the cogs total from the sub-items. Otherwise
  // keep the flat stored value (backward compat for legacy rows / manual entry).
  const cogs = (month.cogsSubItems?.length ?? 0) > 0
    ? month.cogsSubItems!.reduce((s, x) => s + (Number(x.amount) || 0), 0)
    : Number(month.cogs) || 0
  const totalOpex = (month.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  const interest = Number(month.interest) || 0
  const taxes = Number(month.taxes) || 0

  const grossProfit = revenue - cogs
  const operatingProfit = grossProfit - totalOpex
  const netProfit = operatingProfit - interest - taxes + customNetAdjustment(month.customCategories)

  return { ...month, cogs, grossProfit, totalOpex, operatingProfit, netProfit }
}

export function PnLReviewTable({
  data, onDataChange, onConfirm, onCancel, isConfirming, units, onUnitsChange,
  rowOrder, onRowOrderChange,
}: Props) {
  const months = data.monthlyData
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)

  const rawOpexNames = [...new Set(months.flatMap(m => (m.opex ?? []).map(o => o.name)))]
  const rawCategories = unionCategories(months.map(m => m.customCategories))
  const categoryIds = rawCategories.map(c => c.id)
  const bodyOrder = resolveBodyOrder(rawOpexNames, categoryIds, rowOrder)
  const catById = new Map(rawCategories.map(c => [c.id, c]))

  // COGS can be either flat (one number per month) or broken down into sub-items.
  // We render as a pinned main-category block once any month has a breakdown.
  const cogsUnionSubItems = unionCogsSubItems(months.map(m => m.cogsSubItems))
  const hasCogsBreakdown = cogsUnionSubItems.length > 0
  const cogsCategory: CustomCategory = {
    id: '__cogs__',
    name: 'COGS',
    type: 'expense',
    subItems: cogsUnionSubItems,
  }

  const rowsBeforeCogs: RowDef[] = [
    { label: 'Revenue', key: 'revenue', isBold: true },
  ]
  const flatCogsRow: RowDef | null = hasCogsBreakdown
    ? null
    : { label: 'COGS', key: 'cogs', className: 'text-red-600' }
  const rowsAfterCogs: RowDef[] = [
    { label: 'Gross Profit', key: 'grossProfit', isBold: true, className: 'text-green-700', readOnly: true },
  ]
  const rowsAfterBody: RowDef[] = [
    { label: 'Total Opex', key: 'totalOpex', className: 'text-red-600 font-medium', readOnly: true },
    { label: 'Operating Profit', key: 'operatingProfit', isBold: true, readOnly: true },
    { label: 'Interest', key: 'interest', className: 'text-red-600' },
    { label: 'Taxes', key: 'taxes', className: 'text-red-600' },
  ]
  const netProfitRow: RowDef = {
    label: 'Net Profit', key: 'netProfit', isBold: true, readOnly: true,
  }

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
    const nextMonths = months.map(m => {
      const exists = (m.opex ?? []).some(o => o.name === name.trim())
      if (exists) return m
      return { ...m, opex: [...(m.opex ?? []), { name: name.trim(), amount: 0 }] }
    })
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleRemoveOpex = (opexName: string) => {
    const nextMonths = months.map(m =>
      recalculate({ ...m, opex: (m.opex ?? []).filter(o => o.name !== opexName) })
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleMoveOpex = (opexName: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const next = moveInBody(rowOrder, rawOpexNames, categoryIds, { type: 'opex', id: opexName }, direction)
    onRowOrderChange({ ...(rowOrder ?? {}), body: next })
  }

  const handleMoveCategory = (catId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const next = moveInBody(rowOrder, rawOpexNames, categoryIds, { type: 'cat', id: catId }, direction)
    onRowOrderChange({ ...(rowOrder ?? {}), body: next })
  }

  const handleMoveSubItem = (catId: string, subId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const cat = catById.get(catId)
    if (!cat) return
    const availableIds = cat.subItems.map(s => s.id)
    const next = moveSubItemInCategory(rowOrder?.customSubItems?.[catId], availableIds, subId, direction)
    onRowOrderChange(setSubItemOrder(rowOrder, catId, next))
  }

  const handleAddCategory = (name: string, type: CustomCategoryType) => {
    const { months: nextMonths } = addCategoryAcrossMonths(months, name, type)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculate) })
  }

  const handleDialogSubmit = (payload: AddCategoryPayload) => {
    if (payload.kind === 'main') {
      handleAddCategory(payload.name, payload.type)
      return
    }
    if (payload.parentId === '__cogs__') {
      const { months: nextMonths } = addCogsSubItemAcrossMonths(months, payload.name)
      onDataChange({ ...data, monthlyData: nextMonths.map(recalculate) })
      return
    }
    const { months: nextMonths } = addSubItemAcrossMonths(months, payload.parentId, payload.name)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculate) })
  }

  const handleRemoveCategory = (catId: string) => {
    const nextMonths = removeCategoryAcrossMonths(months, catId).map(recalculate)
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleAddSubItem = (catId: string) => {
    const catName = catById.get(catId)?.name ?? 'Kategori'
    const name = window.prompt(`Nama sub-kategori baru untuk "${catName}":`)
    if (!name?.trim()) return
    const { months: nextMonths } = addSubItemAcrossMonths(months, catId, name)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculate) })
  }

  const handleRemoveSubItem = (catId: string, subId: string) => {
    const nextMonths = removeSubItemAcrossMonths(months, catId, subId).map(recalculate)
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
      (m, i) => (i === monthIdx ? recalculate(m) : m),
    )
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  // ── COGS breakdown handlers ────────────────────────────────────────────
  const handleCogsAddSub = () => {
    const name = window.prompt('Nama komponen COGS baru (misal: Bahan Baku):')
    if (!name?.trim()) return
    // Prevent duplicate name across existing sub-items
    const lower = name.trim().toLowerCase()
    if (cogsUnionSubItems.some(s => s.name.toLowerCase() === lower)) {
      alert('Komponen COGS dengan nama ini sudah ada.')
      return
    }
    const { months: nextMonths } = addCogsSubItemAcrossMonths(months, name)
    onDataChange({ ...data, monthlyData: nextMonths.map(recalculate) })
  }

  const handleCogsRemoveSub = (_catId: string, subId: string) => {
    const nextMonths = removeCogsSubItemAcrossMonths(months, subId).map(recalculate)
    onDataChange({ ...data, monthlyData: nextMonths })
  }

  const handleCogsAmountChange = (
    monthKey: string,
    _catId: string,
    subId: string,
    value: number,
  ) => {
    const monthIdx = months.findIndex(m => m.month === monthKey)
    if (monthIdx < 0) return
    const nextMonths = setCogsSubItemAmountInMonth(months, monthIdx, subId, value).map(
      (m, i) => (i === monthIdx ? recalculate(m) : m),
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

  const renderStandardRow = (row: RowDef) => {
    const total = getTotal(row.key)
    return (
      <tr key={row.key} className={row.isBold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
        <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : ''}`}>
          {row.label}
        </td>
        {months.map((m, monthIdx) => {
          const val = getCellValue(m, row.key)
          return (
            <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
              {row.readOnly ? (
                <div className="h-8 flex items-center justify-end px-3 text-sm tabular-nums">
                  {val.toLocaleString('id-ID')}
                </div>
              ) : (
                <Input
                  type="number"
                  value={val}
                  onChange={e => handleCellChange(monthIdx, row.key, Number(e.target.value) || 0)}
                  className="h-8 text-right text-xs tabular-nums"
                />
              )}
            </td>
          )
        })}
        {months.length > 1 && (
          <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
            row.className?.replace('text-xs', '') ?? ''
          }`}>
            {total.toLocaleString('id-ID')}
          </td>
        )}
      </tr>
    )
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
              {rowsBeforeCogs.map(renderStandardRow)}

              {/* COGS — pinned block when breakdown exists, else flat editable row */}
              {hasCogsBreakdown ? (
                <CustomCategoryBlock
                  key="body-cogs-pinned"
                  category={cogsCategory}
                  columns={months.map(m => ({ key: m.month, editable: true }))}
                  showGrandTotal={months.length > 1}
                  getAmount={(monthKey, _catId, subId) => {
                    const m = months.find(mm => mm.month === monthKey)
                    return m?.cogsSubItems?.find(s => s.id === subId)?.amount ?? 0
                  }}
                  onAmountChange={handleCogsAmountChange}
                  onRemoveCategory={() => {}}
                  onAddSubItem={handleCogsAddSub}
                  onRemoveSubItem={handleCogsRemoveSub}
                  pinned
                  hideTypeBadge
                  columnSubtotalOverride={monthKey => {
                    const m = months.find(mm => mm.month === monthKey)
                    if (!m) return undefined
                    // When the column has no breakdown of its own, show the stored
                    // flat cogs so legacy/mixed columns aren't rendered as 0.
                    return (m.cogsSubItems?.length ?? 0) > 0 ? undefined : (Number(m.cogs) || 0)
                  }}
                />
              ) : (
                flatCogsRow && renderStandardRow(flatCogsRow)
              )}

              {rowsAfterCogs.map(renderStandardRow)}

              {/* Interleaved body zone: opex items + custom category blocks */}
              {bodyOrder.map((entry, bodyIdx) => {
                const isFirstInBody = bodyIdx === 0
                const isLastInBody = bodyIdx === bodyOrder.length - 1

                if (entry.type === 'opex') {
                  const opexName = entry.id
                  const key = `opex:${opexName}`
                  const total = getTotal(key)
                  return (
                    <tr key={`body-opex-${opexName}`} className="hover:bg-muted/10">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r pl-8 text-muted-foreground text-xs">
                        <div className="flex items-center gap-1">
                          {onRowOrderChange && (
                            <div className="flex flex-col shrink-0">
                              <button
                                type="button"
                                disabled={isFirstInBody}
                                onClick={() => handleMoveOpex(opexName, 'up')}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                                title="Pindah ke atas"
                              >
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                disabled={isLastInBody}
                                onClick={() => handleMoveOpex(opexName, 'down')}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                                title="Pindah ke bawah"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <span className="flex-1">{opexName}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleRemoveOpex(opexName)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      {months.map((m, monthIdx) => {
                        const val = getCellValue(m, key)
                        return (
                          <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
                            <Input
                              type="number"
                              value={val}
                              onChange={e => handleCellChange(monthIdx, key, Number(e.target.value) || 0)}
                              className="h-8 text-right text-xs tabular-nums"
                            />
                          </td>
                        )
                      })}
                      {months.length > 1 && (
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold text-muted-foreground">
                          {total.toLocaleString('id-ID')}
                        </td>
                      )}
                    </tr>
                  )
                }

                const cat = catById.get(entry.id)
                if (!cat) return null
                const ordered = applySubItemOrder(cat, rowOrder?.customSubItems?.[cat.id])
                return (
                  <CustomCategoryBlock
                    key={`body-cat-${cat.id}`}
                    category={ordered}
                    columns={months.map(m => ({ key: m.month, editable: true }))}
                    showGrandTotal={months.length > 1}
                    getAmount={(monthKey, catId, subId) => {
                      const m = months.find(mm => mm.month === monthKey)
                      const c = m?.customCategories?.find(cc => cc.id === catId)
                      return c?.subItems.find(s => s.id === subId)?.amount ?? 0
                    }}
                    onAmountChange={handleCustomAmountChange}
                    onRemoveCategory={handleRemoveCategory}
                    onAddSubItem={handleAddSubItem}
                    onRemoveSubItem={handleRemoveSubItem}
                    onMoveCategory={onRowOrderChange ? handleMoveCategory : undefined}
                    isFirstInBody={isFirstInBody}
                    isLastInBody={isLastInBody}
                    onMoveSubItem={onRowOrderChange ? handleMoveSubItem : undefined}
                  />
                )
              })}

              {rowsAfterBody.map(renderStandardRow)}

              {/* Net Profit row */}
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
                {months.length > 1 && (() => {
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
                <td colSpan={months.length + (months.length > 1 ? 2 : 1)} className="px-4 py-2">
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

      <AddCustomCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        onSubmit={handleDialogSubmit}
        existingMainCategories={[cogsCategory, ...rawCategories]}
      />
    </div>
  )
}
