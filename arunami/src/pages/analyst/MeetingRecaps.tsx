import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getAnalystPortfolios, getMeetingRecaps, deleteMeetingRecap, firestoreErrorMessage,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatWeekLabel } from '@/lib/dateUtils'
import { brandOf } from '@/lib/portfolioName'
import { MeetingRecapCard } from '@/components/shared/MeetingRecapCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { CalendarDays, Lock, Presentation, Inbox } from 'lucide-react'
import type { MeetingRecap } from '@/types'

interface RecapRow { portfolioId: string; portfolioName: string; recap: MeetingRecap }

/**
 * Archive of the weekly meeting recaps saved from Mode Rapat, across every
 * portfolio the analyst is assigned to. Internal by rule — investors have no
 * read access to /meetingRecaps at all.
 */
export default function MeetingRecaps() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<RecapRow[]>([])
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([])
  const [filter, setFilter] = useState('all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      setPortfolios(ports.map(p => ({ id: p.id, name: brandOf(p) })))
      const perPortfolio = await Promise.all(ports.map(async p => {
        const recaps = await getMeetingRecaps(p.id)
        return recaps.map(recap => ({ portfolioId: p.id, portfolioName: brandOf(p), recap }))
      }))
      setRows(
        perPortfolio.flat().sort((a, b) =>
          b.recap.id.localeCompare(a.recap.id) || a.portfolioName.localeCompare(b.portfolioName)),
      )
    } catch (err) {
      console.error('getMeetingRecaps', err)
      toast.error(firestoreErrorMessage(err, 'Gagal memuat recap rapat'))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const visible = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => r.portfolioId === filter),
    [rows, filter],
  )

  const remove = async ({ portfolioId, recap }: RecapRow) => {
    if (!window.confirm(`Hapus recap ${formatWeekLabel(recap.id)}?`)) return
    try {
      await deleteMeetingRecap(portfolioId, recap.id)
      toast.success('Recap dihapus')
      await load()
    } catch (err) {
      console.error('deleteMeetingRecap', err)
      toast.error(firestoreErrorMessage(err, 'Gagal menghapus recap'))
    }
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays className="h-6 w-6 text-[#38a169]" />
            Recap Rapat
          </h1>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            Arsip notulen mingguan dari Mode Rapat — internal, tidak terlihat investor.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/analyst/meeting"><Presentation className="mr-1 h-4 w-4" />Buka Mode Rapat</Link>
        </Button>
      </div>

      {portfolios.length > 1 && (
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua portofolio ({rows.length})</SelectItem>
            {portfolios.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({rows.filter(r => r.portfolioId === p.id).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            Belum ada recap tersimpan.
            <p className="mt-1 text-xs">
              Simpan dari agenda Kesimpulan di Mode Rapat setelah rapat mingguan selesai.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map(row => {
            const key = `${row.portfolioId}_${row.recap.id}`
            return (
              <MeetingRecapCard
                key={key}
                recap={row.recap}
                portfolioLabel={filter === 'all' ? row.portfolioName : undefined}
                open={openKey === key}
                onToggle={() => setOpenKey(openKey === key ? null : key)}
                onDelete={() => remove(row)}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
