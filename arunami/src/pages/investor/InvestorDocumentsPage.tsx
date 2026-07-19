import { useEffect, useMemo, useState } from 'react'
import { getInvestorPortfolios, getDocumentsForPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_CATEGORIES, formatFileSize } from '@/lib/documents'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { FolderOpen, Search, FileText, ExternalLink, Inbox } from 'lucide-react'
import type { LibraryDocument, DocumentCategory, Portfolio } from '@/types'

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InvestorDocumentsPage() {
  const { user } = useAuthStore()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = await getInvestorPortfolios(user.uid)
      setPortfolios(ports)
      setDocs(await getDocumentsForPortfolios(ports.map(p => p.id)))
      setLoading(false)
    })()
  }, [user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs
      .filter(d => portfolioFilter === 'all' || d.portfolioId === portfolioFilter)
      .filter(d => categoryFilter === 'all' || d.category === categoryFilter)
      .filter(d => !q || d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q))
  }, [docs, search, portfolioFilter, categoryFilter])

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FolderOpen className="h-6 w-6 text-[#1e5f3f]" />
            Dokumen
          </h1>
          <p className="text-muted-foreground">Kontrak dan dokumen portofolio Anda</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari dokumen…" className="pl-9" />
          </div>
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua portofolio</SelectItem>
              {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{p.brandName || p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as DocumentCategory | 'all')}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua tipe</SelectItem>
              {DOCUMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            {docs.length === 0 ? 'Belum ada dokumen untuk portofolio Anda.' : 'Tidak ada dokumen yang cocok.'}
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
                      <Badge variant="outline">{DOCUMENT_CATEGORY_LABELS[d.category]}</Badge>
                      {d.version && <Badge variant="secondary">{d.version}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.portfolioName} · {formatFileSize(d.fileSize)} · {formatDate(d.createdAt?.seconds)}
                    </p>
                  </div>
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <Button size="sm" variant="outline"><ExternalLink className="mr-1 h-3.5 w-3.5" />Buka</Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </main>
  )
}
