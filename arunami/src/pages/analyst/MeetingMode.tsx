import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getAnalystPortfolios, getFinancialData, getPortfolioConfigOrDefault, getConfigTimeline, saveNote,
} from '@/lib/firestore'
import { computePortfolioMetric, type PortfolioMetric } from '@/lib/analystMetrics'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyExact, formatCurrencyCompact, formatPercent } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { brandOf } from '@/lib/portfolioName'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { HEALTH_LABELS, healthFreshness } from '@/lib/health'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Presentation, X, Check, Circle, ArrowRight, Plus, Trash2, Copy, Save,
  DollarSign, TrendingUp, Wallet, Percent, ListChecks, ArrowUp, ArrowDown,
} from 'lucide-react'
import type { Portfolio, FinancialData, PortfolioConfig } from '@/types'

interface LiveNote { id: string; text: string }
interface LiveAction { id: string; text: string; assignee: string; done: boolean }

const SECTIONS = [
  { id: 'ringkasan', label: 'Ringkasan Kinerja' },
  { id: 'perbandingan', label: 'Perbandingan Periode' },
  { id: 'update', label: 'Update Mingguan' },
  { id: 'catatan', label: 'Catatan & Action Items' },
  { id: 'kesimpulan', label: 'Kesimpulan' },
] as const
type SectionId = typeof SECTIONS[number]['id']

// Session-only monotonic id (Date.now/Math.random are fine in a page component).
let seq = 0
const nextId = () => `m${++seq}`

export default function MeetingMode() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioId, setPortfolioId] = useState('')
  const [metric, setMetric] = useState<PortfolioMetric | null>(null)
  const [financial, setFinancial] = useState<FinancialData | null>(null)
  const [, setConfig] = useState<PortfolioConfig | null>(null)
  const [loadingData, setLoadingData] = useState(false)

  const [active, setActive] = useState<SectionId>('ringkasan')
  const [covered, setCovered] = useState<Set<SectionId>>(new Set())

  const [periodA, setPeriodA] = useState('')
  const [periodB, setPeriodB] = useState('')
  const [weeklyUpdate, setWeeklyUpdate] = useState('')
  const [notes, setNotes] = useState<LiveNote[]>([])
  const [actions, setActions] = useState<LiveAction[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [actionDraft, setActionDraft] = useState('')
  const [actionAssignee, setActionAssignee] = useState('')
  const [committing, setCommitting] = useState(false)

  const portfolio = portfolios.find(p => p.id === portfolioId) ?? null

  useEffect(() => {
    if (!user) return
    getAnalystPortfolios(user.uid).then(ps => setPortfolios(ps.filter(p => !p.archived)))
  }, [user])

  // Load a portfolio's data when selected; reset the session review state.
  useEffect(() => {
    if (!portfolioId) { setMetric(null); setFinancial(null); return }
    setLoadingData(true)
    const target = portfolios.find(p => p.id === portfolioId)
    Promise.all([
      getFinancialData(portfolioId),
      getPortfolioConfigOrDefault(portfolioId),
      getConfigTimeline(portfolioId),
    ])
      .then(([fd, cfg, timeline]) => {
        setFinancial(fd)
        setConfig(cfg)
        // Each month is calculated against the terms in force for it, so a
        // future-dated profit-sharing change never restates an earlier period.
        const m = target ? computePortfolioMetric(target, fd, cfg, undefined, timeline) : null
        setMetric(m)
        const months = (m?.monthly ?? []).map(r => r.month).sort((a, b) => comparePeriods(b, a))
        setPeriodB(months[0] ?? '')
        setPeriodA(months[1] ?? months[0] ?? '')
      })
      .finally(() => setLoadingData(false))
  }, [portfolioId, portfolios])

  const goto = (id: SectionId) => {
    setActive(id)
    setCovered(prev => new Set(prev).add(id))
  }

  // ─── Period comparison rows ──────────────────────────────────────────────
  const rowByMonth = useMemo(() => {
    const m = new Map<string, PortfolioMetric['monthly'][number]>()
    for (const r of metric?.monthly ?? []) m.set(r.month, r)
    return m
  }, [metric])

  const projByMonth = useMemo(() => {
    const revProj = new Map((financial?.revenueData ?? []).map(r => [r.month, r.proyeksi]))
    const netProj = new Map((financial?.profitData ?? []).map(r => [r.month, r.proyeksi]))
    return { revProj, netProj }
  }, [financial])

  const rowA = periodA ? rowByMonth.get(periodA) : undefined
  const rowB = periodB ? rowByMonth.get(periodB) : undefined

  const availableMonths = useMemo(
    () => (metric?.monthly ?? []).map(r => r.month).sort((a, b) => comparePeriods(b, a)),
    [metric],
  )

  const addNote = () => {
    if (!noteDraft.trim()) return
    setNotes(n => [...n, { id: nextId(), text: noteDraft.trim() }])
    setNoteDraft('')
  }
  const addAction = () => {
    if (!actionDraft.trim()) return
    setActions(a => [...a, { id: nextId(), text: actionDraft.trim(), assignee: actionAssignee.trim(), done: false }])
    setActionDraft(''); setActionAssignee('')
  }

  const summaryText = useMemo(() => {
    if (!portfolio) return ''
    const lines: string[] = []
    lines.push(`Notulen Rapat — ${brandOf(portfolio)}`)
    if (periodB) lines.push(`Periode ditinjau: ${periodA ? formatPeriod(periodA) + ' → ' : ''}${formatPeriod(periodB)}`)
    lines.push(
      `Kesehatan: ${HEALTH_LABELS[portfolio.healthLevel ?? 'sehat']}` +
      ` (${healthFreshness(portfolio.healthComputedAt).label.toLowerCase()})`,
    )
    if (weeklyUpdate.trim()) { lines.push('', 'Update Mingguan:', weeklyUpdate.trim()) }
    if (notes.length) { lines.push('', 'Catatan:'); notes.forEach(n => lines.push(`- ${n.text}`)) }
    if (actions.length) {
      lines.push('', 'Action Items:')
      actions.forEach(a => lines.push(`- [${a.done ? 'x' : ' '}] ${a.text}${a.assignee ? ` (@${a.assignee})` : ''}`))
    }
    return lines.join('\n')
  }, [portfolio, periodA, periodB, weeklyUpdate, notes, actions])

  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summaryText); toast.success('Notulen disalin') }
    catch { toast.error('Gagal menyalin') }
  }

  const commit = async () => {
    if (!portfolioId || !summaryText.trim()) return
    setCommitting(true)
    try {
      await saveNote(portfolioId, { content: summaryText, attachments: [], createdBy: user?.uid ?? '' })
      toast.success('Notulen disimpan ke Catatan portofolio')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-[#12261c] px-4 text-white">
        <div className="flex items-center gap-3">
          <Presentation className="h-5 w-5 text-[#38a169]" />
          <span className="font-bold">Mode Rapat</span>
          <div className="w-56">
            <Select value={portfolioId} onValueChange={setPortfolioId}>
              <SelectTrigger className="h-8 border-white/15 bg-white/5 text-sm text-white">
                <SelectValue placeholder="Pilih portofolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{brandOf(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {portfolio && (
            <HealthBadge
              level={portfolio.healthLevel}
              reasons={portfolio.healthReasons}
              computedAt={portfolio.healthComputedAt ?? null}
            />
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => navigate('/analyst')}>
          <X className="mr-1 h-4 w-4" />Keluar
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Agenda sidebar */}
        <aside className="w-60 shrink-0 overflow-y-auto border-r bg-muted/30 p-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Agenda</p>
          <nav className="space-y-1">
            {SECTIONS.map((s, i) => (
              <Button
                key={s.id}
                variant="ghost"
                onClick={() => goto(s.id)}
                className={`flex h-auto w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm ${active === s.id ? 'bg-[#38a169]/15 font-medium text-[#1e5f3f]' : 'hover:bg-muted'}`}
              >
                {covered.has(s.id)
                  ? <Check className="h-4 w-4 shrink-0 text-[#38a169]" />
                  : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                <span className="flex-1">{i + 1}. {s.label}</span>
              </Button>
            ))}
          </nav>
          <div className="mt-3 border-t pt-3">
            <p className="px-2 text-xs text-muted-foreground">{covered.size}/{SECTIONS.length} agenda dibahas</p>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {!portfolioId ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground">
              <div>
                <Presentation className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                <p>Pilih portofolio untuk memulai rapat.</p>
              </div>
            </div>
          ) : loadingData ? (
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="mx-auto max-w-4xl">
              {active === 'ringkasan' && <RingkasanSection metric={metric} portfolio={portfolio} />}
              {active === 'perbandingan' && (
                <PerbandinganSection
                  months={availableMonths}
                  periodA={periodA} periodB={periodB}
                  setPeriodA={setPeriodA} setPeriodB={setPeriodB}
                  rowA={rowA} rowB={rowB}
                  projByMonth={projByMonth}
                />
              )}
              {active === 'update' && (
                <section className="space-y-3">
                  <SectionTitle>Update Mingguan</SectionTitle>
                  <p className="text-sm text-muted-foreground">Ringkas perkembangan operasional sejak rapat terakhir.</p>
                  <Textarea value={weeklyUpdate} onChange={e => setWeeklyUpdate(e.target.value)} rows={10} placeholder="Tulis update mingguan…" />
                </section>
              )}
              {active === 'catatan' && (
                <CatatanSection
                  notes={notes} actions={actions}
                  noteDraft={noteDraft} setNoteDraft={setNoteDraft} addNote={addNote}
                  removeNote={id => setNotes(n => n.filter(x => x.id !== id))}
                  actionDraft={actionDraft} setActionDraft={setActionDraft}
                  actionAssignee={actionAssignee} setActionAssignee={setActionAssignee} addAction={addAction}
                  toggleAction={id => setActions(a => a.map(x => x.id === id ? { ...x, done: !x.done } : x))}
                  removeAction={id => setActions(a => a.filter(x => x.id !== id))}
                />
              )}
              {active === 'kesimpulan' && (
                <section className="space-y-3">
                  <SectionTitle>Kesimpulan</SectionTitle>
                  <p className="text-sm text-muted-foreground">Notulen otomatis dari sesi rapat ini.</p>
                  <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm">{summaryText}</pre>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={copySummary}><Copy className="mr-1 h-4 w-4" />Salin Notulen</Button>
                    <Button onClick={commit} disabled={committing}><Save className="mr-1 h-4 w-4" />{committing ? 'Menyimpan…' : 'Simpan ke Catatan Portofolio'}</Button>
                  </div>
                </section>
              )}

              {/* Section footer nav */}
              <div className="mt-8 flex justify-end border-t pt-4">
                {(() => {
                  const idx = SECTIONS.findIndex(s => s.id === active)
                  const next = SECTIONS[idx + 1]
                  return next ? (
                    <Button variant="outline" onClick={() => goto(next.id)}>
                      {next.label}<ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : null
                })()}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold">{children}</h2>
}

function RingkasanSection({ metric, portfolio }: { metric: PortfolioMetric | null; portfolio: Portfolio | null }) {
  if (!portfolio) return null
  const kpis = [
    { label: `Revenue (${metric?.latestPeriod ? formatPeriod(metric.latestPeriod) : '—'})`, value: formatCurrencyCompact(metric?.revenue ?? 0), icon: DollarSign },
    { label: 'Net Profit', value: formatCurrencyCompact(metric?.netProfit ?? 0), icon: TrendingUp },
    { label: 'Bagi Hasil', value: formatCurrencyCompact(metric?.bagiHasil ?? 0), icon: Wallet },
    { label: 'Yield Tahunan', value: formatPercent(metric?.annualizedYield ?? 0), icon: Percent },
  ]
  return (
    <section className="space-y-4">
      <SectionTitle>Ringkasan Kinerja — {brandOf(portfolio)}</SectionTitle>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status kesehatan:</span>
        <HealthBadge
          level={portfolio.healthLevel}
          reasons={portfolio.healthReasons}
          computedAt={portfolio.healthComputedAt ?? null}
          size="md"
        />
        <span className="text-muted-foreground">{HEALTH_LABELS[portfolio.healthLevel ?? 'sehat']}</span>
      </div>
      {!metric?.hasData ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Belum ada data finansial untuk portofolio ini.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-[#38a169]" />
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{value}</div></CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

type MonthRow = PortfolioMetric['monthly'][number]

function PerbandinganSection({
  months, periodA, periodB, setPeriodA, setPeriodB, rowA, rowB, projByMonth,
}: {
  months: string[]
  periodA: string; periodB: string
  setPeriodA: (p: string) => void; setPeriodB: (p: string) => void
  rowA?: MonthRow; rowB?: MonthRow
  projByMonth: { revProj: Map<string, number>; netProj: Map<string, number> }
}) {
  const metrics: { label: string; a: number; b: number; fmt: (n: number) => string; projB?: number }[] = [
    { label: 'Revenue', a: rowA?.revenue ?? 0, b: rowB?.revenue ?? 0, fmt: formatCurrencyExact, projB: projByMonth.revProj.get(periodB) },
    { label: 'Net Profit', a: rowA?.netProfit ?? 0, b: rowB?.netProfit ?? 0, fmt: formatCurrencyExact, projB: projByMonth.netProj.get(periodB) },
    { label: 'Bagi Hasil', a: rowA?.bagiHasil ?? 0, b: rowB?.bagiHasil ?? 0, fmt: formatCurrencyExact },
    { label: 'Yield Bulanan', a: rowA?.monthlyYield ?? 0, b: rowB?.monthlyYield ?? 0, fmt: formatPercent },
    { label: 'Yield Tahunan', a: rowA?.annualizedYield ?? 0, b: rowB?.annualizedYield ?? 0, fmt: formatPercent },
  ]
  return (
    <section className="space-y-4">
      <SectionTitle>Perbandingan Periode</SectionTitle>
      <div className="flex items-center gap-2">
        <Select value={periodA} onValueChange={setPeriodA}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Periode A" /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{formatPeriod(m)}</SelectItem>)}</SelectContent>
        </Select>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Select value={periodB} onValueChange={setPeriodB}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Periode B" /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{formatPeriod(m)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Metrik</TableHead>
              <TableHead className="text-right">{periodA ? formatPeriod(periodA) : 'A'}</TableHead>
              <TableHead className="text-right">{periodB ? formatPeriod(periodB) : 'B'}</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead className="text-right">B vs Proyeksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map(m => {
              const delta = m.b - m.a
              const up = delta >= 0
              const vsProj = m.projB != null && m.projB !== 0 ? m.b - m.projB : null
              return (
                <TableRow key={m.label}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-right">{m.fmt(m.a)}</TableCell>
                  <TableCell className="text-right">{m.fmt(m.b)}</TableCell>
                  <TableCell className={`text-right ${up ? 'text-emerald-600' : 'text-red-600'}`}>
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{m.fmt(Math.abs(delta))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {vsProj == null ? '—' : (
                      <span className={vsProj >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {vsProj >= 0 ? '+' : '−'}{m.fmt(Math.abs(vsProj))}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">Δ = B − A. Kolom terakhir membandingkan aktual periode B terhadap proyeksinya.</p>
    </section>
  )
}

function CatatanSection({
  notes, actions, noteDraft, setNoteDraft, addNote, removeNote,
  actionDraft, setActionDraft, actionAssignee, setActionAssignee, addAction, toggleAction, removeAction,
}: {
  notes: LiveNote[]; actions: LiveAction[]
  noteDraft: string; setNoteDraft: (s: string) => void; addNote: () => void; removeNote: (id: string) => void
  actionDraft: string; setActionDraft: (s: string) => void
  actionAssignee: string; setActionAssignee: (s: string) => void; addAction: () => void
  toggleAction: (id: string) => void; removeAction: (id: string) => void
}) {
  return (
    <section className="space-y-6">
      <SectionTitle>Catatan & Action Items</SectionTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Catatan Langsung</Label>
          <div className="flex gap-2">
            <Input
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote() } }}
              placeholder="Catat poin diskusi…"
            />
            <Button size="icon" onClick={addNote}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1.5">
            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Belum ada catatan.</p>
            ) : notes.map(n => (
              <div key={n.id} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                <span className="flex-1">{n.text}</span>
                <Button variant="ghost" size="icon" onClick={() => removeNote(n.id)} className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm font-medium"><ListChecks className="h-4 w-4" />Action Items</Label>
          <div className="space-y-2">
            <Input value={actionDraft} onChange={e => setActionDraft(e.target.value)} placeholder="Tindakan yang perlu dilakukan…" />
            <div className="flex gap-2">
              <Input value={actionAssignee} onChange={e => setActionAssignee(e.target.value)} placeholder="Penanggung jawab (opsional)" />
              <Button size="icon" onClick={addAction}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {actions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Belum ada action item.</p>
            ) : actions.map(a => (
              <div key={a.id} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} className="mt-0.5 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <p className={a.done ? 'line-through text-muted-foreground' : ''}>{a.text}</p>
                  {a.assignee && <p className="text-xs text-muted-foreground">@{a.assignee}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeAction(a.id)} className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
