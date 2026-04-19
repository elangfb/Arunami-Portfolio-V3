import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CustomCategory, CustomCategoryType } from '@/types'

export type AddCategoryPayload =
  | { kind: 'main'; name: string; type: CustomCategoryType }
  | { kind: 'sub'; name: string; parentId: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: AddCategoryPayload) => void
  existingMainCategories: CustomCategory[]
  /** When set, locks the dialog to either main or sub mode and hides the toggle. */
  lockedMode?: 'main' | 'sub'
  /** When set together with lockedMode='sub', preselects this parent id. */
  presetParentId?: string
}

type Mode = 'main' | 'sub'

export function AddCustomCategoryDialog({
  open,
  onOpenChange,
  onSubmit,
  existingMainCategories,
  lockedMode,
  presetParentId,
}: Props) {
  const hasMainCategories = existingMainCategories.length > 0
  const [requestedMode, setRequestedMode] = useState<Mode>('main')
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomCategoryType>('expense')
  const [selectedParentId, setSelectedParentId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Derive effective state: honor lockedMode if set; otherwise sub mode requires
  // at least one main category. Parent id prefers presetParentId → selectedParentId
  // → first available. No useEffect needed — all derived from props + local state.
  const mode: Mode = lockedMode
    ? lockedMode
    : (requestedMode === 'sub' && hasMainCategories ? 'sub' : 'main')
  const parentId: string = mode === 'sub'
    ? (presetParentId && existingMainCategories.some(c => c.id === presetParentId)
        ? presetParentId
        : existingMainCategories.some(c => c.id === selectedParentId)
          ? selectedParentId
          : existingMainCategories[0]?.id ?? '')
    : ''

  const reset = () => {
    setRequestedMode('main')
    setName('')
    setType('expense')
    setSelectedParentId('')
    setError(null)
  }

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(mode === 'main' ? 'Nama kategori wajib diisi' : 'Nama sub-kategori wajib diisi')
      return
    }
    if (mode === 'main') {
      const clash = existingMainCategories.some(
        c => c.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (clash) {
        setError('Kategori dengan nama ini sudah ada')
        return
      }
      onSubmit({ kind: 'main', name: trimmed, type })
    } else {
      if (!parentId) {
        setError('Pilih kategori utama terlebih dahulu')
        return
      }
      const parent = existingMainCategories.find(c => c.id === parentId)
      const clash = parent?.subItems.some(
        s => s.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (clash) {
        setError('Sub-kategori dengan nama ini sudah ada di kategori tersebut')
        return
      }
      onSubmit({ kind: 'sub', name: trimmed, parentId })
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {lockedMode === 'main'
              ? 'Tambah Kategori Utama'
              : lockedMode === 'sub'
                ? 'Tambah Sub-Kategori'
                : 'Tambah Baru'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Main vs Sub toggle — hidden when lockedMode is set */}
          {!lockedMode && (
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setRequestedMode('main'); setError(null) }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'main'
                      ? 'border-foreground bg-muted'
                      : 'border-input hover:bg-muted'
                  }`}
                >
                  Kategori Utama
                </button>
                <button
                  type="button"
                  disabled={!hasMainCategories}
                  onClick={() => { setRequestedMode('sub'); setError(null) }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    mode === 'sub'
                      ? 'border-foreground bg-muted'
                      : 'border-input hover:bg-muted'
                  }`}
                  title={hasMainCategories ? undefined : 'Buat kategori utama terlebih dahulu'}
                >
                  Sub-Kategori
                </button>
              </div>
              {!hasMainCategories && (
                <p className="text-xs text-muted-foreground">
                  Belum ada kategori utama. Buat kategori utama terlebih dahulu untuk menambah sub-kategori.
                </p>
              )}
            </div>
          )}

          {mode === 'sub' && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-cat-parent">Kategori Utama</Label>
              {presetParentId ? (
                <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm font-medium">
                  {existingMainCategories.find(c => c.id === parentId)?.name ?? parentId}
                </div>
              ) : (
                <select
                  id="custom-cat-parent"
                  value={parentId}
                  onChange={e => { setSelectedParentId(e.target.value); setError(null) }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {existingMainCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type === 'income' ? 'Income' : 'Expense'})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="custom-cat-name">
              {mode === 'main' ? 'Nama Kategori' : 'Nama Sub-Kategori'}
            </Label>
            <Input
              id="custom-cat-name"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder={mode === 'main'
                ? 'misal: R&D Expenses, Hibah Q1'
                : 'misal: Salary R&D, Tools'}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>

          {mode === 'main' && (
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    type === 'income'
                      ? 'border-green-500 bg-green-50 text-green-800'
                      : 'border-input hover:bg-muted'
                  }`}
                >
                  Income (tambah ke Net Profit)
                </button>
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    type === 'expense'
                      ? 'border-red-500 bg-red-50 text-red-800'
                      : 'border-input hover:bg-muted'
                  }`}
                >
                  Expense (kurangi Net Profit)
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
            Batal
          </Button>
          <Button onClick={handleSubmit} className="bg-[#38a169] hover:bg-[#2f855a]">
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
