import { useState } from 'react'
import { formatPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, Plus, X } from 'lucide-react'
import type {
  PnLUploadPending,
  MonthlyPnLRow,
  RevenueCategory,
  RowOrder,
  CustomCategory,
} from '@/types'
import {
  computePnL,
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
  unionRevenueSubItems,
  addRevenueSubItemAcrossMonths,
  removeRevenueSubItemAcrossMonths,
  setRevenueSubItemAmountInMonth,
  unionOpexNames,
  addOpexAcrossMonths,
  removeOpexAcrossMonths,
  setOpexAmountInMonth,
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

const PINNED_ID = {
  revenue: '__revenue__',
  cogs: '__cogs__',
  opex: '__opex__',
} as const

interface ComputedRowDef {
  label: string
  key: 'grossProfit' | 'operatingProfit' | 'netProfit'
  isBold?: boolean
  className?: string
}

interface EditableRowDef {
  label: string
  key: 'interest' | 'taxes'
  className?: string
}

export function PnLReviewTable({
  data, onDataChange, onConfirm, onCancel, isConfirming, units, onUnitsChange,
  rowOrder, onRowOrderChange,
}: Props) {
  const months = data.monthlyData
  const [addDialog, setAddDialog] = useState<{
    open: boolean
    lockedMode?: 'main' | 'sub'
    presetParentId?: string
  }>({ open: false })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const isExpanded = (id: string) => expanded[id] !== false
  const toggleExpanded = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false }))

  // Union data across months (so adding a sub-item shows on every month at 0).
  const rawRevenueSubItems = unionRevenueSubItems(months.map(m => m.revenueSubItems))
  const rawCogsSubItems = unionCogsSubItems(months.map(m => m.cogsSubItems))
  const rawOpexNames = unionOpexNames(months.map(m => m.opex))
  const rawCategories = unionCategories(months.map(m => m.customCategories))
  const categoryIds = rawCategories.map(c => c.id)
  // Body zone now only orders user-added custom categories. Legacy `opex:*`
  // entries in `rowOrder.body` are filtered out by resolveBodyOrder since opex
  // is now grouped under a pinned Operating Expenses block.
  const bodyOrder = resolveBodyOrder([], categoryIds, rowOrder).filter(e => e.type === 'cat')
  const catById = new Map(rawCategories.map(c => [c.id, c]))

  // Build pinned main-category wrappers for the unified accordion UI.
  const revenueCategory: CustomCategory = {
    id: PINNED_ID.revenue,
    name: 'Revenue',
    type: 'income',
    subItems: rawRevenueSubItems,
  }
  const cogsCategory: CustomCategory = {
    id: PINNED_ID.cogs,
    name: 'COGS',
    type: 'expense',
    subItems: rawCogsSubItems,
  }
  const opexCategory: CustomCategory = {
    id: PINNED_ID.opex,
    name: 'Operating Expenses',
    type: 'expense',
    subItems: rawOpexNames.map(n => ({ id: n, name: n, amount: 0 })),
  }

  const updateMonths = (next: MonthlyPnLRow[]) =>
    onDataChange({ ...data, monthlyData: next.map(m => computePnL(m)) })

  // ── Revenue handlers ──────────────────────────────────────────────────────
  const handleRevenueFlatChange = (monthIdx: number, value: number) => {
    updateMonths(months.map((m, i) => i === monthIdx ? { ...m, revenue: value } : m))
  }
  const handleRevenueSubChange = (monthKey: string, _catId: string, subId: string, value: number) => {
    const idx = months.findIndex(m => m.month === monthKey)
    if (idx < 0) return
    updateMonths(setRevenueSubItemAmountInMonth(months, idx, subId, value))
  }
  const handleRevenueAddSub = (name: string) => {
    const { months: next } = addRevenueSubItemAcrossMonths(months, name)
    updateMonths(next)
  }
  const handleRevenueRemoveSub = (_catId: string, subId: string) => {
    updateMonths(removeRevenueSubItemAcrossMonths(months, subId))
  }

  // ── COGS handlers ─────────────────────────────────────────────────────────
  const handleCogsFlatChange = (monthIdx: number, value: number) => {
    updateMonths(months.map((m, i) => i === monthIdx ? { ...m, cogs: value } : m))
  }
  const handleCogsSubChange = (monthKey: string, _catId: string, subId: string, value: number) => {
    const idx = months.findIndex(m => m.month === monthKey)
    if (idx < 0) return
    updateMonths(setCogsSubItemAmountInMonth(months, idx, subId, value))
  }
  const handleCogsAddSub = (name: string) => {
    const { months: next } = addCogsSubItemAcrossMonths(months, name)
    updateMonths(next)
  }
  const handleCogsRemoveSub = (_catId: string, subId: string) => {
    updateMonths(removeCogsSubItemAcrossMonths(months, subId))
  }

  // ── Opex handlers ─────────────────────────────────────────────────────────
  const handleOpexSubChange = (monthKey: string, _catId: string, subId: string, value: number) => {
    const idx = months.findIndex(m => m.month === monthKey)
    if (idx < 0) return
    updateMonths(setOpexAmountInMonth(months, idx, subId, value))
  }
  const handleOpexAddSub = (name: string) => {
    const { months: next, name: added } = addOpexAcrossMonths(months, name)
    if (!added) {
      alert('Item opex dengan nama ini sudah ada.')
      return
    }
    updateMonths(next)
  }
  const handleOpexRemoveSub = (_catId: string, subId: string) => {
    updateMonths(removeOpexAcrossMonths(months, subId))
  }
  const handleMoveOpexSub = (_catId: string, subId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const availableIds = opexCategory.subItems.map(s => s.id)
    const next = moveSubItemInCategory(rowOrder?.customSubItems?.[PINNED_ID.opex], availableIds, subId, direction)
    onRowOrderChange(setSubItemOrder(rowOrder, PINNED_ID.opex, next))
  }

  // ── Interest / Taxes / Net Profit inputs ──────────────────────────────────
  const handleEditableChange = (monthIdx: number, key: 'interest' | 'taxes', value: number) => {
    updateMonths(months.map((m, i) => i === monthIdx ? { ...m, [key]: value } : m))
  }

  // ── Custom categories ─────────────────────────────────────────────────────
  const handleAddCategory = (name: string, type: 'income' | 'expense') => {
    const { months: next } = addCategoryAcrossMonths(months, name, type)
    updateMonths(next)
  }
  const handleDialogSubmit = (payload: AddCategoryPayload) => {
    if (payload.kind === 'main') {
      handleAddCategory(payload.name, payload.type)
      return
    }
    if (payload.parentId === PINNED_ID.revenue) {
      handleRevenueAddSub(payload.name)
      return
    }
    if (payload.parentId === PINNED_ID.cogs) {
      handleCogsAddSub(payload.name)
      return
    }
    if (payload.parentId === PINNED_ID.opex) {
      handleOpexAddSub(payload.name)
      return
    }
    const { months: next } = addSubItemAcrossMonths(months, payload.parentId, payload.name)
    updateMonths(next)
  }
  const handleRemoveCategory = (catId: string) => {
    updateMonths(removeCategoryAcrossMonths(months, catId))
  }
  const handleAddSubItemLocal = (catId: string) => {
    // Default: open the add-sub dialog with parent preselected. Avoid window.prompt.
    setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })
  }
  const handleRemoveSubItem = (catId: string, subId: string) => {
    updateMonths(removeSubItemAcrossMonths(months, catId, subId))
  }
  const handleCustomSubChange = (monthKey: string, catId: string, subId: string, value: number) => {
    const idx = months.findIndex(m => m.month === monthKey)
    if (idx < 0) return
    updateMonths(setSubItemAmountInMonth(months, idx, catId, subId, value))
  }
  const handleMoveCategory = (catId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const next = moveInBody(rowOrder, [], categoryIds, { type: 'cat', id: catId }, direction)
    onRowOrderChange({ ...(rowOrder ?? {}), body: next })
  }
  const handleMoveCustomSub = (catId: string, subId: string, direction: MoveDirection) => {
    if (!onRowOrderChange) return
    const cat = catById.get(catId)
    if (!cat) return
    const availableIds = cat.subItems.map(s => s.id)
    const next = moveSubItemInCategory(rowOrder?.customSubItems?.[catId], availableIds, subId, direction)
    onRowOrderChange(setSubItemOrder(rowOrder, catId, next))
  }

  // ── Unit breakdown ───────────────────────────────────────────────────────
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

  // ── Row renderers ────────────────────────────────────────────────────────
  const columns = months.map(m => ({ key: m.month, editable: true }))
  const showGrandTotal = months.length > 1

  const renderComputedRow = (row: ComputedRowDef) => {
    const total = months.reduce((s, m) => s + (Number(m[row.key]) || 0), 0)
    return (
      <tr key={row.key} className={row.isBold ? 'bg-muted/20' : ''}>
        <td className={`sticky left-0 z-10 px-4 py-2 border-r ${row.isBold ? 'font-semibold bg-muted/20' : 'bg-white'}`}>
          {row.label}
        </td>
        {months.map(m => {
          const val = Number(m[row.key]) || 0
          const colorCls =
            row.key === 'netProfit'
              ? (val >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold')
              : (row.className ?? '')
          return (
            <td key={m.month} className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${colorCls} ${row.isBold ? 'font-semibold' : ''}`}>
              {val.toLocaleString('id-ID')}
            </td>
          )
        })}
        {showGrandTotal && (
          <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${
            row.key === 'netProfit'
              ? (total >= 0 ? 'text-green-600' : 'text-red-600')
              : (row.className ?? '')
          }`}>
            {total.toLocaleString('id-ID')}
          </td>
        )}
      </tr>
    )
  }

  const renderEditableRow = (row: EditableRowDef) => {
    const total = months.reduce((s, m) => s + (Number(m[row.key]) || 0), 0)
    return (
      <tr key={row.key} className="hover:bg-muted/10">
        <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r">{row.label}</td>
        {months.map((m, idx) => (
          <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
            <Input
              type="number"
              value={Number(m[row.key]) || 0}
              onChange={e => handleEditableChange(idx, row.key, Number(e.target.value) || 0)}
              className="h-8 text-right text-xs tabular-nums"
            />
          </td>
        ))}
        {showGrandTotal && (
          <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${row.className ?? ''}`}>
            {total.toLocaleString('id-ID')}
          </td>
        )}
      </tr>
    )
  }

  // Renders Revenue/COGS as either a flat editable row (no subItems) or an
  // accordion block (when subItems exist). Common "Tambah Sub-Kategori" inline +
  // is always visible.
  const renderPinnedMain = (args: {
    role: 'revenue' | 'cogs'
    label: string
    category: CustomCategory
    flatKey: 'revenue' | 'cogs'
    flatClassName?: string
    handleFlatChange: (monthIdx: number, value: number) => void
    handleSubChange: (monthKey: string, catId: string, subId: string, value: number) => void
    handleAddSub: (catId: string) => void
    handleRemoveSub: (catId: string, subId: string) => void
    getSubAmount: (monthKey: string, subId: string) => number
    columnSubtotalOverride: (monthKey: string) => number | undefined
  }) => {
    const hasBreakdown = args.category.subItems.length > 0
    if (hasBreakdown) {
      return (
        <CustomCategoryBlock
          key={`pinned-${args.role}`}
          category={args.category}
          columns={columns}
          showGrandTotal={showGrandTotal}
          getAmount={(monthKey, _catId, subId) => args.getSubAmount(monthKey, subId)}
          onAmountChange={args.handleSubChange}
          onRemoveCategory={() => {}}
          onAddSubItem={args.handleAddSub}
          onRemoveSubItem={args.handleRemoveSub}
          pinned
          hideTypeBadge
          isExpanded={isExpanded(args.category.id)}
          onToggleExpand={() => toggleExpanded(args.category.id)}
          onInlineAddSubItem={catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })}
          columnSubtotalOverride={args.columnSubtotalOverride}
          sumTone={args.role === 'revenue' ? 'neutral' : 'expense'}
        />
      )
    }
    // No breakdown — flat editable row. Inline "+" allows adding first sub-item.
    const total = months.reduce((s, m) => s + (Number(m[args.flatKey]) || 0), 0)
    return (
      <tr key={`pinned-${args.role}-flat`} className="bg-muted/20">
        <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 border-r font-semibold">
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate">{args.label}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: args.category.id })}
              title="Tambah sub-kategori"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </td>
        {months.map((m, idx) => (
          <td key={m.month} className="px-2 py-1 text-right whitespace-nowrap">
            <Input
              type="number"
              value={Number(m[args.flatKey]) || 0}
              onChange={e => args.handleFlatChange(idx, Number(e.target.value) || 0)}
              className={`h-8 text-right text-xs tabular-nums ${args.flatClassName ?? ''}`}
            />
          </td>
        ))}
        {showGrandTotal && (
          <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${args.flatClassName ?? ''}`}>
            {total.toLocaleString('id-ID')}
          </td>
        )}
      </tr>
    )
  }

  // Compute Total Opex for the Opex block header even when column has no per-name breakdown.
  const opexColumnTotal = (monthKey: string): number => {
    const m = months.find(mm => mm.month === monthKey)
    if (!m) return 0
    return (m.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
  }

  const getOpexAmount = (monthKey: string, _catId: string, subId: string): number => {
    const m = months.find(mm => mm.month === monthKey)
    return m?.opex?.find(o => o.name === subId)?.amount ?? 0
  }

  const orderedOpexCategory: CustomCategory = {
    ...opexCategory,
    subItems: applySubItemOrder(opexCategory, rowOrder?.customSubItems?.[PINNED_ID.opex]).subItems,
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
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-medium min-w-[220px] border-r">
                  Variable
                </th>
                {months.map(m => (
                  <th key={m.month} className="px-4 py-2.5 text-right font-medium whitespace-nowrap min-w-[160px]">
                    {formatPeriod(m.month)}
                  </th>
                ))}
                {showGrandTotal && (
                  <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap min-w-[155px] border-l bg-muted/80">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Revenue */}
              {renderPinnedMain({
                role: 'revenue',
                label: 'Revenue',
                category: revenueCategory,
                flatKey: 'revenue',
                handleFlatChange: handleRevenueFlatChange,
                handleSubChange: handleRevenueSubChange,
                handleAddSub: catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId }),
                handleRemoveSub: handleRevenueRemoveSub,
                getSubAmount: (monthKey, subId) => {
                  const m = months.find(mm => mm.month === monthKey)
                  return m?.revenueSubItems?.find(s => s.id === subId)?.amount ?? 0
                },
                columnSubtotalOverride: monthKey => {
                  const m = months.find(mm => mm.month === monthKey)
                  if (!m) return undefined
                  return (m.revenueSubItems?.length ?? 0) > 0 ? undefined : (Number(m.revenue) || 0)
                },
              })}

              {/* COGS */}
              {renderPinnedMain({
                role: 'cogs',
                label: 'COGS',
                category: cogsCategory,
                flatKey: 'cogs',
                flatClassName: 'text-red-600',
                handleFlatChange: handleCogsFlatChange,
                handleSubChange: handleCogsSubChange,
                handleAddSub: catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId }),
                handleRemoveSub: handleCogsRemoveSub,
                getSubAmount: (monthKey, subId) => {
                  const m = months.find(mm => mm.month === monthKey)
                  return m?.cogsSubItems?.find(s => s.id === subId)?.amount ?? 0
                },
                columnSubtotalOverride: monthKey => {
                  const m = months.find(mm => mm.month === monthKey)
                  if (!m) return undefined
                  return (m.cogsSubItems?.length ?? 0) > 0 ? undefined : (Number(m.cogs) || 0)
                },
              })}

              {renderComputedRow({ label: 'Gross Profit', key: 'grossProfit', isBold: true, className: 'text-green-700' })}

              {/* Operating Expenses — always an accordion block */}
              <CustomCategoryBlock
                key="pinned-opex"
                category={orderedOpexCategory}
                columns={columns}
                showGrandTotal={showGrandTotal}
                getAmount={getOpexAmount}
                onAmountChange={handleOpexSubChange}
                onRemoveCategory={() => {}}
                onAddSubItem={catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })}
                onRemoveSubItem={handleOpexRemoveSub}
                onMoveSubItem={onRowOrderChange ? handleMoveOpexSub : undefined}
                pinned
                hideTypeBadge
                isExpanded={isExpanded(PINNED_ID.opex)}
                onToggleExpand={() => toggleExpanded(PINNED_ID.opex)}
                onInlineAddSubItem={catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })}
                columnSubtotalOverride={opexColumnTotal}
                sumTone="expense"
              />

              {renderComputedRow({ label: 'Operating Profit', key: 'operatingProfit', isBold: true })}

              {/* Custom categories — user-added income/expense blocks */}
              {bodyOrder.map((entry, bodyIdx) => {
                const isFirstInBody = bodyIdx === 0
                const isLastInBody = bodyIdx === bodyOrder.length - 1
                const cat = catById.get(entry.id)
                if (!cat) return null
                const ordered = applySubItemOrder(cat, rowOrder?.customSubItems?.[cat.id])
                return (
                  <CustomCategoryBlock
                    key={`body-cat-${cat.id}`}
                    category={ordered}
                    columns={columns}
                    showGrandTotal={showGrandTotal}
                    getAmount={(monthKey, catId, subId) => {
                      const m = months.find(mm => mm.month === monthKey)
                      const c = m?.customCategories?.find(cc => cc.id === catId)
                      return c?.subItems.find(s => s.id === subId)?.amount ?? 0
                    }}
                    onAmountChange={handleCustomSubChange}
                    onRemoveCategory={handleRemoveCategory}
                    onAddSubItem={handleAddSubItemLocal}
                    onRemoveSubItem={handleRemoveSubItem}
                    onMoveCategory={onRowOrderChange ? handleMoveCategory : undefined}
                    isFirstInBody={isFirstInBody}
                    isLastInBody={isLastInBody}
                    onMoveSubItem={onRowOrderChange ? handleMoveCustomSub : undefined}
                    isExpanded={isExpanded(cat.id)}
                    onToggleExpand={() => toggleExpanded(cat.id)}
                    onInlineAddSubItem={catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })}
                  />
                )
              })}

              {renderEditableRow({ label: 'Interest', key: 'interest', className: 'text-red-600' })}
              {renderEditableRow({ label: 'Taxes', key: 'taxes', className: 'text-red-600' })}

              {renderComputedRow({ label: 'Net Profit', key: 'netProfit', isBold: true })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={months.length + (showGrandTotal ? 2 : 1)} className="px-4 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddDialog({ open: true, lockedMode: 'main' })}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Tambah Kategori Utama
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

      <AddCustomCategoryDialog
        open={addDialog.open}
        onOpenChange={open => setAddDialog(prev => ({ ...prev, open }))}
        onSubmit={handleDialogSubmit}
        lockedMode={addDialog.lockedMode}
        presetParentId={addDialog.presetParentId}
        existingMainCategories={[
          revenueCategory,
          cogsCategory,
          opexCategory,
          ...rawCategories,
        ]}
      />
    </div>
  )
}
