import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAnalystPortfolios, getNotes, getManagementReports, getEquityHistory,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod } from '@/lib/dateUtils'
import { brandOf } from '@/lib/portfolioName'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TrendingUp, ArrowLeft, StickyNote, ListChecks, History, Inbox } from 'lucide-react'
import type { ActionStatus, ActionCategory, ConfigChangeKind } from '@/types'

interface NoteRow { key: string; portfolioName: string; content: string; seconds?: number }
interface ActionRow {
  key: string; portfolioName: string; period: string
  title: string; status: ActionStatus; assignee: string; dueDate: string; category: ActionCategory
}
interface AuditRow {
  key: string; portfolioName: string; kind?: ConfigChangeKind
  from: string; to: string; by: string; note?: string; seconds?: number
}

const ACTION_STATUS: Record<ActionStatus, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  pending: { label: 'Tertunda', variant: 'secondary' },
  in_progress: { label: 'Berjalan', variant: 'warning' },
  done: { label: 'Selesai', variant: 'success' },
}
const ACTION_CATEGORY: Record<ActionCategory, string> = {
  business: 'Bisnis', operational: 'Operasional', financial: 'Finansial',
}
const CHANGE_KIND: Record<ConfigChangeKind, string> = {
  investor_share: 'Porsi Investor', arunami_fee: 'Fee Arunami', fixed_yield: 'Fixed Yield',
  revenue_share: 'Revenue Share', scheduled_payment: 'Jadwal Pembayaran', dividend_declared: 'Dividen',
  custom_formula: 'Formula Kustom', return_model: 'Model Return',
}

function formatDate(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AnalystNotes() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [actions, setActions] = useState<ActionRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'all'>('all')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const ports = (await getAnalystPortfolios(user.uid)).filter(p => !p.archived)
      const results = await Promise.all(ports.map(async p => {
        const name = brandOf(p)
        const [ns, mgmt, eq] = await Promise.all([
          getNotes(p.id), getManagementReports(p.id), getEquityHistory(p.id),
        ])
        const noteRows: NoteRow[] = ns.map(n => ({ key: `${p.id}_${n.id}`, portfolioName: name, content: n.content, seconds: n.createdAt?.seconds }))
        const actionRows: ActionRow[] = mgmt.flatMap(r => (r.actionItems ?? []).map(a => ({
          key: `${p.id}_${r.id}_${a.id}`, portfolioName: name, period: r.period,
          title: a.title, status: a.status, assignee: a.assignee, dueDate: a.dueDate, category: a.category,
        })))
        const auditRows: AuditRow[] = eq.map(e => ({
          key: `${p.id}_${e.id}`, portfolioName: name, kind: e.changeKind,
          from: e.fromValue ?? `${e.fromInvestorPercent}%`, to: e.toValue ?? `${e.toInvestorPercent}%`,
          by: e.changedByName, note: e.reasonNote, seconds: e.changedAt?.seconds,
        }))
        return { noteRows, actionRows, auditRows }
      }))
      setNotes(results.flatMap(r => r.noteRows).sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0)))
      setActions(results.flatMap(r => r.actionRows))
      setAudit(results.flatMap(r => r.auditRows).sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0)))
      setLoading(false)
    })()
  }, [user])

  const filteredActions = useMemo(
    () => actions.filter(a => statusFilter === 'all' || a.status === statusFilter),
    [actions, statusFilter],
  )

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
            <StickyNote className="h-6 w-6 text-[#38a169]" />
            Catatan & Aktivitas Global
          </h1>
          <p className="text-muted-foreground">Catatan, action item, dan riwayat perubahan lintas portofolio Anda</p>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes"><StickyNote className="mr-1 h-4 w-4" />Catatan ({notes.length})</TabsTrigger>
              <TabsTrigger value="actions"><ListChecks className="mr-1 h-4 w-4" />Action Items ({actions.length})</TabsTrigger>
              <TabsTrigger value="audit"><History className="mr-1 h-4 w-4" />Riwayat ({audit.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="mt-4">
              {notes.length === 0 ? (
                <Empty label="Belum ada catatan." />
              ) : (
                <div className="space-y-2">
                  {notes.map(n => (
                    <Card key={n.key}>
                      <CardContent className="p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="outline">{n.portfolioName}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(n.seconds)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="mt-4 space-y-3">
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as ActionStatus | 'all')}>
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  {(Object.keys(ACTION_STATUS) as ActionStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{ACTION_STATUS[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredActions.length === 0 ? (
                <Empty label="Tidak ada action item." />
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="px-3 py-2 text-left font-medium">Tindakan</th>
                          <th className="px-3 py-2 text-left font-medium">Portofolio</th>
                          <th className="px-3 py-2 text-left font-medium">Periode</th>
                          <th className="px-3 py-2 text-left font-medium">Kategori</th>
                          <th className="px-3 py-2 text-left font-medium">PJ</th>
                          <th className="px-3 py-2 text-left font-medium">Tenggat</th>
                          <th className="px-3 py-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredActions.map(a => (
                          <tr key={a.key} className="hover:bg-muted/30">
                            <td className="px-3 py-2.5 font-medium">{a.title}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{a.portfolioName}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{a.period ? formatPeriod(a.period) : '—'}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{ACTION_CATEGORY[a.category]}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{a.assignee || '—'}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{a.dueDate || '—'}</td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge variant={ACTION_STATUS[a.status].variant}>{ACTION_STATUS[a.status].label}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              {audit.length === 0 ? (
                <Empty label="Belum ada riwayat perubahan." />
              ) : (
                <div className="space-y-2">
                  {audit.map(a => (
                    <Card key={a.key}>
                      <CardContent className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{a.portfolioName}</Badge>
                          {a.kind && <Badge variant="secondary">{CHANGE_KIND[a.kind]}</Badge>}
                          <span className="text-sm">{a.from} → <span className="font-medium">{a.to}</span></span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          oleh {a.by} · {formatDate(a.seconds)}{a.note ? ` · ${a.note}` : ''}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
      <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
      {label}
    </CardContent></Card>
  )
}
