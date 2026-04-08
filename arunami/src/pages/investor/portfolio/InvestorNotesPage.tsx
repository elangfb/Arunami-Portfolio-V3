import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getNotes } from '@/lib/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { StickyNote } from 'lucide-react'
import type { Note, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorNotesPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    getNotes(portfolioId).then(data => {
      setNotes(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
      setLoading(false)
    })
  }, [portfolioId])

  const formatDate = (ts: Note['createdAt']) => {
    if (!ts) return ''
    return new Date(ts.seconds * 1000).toLocaleString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Arunami Notes</h2>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <StickyNote className="h-10 w-10 opacity-30" />
          <p className="text-sm">Belum ada catatan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <Card key={note.id}>
              <CardContent className="pt-4 pb-4">
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                <p className="text-xs text-muted-foreground mt-2">{formatDate(note.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
