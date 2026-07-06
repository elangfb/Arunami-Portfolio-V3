import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import { getMilestones, saveMilestone, updateMilestone, deleteMilestone } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Target } from 'lucide-react'
import type { Milestone, MilestoneStatus, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const STATUS_OPTIONS: { value: MilestoneStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'on_track', label: 'On Track' },
  { value: 'achieved', label: 'Tercapai' },
  { value: 'delayed', label: 'Tertunda' },
  { value: 'missed', label: 'Terlewat' },
]

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: 'Pending', on_track: 'On Track', achieved: 'Tercapai', delayed: 'Tertunda', missed: 'Terlewat',
}
const STATUS_VARIANT: Record<MilestoneStatus, 'default' | 'secondary' | 'success' | 'warning' | 'danger'> = {
  pending: 'secondary', on_track: 'default', achieved: 'success', delayed: 'warning', missed: 'danger',
}

type Draft = { title: string; successCriteria: string; targetDate: string; status: MilestoneStatus }
const emptyDraft: Draft = { title: '', successCriteria: '', targetDate: '', status: 'pending' }

export default function MilestonesPage() {
  const { portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [items, setItems] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const fetch = async () => {
    if (!portfolioId) return
    const data = await getMilestones(portfolioId)
    setItems(data.sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || '')))
    setLoading(false)
  }
  useEffect(() => { fetch() }, [portfolioId])

  const openAdd = () => { setEditId(null); setDraft(emptyDraft); setOpen(true) }
  const openEdit = (m: Milestone) => {
    setEditId(m.id)
    setDraft({ title: m.title, successCriteria: m.successCriteria, targetDate: m.targetDate, status: m.status })
    setOpen(true)
  }

  const save = async () => {
    if (!portfolioId || !user) return
    if (!draft.title.trim()) { toast.error('Judul milestone wajib diisi'); return }
    setSaving(true)
    try {
      if (editId) {
        await updateMilestone(portfolioId, editId, { ...draft, updatedBy: user.displayName })
      } else {
        await saveMilestone(portfolioId, { ...draft, updatedBy: user.displayName })
      }
      toast.success('Milestone disimpan')
      setOpen(false); fetch()
    } catch {
      toast.error('Gagal menyimpan milestone')
    } finally { setSaving(false) }
  }

  const remove = async (m: Milestone) => {
    if (!portfolioId || !window.confirm(`Hapus milestone "${m.title}"?`)) return
    try {
      await deleteMilestone(portfolioId, m.id)
      toast.success('Milestone dihapus'); fetch()
    } catch { toast.error('Gagal menghapus milestone') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Milestones</h2>
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Target className="h-10 w-10 opacity-30" />
          <p className="text-sm">Belum ada milestone</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-3 text-left font-medium">Milestone</th>
                  <th className="px-3 py-3 text-left font-medium">Target</th>
                  <th className="px-3 py-3 text-center font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(m => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <p className="font-medium">{m.title}</p>
                      {m.successCriteria && <p className="text-xs text-muted-foreground">{m.successCriteria}</p>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{m.targetDate || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(m)}>
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
          <DialogHeader><DialogTitle>{editId ? 'Edit Milestone' : 'Tambah Milestone'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Judul *</Label>
              <Input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kriteria Keberhasilan</Label>
              <Textarea rows={2} value={draft.successCriteria} onChange={e => setDraft(d => ({ ...d, successCriteria: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tanggal Target</Label>
                <Input type="date" value={draft.targetDate} onChange={e => setDraft(d => ({ ...d, targetDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={draft.status} onValueChange={v => setDraft(d => ({ ...d, status: v as MilestoneStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
