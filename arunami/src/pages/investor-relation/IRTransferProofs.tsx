import { useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  getAllUsers, getAllAllocations, getPublishedInvestorReports,
  createInvestorTransferProof, getTransferProofsForReport,
  deleteInvestorTransferProof, getAllTransferProofs, getAllPortfolios,
  getPortfolioConfigOrDefault,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { comparePeriods, formatPeriod } from '@/lib/dateUtils'
import { ALL_TIME_PERIOD } from '@/types'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Search, ArrowLeft, ChevronRight, Upload, FileImage, X, Trash2, Bell, CheckCircle2, Wallet,
} from 'lucide-react'
import type {
  AppUser, InvestorAllocation, InvestorReportDoc, InvestorTransferProof,
} from '@/types'

type View = 'home' | 'investor'

const proofSchema = z.object({
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  notes: z.string().max(280, 'Catatan maksimal 280 karakter').optional().or(z.literal('')),
})
type ProofForm = z.infer<typeof proofSchema>

const ALLOWED_TYPES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] }
const MAX_BYTES = 5 * 1024 * 1024

function periodLabel(r: InvestorReportDoc): string {
  if (r.period === ALL_TIME_PERIOD) return 'All-Time'
  return formatPeriod(r.period)
}

export default function IRTransferProofs() {
  const { user } = useAuthStore()
  const [view, setView] = useState<View>('home')
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<{
    user: AppUser; allocations: InvestorAllocation[]; totalInvested: number
    totalBagiHasil: number; payoutCount: number
  }[]>([])
  const [loading, setLoading] = useState(true)

  const [investor, setInvestor] = useState<AppUser | null>(null)
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [proofsByReport, setProofsByReport] = useState<Record<string, InvestorTransferProof[]>>({})
  const [investorLoading, setInvestorLoading] = useState(false)

  const [uploadTarget, setUploadTarget] = useState<InvestorReportDoc | null>(null)
  // Portfolio-scoped grace reports with no payout ('none') are informational —
  // there's no money transfer to prove, so the proof action is disabled for them.
  const [graceNoPayoutPortfolios, setGraceNoPayoutPortfolios] = useState<Set<string>>(new Set())

  useEffect(() => {
    ;(async () => {
      const [users, allocations, proofs, portfolios] = await Promise.all([
        getAllUsers(), getAllAllocations(), getAllTransferProofs(), getAllPortfolios(),
      ])
      setGraceNoPayoutPortfolios(new Set(
        portfolios
          .filter(p => p.isGracePeriod && (p.graceConfig?.returnMode ?? 'none') === 'none')
          .map(p => p.id),
      ))
      const investors = users.filter(u => u.role === 'investor')
      const byInvestor = new Map<string, InvestorAllocation[]>()
      for (const a of allocations) {
        const arr = byInvestor.get(a.investorUid) ?? []
        arr.push(a); byInvestor.set(a.investorUid, arr)
      }
      // Sum every payout proof per investor → their total bagi hasil received.
      const paidByInvestor = new Map<string, { total: number; count: number }>()
      for (const p of proofs) {
        const cur = paidByInvestor.get(p.investorUid) ?? { total: 0, count: 0 }
        cur.total += p.amount; cur.count += 1
        paidByInvestor.set(p.investorUid, cur)
      }
      setRows(investors.map(user => {
        const allocs = byInvestor.get(user.uid) ?? []
        const paid = paidByInvestor.get(user.uid) ?? { total: 0, count: 0 }
        return {
          user, allocations: allocs,
          totalInvested: allocs.reduce((s, a) => s + a.investedAmount, 0),
          totalBagiHasil: paid.total, payoutCount: paid.count,
        }
      }))
      setLoading(false)
    })()
  }, [])

  const loadInvestor = async (u: AppUser) => {
    setInvestor(u); setView('investor'); setInvestorLoading(true)
    try {
      const published = await getPublishedInvestorReports(u.uid)
      const sorted = published.sort((a, b) => comparePeriods(b.period, a.period))
      setReports(sorted)
      const proofs: Record<string, InvestorTransferProof[]> = {}
      await Promise.all(sorted.map(async r => { proofs[r.id] = await getTransferProofsForReport(r.id) }))
      setProofsByReport(proofs)
    } catch { toast.error('Gagal memuat data investor') }
    finally { setInvestorLoading(false) }
  }

  const refreshProofsFor = async (reportId: string) => {
    const proofs = await getTransferProofsForReport(reportId)
    setProofsByReport(prev => ({ ...prev, [reportId]: proofs }))
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return r.user.displayName.toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q)
  })

  // Org-wide recap for the investor list view.
  const grandTotalBagiHasil = useMemo(() => rows.reduce((s, r) => s + r.totalBagiHasil, 0), [rows])
  const totalProofsCount = useMemo(() => rows.reduce((s, r) => s + r.payoutCount, 0), [rows])
  const paidInvestorCount = useMemo(() => rows.filter(r => r.totalBagiHasil > 0).length, [rows])

  // Per-investor recap for the detail view.
  const detailProofs = useMemo(() => Object.values(proofsByReport).flat(), [proofsByReport])
  const detailTotalBagiHasil = detailProofs.reduce((s, p) => s + p.amount, 0)
  const detailInvested = rows.find(r => r.user.uid === investor?.uid)?.totalInvested ?? 0

  if (view === 'home') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bukti Transfer</h1>
            <p className="text-muted-foreground">Kirim bukti pembayaran & notifikasi ke investor</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari investor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Total bagi hasil recap — disbursed across all investors. */}
        {!loading && rows.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Total Bagi Hasil Tersalurkan', formatCurrencyExact(grandTotalBagiHasil)],
              ['Investor Dibayar', `${paidInvestorCount} / ${rows.length}`],
              ['Total Bukti Transfer', `${totalProofsCount}`],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Daftar Investor ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? 'Tidak ada investor yang cocok' : 'Belum ada investor'}
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
<tr>
                      <th className="text-left py-2.5 px-3 font-medium">Investor</th>
                      <th className="text-left py-2.5 px-3 font-medium">Portofolio Aktif</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total Investasi</th>
                      <th className="text-right py-2.5 px-3 font-medium">Total Bagi Hasil</th>
                      <th className="text-right py-2.5 px-3 font-medium w-32">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(r => (
                      <tr key={r.user.uid} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] font-bold text-sm shrink-0">
                              {r.user.displayName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{r.user.displayName}</p>
                              <p className="text-xs text-muted-foreground truncate">{r.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {r.allocations.length === 0 ? <span className="text-muted-foreground">—</span> : (
                            <div className="flex flex-wrap gap-1">
                              {r.allocations.map(a => <Badge key={a.id} variant="outline" className="text-xs">{a.portfolioCode}</Badge>)}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatCurrencyCompact(r.totalInvested)}</td>
                        <td className="py-2.5 px-3 text-right">
                          {r.totalBagiHasil > 0 ? (
                            <>
                              <span className="font-medium text-[#1e5f3f]">{formatCurrencyCompact(r.totalBagiHasil)}</span>
                              <span className="block text-[11px] text-muted-foreground">{r.payoutCount}× transfer</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => loadInvestor(r.user)}>
                            Pilih<ChevronRight className="ml-1 h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!investor) return null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => { setView('home'); setInvestor(null) }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{investor.displayName}</h1>
            {investor.isArunamiTeam && <Badge variant="outline" className="border-green-600 text-green-700">Tim Arunami</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{investor.email}</p>
        </div>
      </div>

      {/* Total bagi hasil recap — sent to this investor. */}
      <Card className="border-0 bg-[#1e5f3f] text-white">
        <CardContent className="py-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-white/80">Total Bagi Hasil Dikirim</p>
                <p className="text-2xl font-bold tracking-tight">
                  {investorLoading ? '…' : formatCurrencyExact(detailTotalBagiHasil)}
                </p>
                <p className="mt-0.5 text-xs text-white/70">
                  {detailProofs.length > 0
                    ? `${detailProofs.length} bukti transfer terkirim`
                    : 'Belum ada bukti transfer'}
                </p>
              </div>
            </div>
            <div className="flex gap-6 sm:border-l sm:border-white/20 sm:pl-6">
              <div>
                <p className="text-xs text-white/70">Total Investasi</p>
                <p className="text-lg font-semibold">{formatCurrencyCompact(detailInvested)}</p>
              </div>
              {detailInvested > 0 && (
                <div>
                  <p className="text-xs text-white/70">Bagi Hasil / Investasi</p>
                  <p className="text-lg font-semibold">{formatPercent((detailTotalBagiHasil / detailInvested) * 100)}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Laporan yang Dipublikasikan ({reports.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Pilih laporan, lalu kirim bukti transfer beserta notifikasinya.</p>
        </CardHeader>
        <CardContent>
          {investorLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada laporan yang dipublikasikan untuk investor ini.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Periode</th>
                    <th className="text-left py-2.5 px-3 font-medium">Cakupan</th>
                    <th className="text-left py-2.5 px-3 font-medium">Bukti Dikirim</th>
                    <th className="text-right py-2.5 px-3 font-medium w-56">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reports.map(r => {
                    const proofs = proofsByReport[r.id] ?? []
                    const isGraceNoPayout =
                      r.scope !== 'accumulated' && r.scope !== 'all_time' &&
                      graceNoPayoutPortfolios.has(r.portfolioId)
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 align-top">
                        <td className="py-2.5 px-3 font-medium">{periodLabel(r)}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {r.scope === 'accumulated' ? 'Akumulasi' : r.scope === 'all_time' ? 'All-Time' : r.portfolioName}
                        </td>
                        <td className="py-2.5 px-3">
                          {proofs.length === 0 ? (
                            <span className="text-muted-foreground text-xs">Belum ada</span>
                          ) : (
                            <div className="space-y-1">
                              {proofs.map(p => (
                                <div key={p.id} className="flex items-center gap-2 text-xs">
                                  <FileImage className="h-3.5 w-3.5 text-[#1e5f3f]" />
                                  <a href={p.fileUrl} target="_blank" rel="noreferrer" className="text-[#1e5f3f] hover:underline truncate max-w-[12rem]">
                                    {p.fileName}
                                  </a>
                                  <span className="font-medium">{formatCurrencyCompact(p.amount)}</span>
                                  <button
                                    onClick={async () => {
                                      if (!confirm('Hapus bukti transfer ini? Notifikasi terkait juga akan dihapus.')) return
                                      try { await deleteInvestorTransferProof(p); await refreshProofsFor(r.id); toast.success('Bukti transfer dihapus') }
                                      catch { toast.error('Gagal menghapus') }
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                    title="Hapus"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isGraceNoPayout ? (
                            <span className="text-xs text-muted-foreground" title="Laporan grace period informatif — tidak ada payout">
                              Tanpa payout (grace)
                            </span>
                          ) : (
                            <Button size="sm" onClick={() => setUploadTarget(r)}>
                              <Upload className="mr-1.5 h-3.5 w-3.5" />Kirim Bukti
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {uploadTarget && investor && user && (
        <UploadProofDialog
          investor={investor}
          report={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onUploaded={async () => {
            await refreshProofsFor(uploadTarget.id)
            setUploadTarget(null)
            toast.success('Bukti transfer terkirim & notifikasi aktif')
          }}
        />
      )}
    </div>
  )
}

function UploadProofDialog({
  investor, report, onClose, onUploaded,
}: {
  investor: AppUser
  report: InvestorReportDoc
  onClose: () => void
  onUploaded: (proofId: string) => void | Promise<void>
}) {
  const { user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Portfolio-scoped reports may also return principal (pengembalian pokok).
  const isPortfolioScoped = report.scope !== 'accumulated' && report.scope !== 'all_time'
  const [returnsPrincipal, setReturnsPrincipal] = useState(false)
  const [principal, setPrincipal] = useState('')
  useEffect(() => {
    if (!isPortfolioScoped || !report.portfolioId) return
    getPortfolioConfigOrDefault(report.portfolioId)
      .then(cfg => setReturnsPrincipal(!!cfg.returnsPrincipal))
      .catch(() => setReturnsPrincipal(false))
  }, [report.portfolioId, isPortfolioScoped])
  const { register, handleSubmit, formState: { errors } } = useForm<ProofForm>({
    // zod v4's Resolver generics + react-hook-form v7 don't fully line up
    // when z.coerce is involved; cast keeps the form ergonomic.
    resolver: zodResolver(proofSchema) as never,
  })

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: ALLOWED_TYPES, maxSize: MAX_BYTES, maxFiles: 1,
    onDrop: (accepted) => {
      const f = accepted[0] ?? null
      setFile(f)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(f ? URL.createObjectURL(f) : null)
    },
  })

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const onSubmit = async (data: ProofForm) => {
    if (!file) { toast.error('Pilih file bukti transfer terlebih dahulu'); return }
    if (!user) return
    setSubmitting(true)
    try {
      const { proofId } = await createInvestorTransferProof({
        investorUid: investor.uid,
        investorName: investor.displayName,
        investorReport: report,
        amount: data.amount,
        principalAmount: returnsPrincipal && principal.trim() !== '' ? Number(principal) : null,
        notes: data.notes ?? '',
        file,
        uploadedBy: user.uid,
        uploadedByName: user.displayName,
      })
      await onUploaded(proofId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengirim bukti transfer')
    } finally { setSubmitting(false) }
  }

  const rejectionMessage = useMemo(() => {
    if (fileRejections.length === 0) return null
    const code = fileRejections[0].errors[0]?.code
    if (code === 'file-too-large') return 'Ukuran file melebihi 5 MB.'
    if (code === 'file-invalid-type') return 'Tipe file tidak didukung. Gunakan PNG, JPG, atau WEBP.'
    return 'File tidak valid.'
  }, [fileRejections])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kirim Bukti Transfer</DialogTitle>
          <DialogDescription>
            {investor.displayName} · {periodLabel(report)} · {report.scope === 'accumulated' ? 'Akumulasi' : report.scope === 'all_time' ? 'All-Time' : report.portfolioName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Nominal Transfer (Rp)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              placeholder="Contoh: 1500000"
              {...register('amount')}
            />
            {errors.amount && <p className="text-xs text-red-600">{errors.amount.message}</p>}
          </div>

          {returnsPrincipal && (
            <div className="space-y-1.5">
              <Label htmlFor="principal">Pengembalian Pokok (Rp) — opsional</Label>
              <Input
                id="principal"
                type="number"
                min="0"
                step="1"
                placeholder="Kosongkan jika tidak ada"
                value={principal}
                onChange={e => setPrincipal(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Catatan (opsional)</Label>
            <Textarea id="notes" rows={2} placeholder="Misal: Profit sharing April 2026" {...register('notes')} />
            {errors.notes && <p className="text-xs text-red-600">{errors.notes.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Screenshot Bukti</Label>
            <div
              {...getRootProps()}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
                isDragActive ? 'border-[#2563eb] bg-blue-50/40' : 'border-slate-300 hover:border-slate-400',
              )}
            >
              <input {...getInputProps()} />
              {preview ? (
                <div className="space-y-2 w-full">
                  <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-md object-contain" />
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <FileImage className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[16rem]">{file?.name}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null) }} className="text-red-500 hover:text-red-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-slate-400 mb-1" />
                  <p className="text-sm text-slate-600">Tarik & lepas atau klik untuk pilih gambar</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP · maks 5 MB</p>
                </>
              )}
            </div>
            {rejectionMessage && <p className="text-xs text-red-600">{rejectionMessage}</p>}
          </div>

          <div className="rounded-md bg-blue-50/60 border border-blue-100 p-3 text-xs text-slate-700 flex gap-2">
            <Bell className="h-4 w-4 text-[#2563eb] shrink-0 mt-0.5" />
            <span>Setelah dikirim, investor akan melihat notifikasi di dashboard-nya sampai mereka menekan tombol "Tandai Dibaca".</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Batal</Button>
            <Button type="submit" disabled={submitting || !file} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {submitting ? 'Mengirim…' : (<><CheckCircle2 className="mr-1.5 h-4 w-4" />Kirim & Notifikasi</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
