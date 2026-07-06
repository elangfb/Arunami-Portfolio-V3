import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import { getCovenants, saveCovenant, updateCovenant, deleteCovenant } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Scale, AlertTriangle } from 'lucide-react'
import type { Covenant, CovenantResult, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

type Draft = { name: string; requirement: string; actual: string; period: string; result: CovenantResult }
const emptyDraft: Draft = { name: '', requirement: '', actual: '', period: '', result: 'pass' }

export default function CovenantsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [items, setItems] = useState<Covenant[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const fetch = async () => {
    if (!portfolioId) return
    const data = await getCovenants(portfolioId)
    setItems(data.sort((a, b) => (b.period || '').localeCompare(a.period || '')))
    setLoading(false)
  }
  useEffect(() => { fetch() }, [portfolioId])

  const failed = useMemo(() => items.filter(c => c.result === 'fail'), [items])

  const openAdd = () => { setEditId(null); setDraft(emptyDraft); setOpen(true) }
  const openEdit = (c: Covenant) => {
    setEditId(c.id)
    setDraft({ name: c.name, requirement: c.requirement, actual: c.actual, period: c.period, result: c.result })
    setOpen(true)
  }

  const save = async () => {
    if (!portfolioId || !user) return
    if (!draft.name.trim()) { toast.error('Nama covenant wajib diisi'); return }
    setSaving(true)
    try {
      if (editId) {
        await updateCovenant(portfolioId, editId, { ...draft, updatedBy: user.displayName })
      } else {
        await saveCovenant(portfolioId, { ...draft, updatedBy: user.displayName })
      }
      toast.success('Covenant disimpan')
      setOpen(false); fetch()
    } catch {
      toast.error('Gagal menyimpan covenant')
    } finally { setSaving(false) }
  }

  const remove = async (c: Covenant) => {
    if (!portfolioId || !window.confirm(`Hapus covenant "${c.name}"?`)) return
    try {
      await deleteCovenant(portfolioId, c.id)
      toast.success('Covenant dihapus'); fetch()
    } catch { toast.error('Gagal menghapus covenant') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Covenants</h2>
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
      </div>

      {failed.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-900">{failed.length} covenant gagal</p>
            <p className="text-sm text-red-700">{failed.map(c => c.name).join(', ')}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Scale className="h-10 w-10 opacity-30" />
          <p className="text-sm">Belum ada covenant</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-3 text-left font-medium">Covenant</th>
                  <th className="px-3 py-3 text-left font-medium">Syarat</th>
                  <th className="px-3 py-3 text-left font-medium">Aktual</th>
                  <th className="px-3 py-3 text-left font-medium">Periode</th>
                  <th className="px-3 py-3 text-center font-medium">Hasil</th>
                  <th className="px-3 py-3 text-right font-medium w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(c => (
                  <tr key={c.id} className={c.result === 'fail' ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-muted/30'}>
                    <td className="px-3 py-3 font-medium">{c.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.requirement || '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.actual || '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.period || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={c.result === 'pass' ? 'success' : 'danger'}>
                        {c.result === 'pass' ? 'Pass' : 'Gagal'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(c)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit Covenant' : 'Tambah Covenant'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nama *</Label>
              <Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Contoh: DSCR minimum" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Syarat</Label>
                <Input value={draft.requirement} onChange={e => setDraft(d => ({ ...d, requirement: e.target.value }))} placeholder="≥ 1.2x" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aktual</Label>
                <Input value={draft.actual} onChange={e => setDraft(d => ({ ...d, actual: e.target.value }))} placeholder="1.35x" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Periode</Label>
                <Input value={draft.period} onChange={e => setDraft(d => ({ ...d, period: e.target.value }))} placeholder="2026-Q1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasil</Label>
                <Select value={draft.result} onValueChange={v => setDraft(d => ({ ...d, result: v as CovenantResult }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Gagal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
