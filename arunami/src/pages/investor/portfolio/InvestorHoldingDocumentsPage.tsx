import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getDocumentsForPortfolios } from '@/lib/firestore'
import { DOCUMENT_CATEGORY_LABELS, formatFileSize } from '@/lib/documents'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, ExternalLink, Inbox } from 'lucide-react'
import type { LibraryDocument } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InvestorHoldingDocumentsPage() {
  const { portfolioId } = useOutletContext<InvestorPortfolioOutletContext>()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    getDocumentsForPortfolios([portfolioId])
      .then(setDocs)
      .finally(() => setLoading(false))
  }, [portfolioId])

  if (loading) {
    return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Dokumen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Kontrak dan dokumen untuk portofolio ini</p>
      </div>

      {docs.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          Belum ada dokumen.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    <Badge variant="outline">{DOCUMENT_CATEGORY_LABELS[d.category]}</Badge>
                    {d.version && <Badge variant="secondary">{d.version}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(d.fileSize)} · {formatDate(d.createdAt?.seconds)}</p>
                </div>
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5" />Buka
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
