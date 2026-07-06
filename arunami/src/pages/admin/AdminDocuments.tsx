import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  getAllPortfolios, getAllDocuments, uploadDocument, deleteDocument,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { brandOf } from '@/lib/portfolioName'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { FolderOpen, Plus, Search, FileText, ExternalLink, Trash2, Upload, Loader2 } from 'lucide-react'
import { DOCUMENT_CATEGORY_LABELS as CATEGORY_LABELS, DOCUMENT_CATEGORIES as CATEGORIES, formatFileSize as formatBytes } from '@/lib/documents'
import type { LibraryDocument, DocumentCategory, Portfolio } from '@/types'

const PLATFORM_VALUE = '__platform__'

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminDocuments() {
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all')
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = () => {
    Promise.all([getAllDocuments(), getAllPortfolios()])
      .then(([d, p]) => { setDocs(d); setPortfolios(p) })
      .catch(err => { console.error(err); toast.error('Gagal memuat dokumen') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs
      .filter(d => portfolioFilter === 'all'
        ? true
        : portfolioFilter === PLATFORM_VALUE ? d.portfolioId === null : d.portfolioId === portfolioFilter)
      .filter(d => categoryFilter === 'all' || d.category === categoryFilter)
      .filter(d => !q || d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q))
  }, [docs, search, portfolioFilter, categoryFilter])

  const remove = async (d: LibraryDocument) => {
    if (!confirm(`Hapus dokumen "${d.title}"?`)) return
    try { await deleteDocument(d); toast.success('Dokumen dihapus'); load() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FolderOpen className="h-6 w-6 text-[#38a169]" />
            Pustaka Dokumen
          </h1>
          <p className="text-muted-foreground">Kontrak, laporan, dan dokumen legal per portofolio</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}><Plus className="mr-1 h-4 w-4" />Unggah</Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul atau nama file…" className="pl-9" />
        </div>
        <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua portofolio</SelectItem>
            <SelectItem value={PLATFORM_VALUE}>Platform (umum)</SelectItem>
            {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{brandOf(p)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as DocumentCategory | 'all')}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tipe</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          {docs.length === 0 ? 'Belum ada dokumen. Unggah dokumen pertama.' : 'Tidak ada dokumen yang cocok.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    <Badge variant="outline">{CATEGORY_LABELS[d.category]}</Badge>
                    {d.version && <Badge variant="secondary">{d.version}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.portfolioId ? d.portfolioName : 'Platform (umum)'} · {formatBytes(d.fileSize)} · {d.uploadedByName} · {formatDate(d.createdAt?.seconds)}
                  </p>
                </div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <Button size="sm" variant="outline"><ExternalLink className="mr-1 h-3.5 w-3.5" />Buka</Button>
                </a>
                <Button size="icon" variant="ghost" className="shrink-0 text-red-600 hover:bg-red-50" onClick={() => remove(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadDialog
          portfolios={portfolios}
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); load() }}
        />
      )}
    </div>
  )
}

function UploadDialog({
  portfolios, onClose, onSaved,
}: {
  portfolios: Portfolio[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [portfolioId, setPortfolioId] = useState<string>(PLATFORM_VALUE)
  const [category, setCategory] = useState<DocumentCategory>('kontrak')
  const [version, setVersion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { toast.error('Judul wajib diisi.'); return }
    if (!file) { toast.error('Pilih file terlebih dahulu.'); return }
    const portfolio = portfolios.find(p => p.id === portfolioId)
    setSaving(true)
    try {
      await uploadDocument({
        portfolioId: portfolioId === PLATFORM_VALUE ? null : portfolioId,
        portfolioName: portfolio ? brandOf(portfolio) : 'Platform',
        title, category, version, file,
        uploadedBy: user?.uid ?? '', uploadedByName: user?.displayName ?? 'Admin',
      })
      toast.success('Dokumen diunggah')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Unggah Dokumen</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="mb-1 block text-xs">Judul</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Perjanjian Investasi 2026" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Portofolio</Label>
              <Select value={portfolioId} onValueChange={setPortfolioId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={PLATFORM_VALUE}>Platform (umum)</SelectItem>
                  {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{brandOf(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Tipe</Label>
              <Select value={category} onValueChange={v => setCategory(v as DocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Versi (opsional)</Label>
            <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="v1" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">File</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm hover:bg-muted/50">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{file ? file.name : 'Pilih file (maks 20 MB)'}</span>
              <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button>
          <Button disabled={saving} onClick={save}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            {saving ? 'Mengunggah…' : 'Unggah'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
