import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getAnalystPortfolios, getAllInvestorReportsForPortfolio, saveCommunication,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TrendingUp, ArrowLeft, Mail, MailCheck, MailX, Send, Loader2 } from 'lucide-react'
import type { Portfolio } from '@/types'

type EngagementStatus = 'unsent' | 'unread' | 'read'

interface EngagementRow {
  key: string
  portfolioId: string
  portfolioName: string
  investorUid: string
  investorName: string
  period: string
  status: EngagementStatus
}

const STATUS_META: Record<EngagementStatus, { label: string; cls: string }> = {
  unsent: { label: 'Belum Terkirim', cls: 'bg-muted text-muted-foreground' },
  unread: { label: 'Belum Dibaca', cls: 'bg-amber-100 text-amber-700' },
  read: { label: 'Terbaca', cls: 'bg-emerald-100 text-emerald-700' },
}

export default function AnalystEngagement() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [rows, setRows] = useState<EngagementRow[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<EngagementStatus | 'all'>('all')
  const [reminder, setReminder] = useState<EngagementRow | null>(null)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      setPortfolios(ports)
      const perPortfolio = await Promise.all(
        ports.map(async p => {
          const reports = await getAllInvestorReportsForPortfolio(p.id)
          return reports
            // The bulk-publish path can leave placeholder docs; only count real
            // per-investor reports (those carry an investorUid).
            .filter(r => r.investorUid)
            .map((r): EngagementRow => ({
              key: r.id,
              portfolioId: p.id,
              portfolioName: p.brandName || p.name,
              investorUid: r.investorUid,
              investorName: r.investorName,
              period: r.period,
              status: r.status !== 'published' ? 'unsent' : r.isRead ? 'read' : 'unread',
            }))
        }),
      )
      setRows(perPortfolio.flat().sort((a, b) => comparePeriods(b.period, a.period)))
      setLoading(false)
    })()
  }, [user])

  const counts = useMemo(() => {
    const c: Record<EngagementStatus, number> = { unsent: 0, unread: 0, read: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  const filtered = useMemo(
    () => rows
      .filter(r => portfolioFilter === 'all' || r.portfolioId === portfolioFilter)
      .filter(r => statusFilter === 'all' || r.status === statusFilter),
    [rows, portfolioFilter, statusFilter],
  )

  const TILES: { status: EngagementStatus; icon: typeof Mail }[] = [
    { status: 'unsent', icon: MailX },
    { status: 'unread', icon: Mail },
    { status: 'read', icon: MailCheck },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e5f3f]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">ARUNAMI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/analyst')}>
            <ArrowLeft className="mr-1 h-4 w-4" />Kembali
          </Button>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Mail className="h-6 w-6 text-[#38a169]" />
            Engagement Laporan
          </h1>
          <p className="text-muted-foreground">Status keterbacaan laporan investor lintas portofolio Anda</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TILES.map(({ status, icon: Icon }) => (
                <Card key={status}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${STATUS_META[status].cls}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{STATUS_META[status].label}</p>
                      <p className="text-2xl font-bold">{counts[status]}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
                <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua portofolio</SelectItem>
                  {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{p.brandName || p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as EngagementStatus | 'all')}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  {(Object.keys(STATUS_META) as EngagementStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Investor</TableHead>
                    <TableHead>Portofolio</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right w-28">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada laporan investor.</TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.key} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{r.investorName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.portfolioName}</TableCell>
                      <TableCell className="text-muted-foreground">{formatPeriod(r.period)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[r.status].cls}`}>
                          {STATUS_META[r.status].label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status !== 'read' && (
                          <Button size="sm" variant="outline" onClick={() => setReminder(r)}>
                            <Send className="mr-1 h-3.5 w-3.5" />Ingatkan
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </main>

      {reminder && (
        <ReminderDialog
          row={reminder}
          sentBy={user?.uid ?? ''}
          onClose={() => setReminder(null)}
        />
      )}
    </div>
  )
}

function ReminderDialog({
  row, sentBy, onClose,
}: {
  row: EngagementRow
  sentBy: string
  onClose: () => void
}) {
  const [subject, setSubject] = useState(`Pengingat: Laporan ${row.portfolioName} ${formatPeriod(row.period)}`)
  const [message, setMessage] = useState(
    `Halo ${row.investorName}, laporan ${row.portfolioName} periode ${formatPeriod(row.period)} sudah tersedia. Mohon ditinjau ketika sempat. Terima kasih.`,
  )
  const [channel, setChannel] = useState<'email' | 'clipboard'>('email')
  const [saving, setSaving] = useState(false)

  const send = async () => {
    setSaving(true)
    try {
      if (channel === 'clipboard') {
        try { await navigator.clipboard.writeText(message) } catch { /* noop */ }
      }
      await saveCommunication({
        investorUid: row.investorUid,
        type: 'custom_message',
        channel,
        subject: subject.trim(),
        period: row.period,
        portfolioIds: [row.portfolioId],
        sentBy,
      })
      toast.success(channel === 'clipboard' ? 'Pesan disalin & dicatat' : 'Pengingat dicatat')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mencatat pengingat')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kirim Pengingat</DialogTitle>
          <DialogDescription>Catat pengingat untuk {row.investorName}. Dicatat di log komunikasi investor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="mb-1 block text-xs">Subjek</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Pesan</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Kanal</Label>
            <Select value={channel} onValueChange={v => setChannel(v as 'email' | 'clipboard')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="clipboard">Salin ke clipboard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button>
          <Button disabled={saving} onClick={send}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {saving ? 'Menyimpan…' : 'Kirim & Catat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
