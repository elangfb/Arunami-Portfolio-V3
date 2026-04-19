import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CustomCategoryType } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string, type: CustomCategoryType) => void
  existingNames: string[]
}

export function AddCustomCategoryDialog({ open, onOpenChange, onSubmit, existingNames }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomCategoryType>('expense')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setType('expense')
    setError(null)
  }

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Nama kategori wajib diisi')
      return
    }
    if (existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      setError('Kategori dengan nama ini sudah ada')
      return
    }
    onSubmit(trimmed, type)
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
          <DialogTitle>Tambah Kategori Baru</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-cat-name">Nama Kategori</Label>
            <Input
              id="custom-cat-name"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder="misal: R&D Expenses, Hibah Q1"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>
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
