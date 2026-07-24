import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  getDistributionBatches, createDistributionBatch, updateDistributionBatchLines,
  deleteDistributionBatch, getAllPortfolios, getAllocationsForPortfolio,
  getPortfolioConfigOrDefault, getConfigTimeline, getFinancialData, getAllUsers,
} from '@/lib/firestore'
import { calculateDistribution, ownershipFraction } from '@/lib/distributionStrategies'
import { resolveInvestorConfigForPeriod } from '@/lib/configTimeline'
import {
  LINE_STATUS_LABELS, LINE_STATUS_CLASSES, BATCH_STATUS_LABELS, nextLineStatus,
} from '@/lib/distributionBatch'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { formatCurrencyExact } from '@/lib/utils'
import { brandOf } from '@/lib/portfolioName'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Banknote, Plus, ChevronDown, ChevronRight, Trash2, ArrowRight, Pause, Play, Loader2,
} from 'lucide-react'
import type {
  DistributionBatch, DistributionBatchLine, BatchLineStatus, Portfolio,
} from '@/types'

function LineStatusPill({ status }: { status: BatchLineStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', LINE_STATUS_CLASSES[status])}>
      {LINE_STATUS_LABELS[status]}
    </span>
  )
}

export default function AdminDistributions() {
  const [batches, setBatches] = useState<DistributionBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busyBatch, setBusyBatch] = useState<string | null>(null)

  const load = () => {
    getDistributionBatches()
      .then(setBatches)
      .catch(err => { console.error(err); toast.error('Gagal memuat batch') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const mutateLine = async (batch: DistributionBatch, index: number, next: DistributionBatchLine) => {
    setBusyBatch(batch.id)
    const lines = batch.lines.map((l, i) => (i === index ? next : l))
    try {
      await updateDistributionBatchLines(batch.id, lines)
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, lines, totalNet: lines.reduce((s, l) => s + l.netAmount, 0) } : b))
    } catch { toast.error('Gagal memperbarui baris') }
    finally { setBusyBatch(null) }
  }

  const advance = (batch: DistributionBatch, index: number) => {
    const line = batch.lines[index]
    const ns = nextLineStatus(line.status)
    if (!ns) return
    mutateLine(batch, index, { ...line, status: ns })
  }
  const hold = (batch: DistributionBatch, index: number) => {
    const reason = prompt('Alasan penahanan (Ditahan):') ?? ''
    const line = batch.lines[index]
    mutateLine(batch, index, { ...line, status: 'held', heldReason: reason.trim() || undefined })
  }
  const release = (batch: DistributionBatch, index: number) => {
    const line = batch.lines[index]
    mutateLine(batch, index, { ...line, status: 'pending', heldReason: undefined })
  }

  const remove = async (batch: DistributionBatch) => {
    if (!confirm(`Hapus batch ${batch.portfolioName} · ${formatPeriod(batch.period)}?`)) return
    try { await deleteDistributionBatch(batch.id); toast.success('Batch dihapus'); load() }
    catch { toast.error('Gagal menghapus batch') }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Banknote className="h-6 w-6 text-[#38a169]" />
            Batch Distribusi
          </h1>
          <p className="text-muted-foreground">Proses pembagian bagi hasil per periode: Perlu diproses → Dilaporkan → Diteruskan</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Buat Batch</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : batches.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Belum ada batch distribusi.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {batches.map(batch => {
            const isOpen = expanded === batch.id
            return (
              <Card key={batch.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : batch.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{batch.portfolioName}</span>
                      <span className="text-sm text-muted-foreground">{formatPeriod(batch.period)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{BATCH_STATUS_LABELS[batch.status]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {batch.lines.length} investor · {batch.returnModelLabel} · Total {formatCurrencyExact(batch.totalNet)}
                    </p>
                  </div>
                  {busyBatch === batch.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="border-t">
                    <div className="overflow-x-auto">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="px-3 py-2 text-left font-medium">Investor</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">Kepemilikan</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">Bruto</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">Fee</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">Netto</TableHead>
                            <TableHead className="px-3 py-2 text-center font-medium">Status</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y">
                          {batch.lines.map((line, i) => {
                            const ns = nextLineStatus(line.status)
                            return (
                              <TableRow key={line.investorUid} className="hover:bg-muted/30">
                                <TableCell className="px-3 py-2">
                                  <div className="font-medium">{line.investorName}</div>
                                  {line.status === 'held' && line.heldReason && (
                                    <div className="text-xs text-red-600">Ditahan: {line.heldReason}</div>
                                  )}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right text-muted-foreground">{line.ownershipPercent.toFixed(2)}%</TableCell>
                                <TableCell className="px-3 py-2 text-right">{formatCurrencyExact(line.grossAmount)}</TableCell>
                                <TableCell className="px-3 py-2 text-right text-muted-foreground">{formatCurrencyExact(line.feeAmount)}</TableCell>
                                <TableCell className="px-3 py-2 text-right font-medium">{formatCurrencyExact(line.netAmount)}</TableCell>
                                <TableCell className="px-3 py-2 text-center"><LineStatusPill status={line.status} /></TableCell>
                                <TableCell className="px-3 py-2">
                                  <div className="flex justify-end gap-1">
                                    {ns && (
                                      <Button size="sm" variant="outline" disabled={busyBatch === batch.id} onClick={() => advance(batch, i)}>
                                        {LINE_STATUS_LABELS[ns]}<ArrowRight className="ml-1 h-3 w-3" />
                                      </Button>
                                    )}
                                    {line.status === 'held' ? (
                                      <Button size="icon" variant="ghost" title="Lepas penahanan" disabled={busyBatch === batch.id} onClick={() => release(batch, i)}>
                                        <Play className="h-4 w-4" />
                                      </Button>
                                    ) : line.status !== 'forwarded' && (
                                      <Button size="icon" variant="ghost" title="Tahan" className="text-red-600 hover:bg-red-50" disabled={busyBatch === batch.id} onClick={() => hold(batch, i)}>
                                        <Pause className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end p-3">
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(batch)}>
                        <Trash2 className="mr-1 h-4 w-4" />Hapus Batch
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {createOpen && (
        <CreateBatchDialog
          existing={batches}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load() }}
        />
      )}
    </div>
  )
}

interface PreviewState {
  lines: DistributionBatchLine[]
  driverAmount: number
  returnModelLabel: string
  periods: string[]
}

function CreateBatchDialog({
  existing, onClose, onSaved,
}: {
  existing: DistributionBatch[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioId, setPortfolioId] = useState('')
  const [period, setPeriod] = useState('')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { getAllPortfolios().then(setPortfolios).catch(() => {}) }, [])

  const selectedPortfolio = portfolios.find(p => p.id === portfolioId)

  // Load the portfolio's reported periods when it changes.
  useEffect(() => {
    setPeriod(''); setPreview(null); setAvailablePeriods([])
    if (!portfolioId) return
    ;(async () => {
      const fd = await getFinancialData(portfolioId)
      const periods = (fd?.profitData ?? [])
        .filter(p => p.aktual !== 0)
        .map(p => p.month)
        .sort((a, b) => comparePeriods(b, a))
      setAvailablePeriods(periods)
    })()
  }, [portfolioId])

  const computePreview = async () => {
    if (!selectedPortfolio || !period) return
    setLoadingPreview(true)
    try {
      const [allocations, config, timeline, fd, users] = await Promise.all([
        getAllocationsForPortfolio(portfolioId),
        getPortfolioConfigOrDefault(portfolioId),
        getConfigTimeline(portfolioId),
        getFinancialData(portfolioId),
        getAllUsers(),
      ])
      const teamUids = new Set(users.filter(u => u.isArunamiTeam).map(u => u.uid))
      // Distribute on the terms that applied to the chosen period.
      const periodConfig = resolveInvestorConfigForPeriod(config, timeline, period)
      const profit = fd?.profitData.find(p => p.month === period)
      const revenue = fd?.revenueData.find(r => r.month === period)?.aktual ?? 0
      const netProfit = profit?.aktual ?? 0

      let label = ''
      const lines: DistributionBatchLine[] = allocations.map(alloc => {
        const result = calculateDistribution({
          reportData: { period, revenue, netProfit, grossProfit: 0 },
          config: periodConfig,
          allocation: alloc,
          portfolio: selectedPortfolio,
          isArunamiTeam: teamUids.has(alloc.investorUid),
        })
        label = result.label
        return {
          investorUid: alloc.investorUid,
          investorName: alloc.investorName,
          ownershipPercent: ownershipFraction(alloc, selectedPortfolio) * 100,
          grossAmount: result.grossInvestorAmount,
          feeAmount: result.arunamiFeeAmount,
          netAmount: result.perInvestorAmount,
          status: 'pending' as BatchLineStatus,
        }
      })
      setPreview({ lines, driverAmount: netProfit, returnModelLabel: label, periods: availablePeriods })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghitung')
    } finally {
      setLoadingPreview(false)
    }
  }

  const duplicate = useMemo(
    () => existing.some(b => b.portfolioId === portfolioId && b.period === period),
    [existing, portfolioId, period],
  )

  const save = async () => {
    if (!selectedPortfolio || !period || !preview) return
    if (preview.lines.length === 0) { toast.error('Tidak ada investor untuk diproses.'); return }
    setSaving(true)
    try {
      await createDistributionBatch({
        portfolioId, portfolioName: brandOf(selectedPortfolio), period,
        returnModelLabel: preview.returnModelLabel, driverAmount: preview.driverAmount,
        lines: preview.lines,
        createdBy: user?.uid ?? '', createdByName: user?.displayName ?? 'Admin',
      })
      toast.success('Batch dibuat')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat batch')
      setSaving(false)
    }
  }

  const totalNet = preview?.lines.reduce((s, l) => s + l.netAmount, 0) ?? 0

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Batch Distribusi</DialogTitle>
          <DialogDescription>Hitung bagi hasil per investor dari data PnL bulan terpilih.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Portofolio</Label>
              <Select value={portfolioId} onValueChange={setPortfolioId}>
                <SelectTrigger><SelectValue placeholder="Pilih portofolio" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map(p => <SelectItem key={p.id} value={p.id}>{brandOf(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Periode</Label>
              <Select value={period} onValueChange={setPeriod} disabled={!portfolioId}>
                <SelectTrigger><SelectValue placeholder={availablePeriods.length ? 'Pilih periode' : 'Tidak ada data PnL'} /></SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(p => <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {period && !preview && (
            <Button variant="outline" className="w-full" disabled={loadingPreview} onClick={computePreview}>
              {loadingPreview ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Hitung Pratinjau
            </Button>
          )}

          {duplicate && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">Batch untuk periode ini sudah ada.</p>
          )}

          {preview && (
            <div className="rounded-lg border">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">
                {preview.returnModelLabel} · Netto total {formatCurrencyExact(totalNet)}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Table className="text-sm">
                  <TableBody className="divide-y">
                    {preview.lines.length === 0 ? (
                      <TableRow><TableCell className="px-3 py-4 text-center text-muted-foreground">Tidak ada investor pada portofolio ini.</TableCell></TableRow>
                    ) : preview.lines.map(l => (
                      <TableRow key={l.investorUid}>
                        <TableCell className="px-3 py-2">{l.investorName}</TableCell>
                        <TableCell className="px-3 py-2 text-right text-muted-foreground">{l.ownershipPercent.toFixed(2)}%</TableCell>
                        <TableCell className="px-3 py-2 text-right font-medium">{formatCurrencyExact(l.netAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button>
          <Button disabled={saving || !preview || duplicate || (preview?.lines.length ?? 0) === 0} onClick={save}>
            {saving ? 'Menyimpan…' : 'Buat Batch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
