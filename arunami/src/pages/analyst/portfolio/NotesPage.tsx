import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getNotes, saveNote, deleteNote } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, StickyNote } from 'lucide-react'
import type { Note, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function NotesPage() {
  const { portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset } = useForm<{ content: string }>()

  const fetchNotes = async () => {
    if (!portfolioId) return
    const data = await getNotes(portfolioId)
    setNotes(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
    setLoading(false)
  }

  useEffect(() => { fetchNotes() }, [portfolioId])

  const onSubmit = async ({ content }: { content: string }) => {
    if (!portfolioId || !user || !content.trim()) return
    setSaving(true)
    try {
      await saveNote(portfolioId, { content: content.trim(), attachments: [], createdBy: user.uid })
      toast.success('Catatan berhasil disimpan')
      reset(); fetchNotes()
    } catch {
      toast.error('Gagal menyimpan catatan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!portfolioId) return
    try {
      await deleteNote(portfolioId, id)
      toast.success('Catatan dihapus')
      fetchNotes()
    } catch {
      toast.error('Gagal menghapus catatan')
    }
  }

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

      {/* Create note */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <Textarea
              rows={4}
              placeholder="Tulis catatan di sini..."
              {...register('content', { required: true })}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Catatan'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notes list */}
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
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">{formatDate(note.createdAt)}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(note.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
