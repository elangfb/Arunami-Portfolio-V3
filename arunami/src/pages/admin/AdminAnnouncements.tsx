import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  getAnnouncements, saveAnnouncement, updateAnnouncement, deleteAnnouncement,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Megaphone, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import type { Announcement, AnnouncementAudience } from '@/types'

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Semua Pengguna',
  investor: 'Investor',
  analyst: 'BA-PM (Analis)',
  investor_relation: 'Investor Relations',
}

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminAnnouncements() {
  const { user } = useAuthStore()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)

  const load = () => {
    getAnnouncements()
      .then(setItems)
      .catch(err => { console.error(err); toast.error('Gagal memuat pengumuman') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const toggleActive = async (a: Announcement) => {
    try {
      await updateAnnouncement(a.id, { active: !a.active })
      load()
    } catch { toast.error('Gagal memperbarui status') }
  }

  const remove = async (a: Announcement) => {
    if (!confirm('Hapus pengumuman ini?')) return
    try { await deleteAnnouncement(a.id); toast.success('Pengumuman dihapus'); load() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-[#38a169]" />
            Pengumuman
          </h1>
          <p className="text-muted-foreground">Kirim pengumuman ke peran tertentu atau semua pengguna</p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />Buat</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Belum ada pengumuman.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map(a => (
            <Card key={a.id} className={a.active ? '' : 'opacity-60'}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.title}</span>
                    <Badge variant="outline">{AUDIENCE_LABELS[a.audience]}</Badge>
                    {a.active ? <Badge variant="success">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{a.createdByName} · {formatDate(a.createdAt?.seconds)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" title={a.active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleActive(a)}>
                    {a.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Hapus" className="text-red-600 hover:bg-red-50" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <AnnouncementDialog
          initial={editing === 'new' ? null : editing}
          authorUid={user?.uid ?? ''}
          authorName={user?.displayName ?? 'Admin'}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function AnnouncementDialog({
  initial, authorUid, authorName, onClose, onSaved,
}: {
  initial: Announcement | null
  authorUid: string
  authorName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [audience, setAudience] = useState<AnnouncementAudience>(initial?.audience ?? 'all')
  const [active, setActive] = useState(initial?.active ?? true)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Judul dan isi wajib diisi.'); return }
    setSaving(true)
    try {
      if (initial) {
        await updateAnnouncement(initial.id, { title: title.trim(), body: body.trim(), audience, active })
      } else {
        await saveAnnouncement({
          title: title.trim(), body: body.trim(), audience, active,
          createdBy: authorUid, createdByName: authorName,
        })
      }
      toast.success('Pengumuman disimpan')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{initial ? 'Edit Pengumuman' : 'Pengumuman Baru'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="mb-1 block text-xs">Judul</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Judul pengumuman" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Isi</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Tulis isi pengumuman…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Audiens</Label>
              <Select value={audience} onValueChange={v => setAudience(v as AnnouncementAudience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as AnnouncementAudience[]).map(a => (
                    <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
              Tampilkan (aktif)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button>
          <Button disabled={saving} onClick={save}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
