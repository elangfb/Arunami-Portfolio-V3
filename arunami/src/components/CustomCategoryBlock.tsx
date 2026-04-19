import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import type { CustomCategory } from '@/types'
import type { MoveDirection } from '@/lib/rowOrder'

export interface CustomCategoryColumn {
  key: string
  editable: boolean
}

interface Props {
  category: CustomCategory
  columns: CustomCategoryColumn[]
  showGrandTotal: boolean
  getAmount: (columnKey: string, catId: string, subId: string) => number
  onAmountChange: (columnKey: string, catId: string, subId: string, value: number) => void
  onRemoveCategory: (catId: string) => void
  onAddSubItem: (catId: string) => void
  onRemoveSubItem: (catId: string, subId: string) => void
  /** When provided, renders up/down on the category header row. */
  onMoveCategory?: (catId: string, direction: MoveDirection) => void
  isFirstInBody?: boolean
  isLastInBody?: boolean
  /** When provided, renders up/down on each sub-item row. */
  onMoveSubItem?: (catId: string, subId: string, direction: MoveDirection) => void
}

export function CustomCategoryBlock({
  category: cat,
  columns,
  showGrandTotal,
  getAmount,
  onAmountChange,
  onRemoveCategory,
  onAddSubItem,
  onRemoveSubItem,
  onMoveCategory,
  isFirstInBody,
  isLastInBody,
  onMoveSubItem,
}: Props) {
  const colCount = columns.length + (showGrandTotal ? 2 : 1)
  const isIncome = cat.type === 'income'
  const badgeClass = isIncome
    ? 'border-transparent bg-green-100 text-green-800'
    : 'border-transparent bg-red-100 text-red-800'
  const sumClass = isIncome ? 'text-green-700' : 'text-red-700'

  const columnSubtotal = (columnKey: string): number =>
    cat.subItems.reduce((s, sub) => s + (getAmount(columnKey, cat.id, sub.id) || 0), 0)

  const grandTotal = (): number =>
    columns.reduce((s, col) => s + columnSubtotal(col.key), 0)

  const grandTotalForSub = (subId: string): number =>
    columns.reduce((s, col) => s + (getAmount(col.key, cat.id, subId) || 0), 0)

  return (
    <Fragment>
      {/* Category header row — shows per-column subtotals */}
      <tr className="bg-muted/20">
        <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 border-r font-semibold">
          <div className="flex items-center gap-1">
            {onMoveCategory && (
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  disabled={!!isFirstInBody}
                  onClick={() => onMoveCategory(cat.id, 'up')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                  title="Pindah ke atas"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={!!isLastInBody}
                  onClick={() => onMoveCategory(cat.id, 'down')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                  title="Pindah ke bawah"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
            <span className="flex-1 truncate">{cat.name}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${badgeClass}`}>
              {isIncome ? 'Income' : 'Expense'}
            </Badge>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemoveCategory(cat.id)}
              title="Hapus kategori"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </td>
        {columns.map(col => {
          const val = columnSubtotal(col.key)
          return (
            <td
              key={col.key}
              className={`px-4 py-2 text-right whitespace-nowrap tabular-nums font-semibold ${sumClass}`}
            >
              {val.toLocaleString('id-ID')}
            </td>
          )
        })}
        {showGrandTotal && (
          <td
            className={`px-4 py-2 text-right whitespace-nowrap tabular-nums border-l font-semibold ${sumClass}`}
          >
            {grandTotal().toLocaleString('id-ID')}
          </td>
        )}
      </tr>

      {/* Sub-item rows */}
      {cat.subItems.map((sub, subIdx) => {
        const isFirstSub = subIdx === 0
        const isLastSub = subIdx === cat.subItems.length - 1
        return (
          <tr key={`sub-${cat.id}-${sub.id}`} className="hover:bg-muted/10">
            <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r pl-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                {onMoveSubItem && (
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={isFirstSub}
                      onClick={() => onMoveSubItem(cat.id, sub.id, 'up')}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      title="Pindah ke atas"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isLastSub}
                      onClick={() => onMoveSubItem(cat.id, sub.id, 'down')}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      title="Pindah ke bawah"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="flex-1 truncate">{sub.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onRemoveSubItem(cat.id, sub.id)}
                  title="Hapus sub-item"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </td>
            {columns.map(col => {
              const val = getAmount(col.key, cat.id, sub.id)
              return (
                <td key={col.key} className="px-2 py-1 text-right whitespace-nowrap">
                  {col.editable ? (
                    <Input
                      type="number"
                      value={val}
                      onChange={e =>
                        onAmountChange(col.key, cat.id, sub.id, Number(e.target.value) || 0)
                      }
                      className="h-8 text-right text-xs tabular-nums"
                    />
                  ) : (
                    <div className="h-8 flex items-center justify-end px-3 text-sm tabular-nums text-muted-foreground">
                      {val.toLocaleString('id-ID')}
                    </div>
                  )}
                </td>
              )
            })}
            {showGrandTotal && (
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums border-l text-muted-foreground">
                {grandTotalForSub(sub.id).toLocaleString('id-ID')}
              </td>
            )}
          </tr>
        )
      })}

      {/* Add sub-item row */}
      <tr>
        <td colSpan={colCount} className="px-4 py-1.5 pl-8 border-b">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onAddSubItem(cat.id)}
          >
            <Plus className="h-3 w-3 mr-1" /> Tambah Sub-Kategori
          </Button>
        </td>
      </tr>
    </Fragment>
  )
}
