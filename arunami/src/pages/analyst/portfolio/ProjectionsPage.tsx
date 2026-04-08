import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { extractProjectionMonthly } from '@/lib/gemini'
import { getReports, saveReport, updateReport, deleteReport, syncFinancialData } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyExact } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Upload, Loader2, Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { ProjectionReviewTable } from '@/components/ProjectionReviewTable'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { formatPeriod, normalizePeriod } from '@/lib/dateUtils'
import type { ProjectionExtractedData, ProjectionUploadPending, OpexItem, PortfolioReport, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

type Mode = 'idle' | 'extracting'

export default function ProjectionsPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [reports, setReports] = useState<PortfolioReport[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReport, setEditingReport] = useState<PortfolioReport | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [pendingProjection, setPendingProjection] = useState<ProjectionUploadPending | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const { register, handleSubmit, reset, setValue, watch } = useForm<ProjectionExtractedData>({
    defaultValues: {
      period: '', projectedRevenue: 0, projectedCogsPercent: 0, projectedCogs: 0,
      projectedGrossProfit: 0, projectedOpex: [], projectedTotalOpex: 0,
      projectedNetProfit: 0, assumptions: '',
    },
  })

  const [opexItems, setOpexItems] = useState<OpexItem[]>([])
  const watchedRevenue = watch('projectedRevenue')
  const watchedCogsPercent = watch('projectedCogsPercent')

  // Auto-calculate derived fields whenever revenue, COGS%, or opex items change
  useEffect(() => {
    const revenue = Number(watchedRevenue) || 0
    const cogsPercent = Number(watchedCogsPercent) || 0
    const cogs = Math.round(revenue * cogsPercent / 100)
    const grossProfit = revenue - cogs
    const totalOpex = opexItems.reduce((sum, item) => sum + (item.amount || 0), 0)
    const netProfit = grossProfit - totalOpex

    setValue('projectedCogs', cogs)
    setValue('projectedGrossProfit', grossProfit)
    setValue('projectedTotalOpex', totalOpex)
    setValue('projectedNetProfit', netProfit)
  }, [watchedRevenue, watchedCogsPercent, opexItems, setValue])

  const fetchReports = async () => {
    if (!portfolioId) return
    const data = await getReports(portfolioId, 'projection')
    setReports(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
  }

  useEffect(() => { fetchReports() }, [portfolioId])

  const openManualInput = () => {
    setEditingReport(null)
    reset({
      period: '', projectedRevenue: 0, projectedCogsPercent: 0, projectedCogs: 0,
      projectedGrossProfit: 0, projectedOpex: [], projectedTotalOpex: 0,
      projectedNetProfit: 0, assumptions: '',
    })
    setOpexItems([])
    setDialogOpen(true)
  }

  const openEdit = (report: PortfolioReport) => {
    setEditingReport(report)
    const d = report.extractedData as ProjectionExtractedData
    // Backward compat: derive cogsPercent if not stored
    const cogsPercent = d.projectedCogsPercent ?? (d.projectedRevenue ? (d.projectedCogs / d.projectedRevenue) * 100 : 0)
    reset({ ...d, projectedCogsPercent: Math.round(cogsPercent * 10) / 10 })
    // Restore opex percentages from stored data or derive from revenue
    const opex = (d.projectedOpex ?? []).map(item => ({
      ...item,
      percentage: item.percentage ?? (d.projectedRevenue ? Math.round((item.amount / d.projectedRevenue) * 1000) / 10 : 0),
    }))
    setOpexItems(opex)
    setDialogOpen(true)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File maksimal 10MB'); return }
    setMode('extracting')
    try {
      const data = await extractProjectionMonthly(file)
      setPendingProjection(data)
      toast.success('Data proyeksi berhasil diekstrak — silakan review sebelum konfirmasi')
    } catch {
      toast.error('Gagal mengekstrak data')
    } finally {
      setMode('idle')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleConfirmProjection = async () => {
    if (!portfolioId || !user || !pendingProjection) return
    setIsConfirming(true)
    try {
      // Save each month as an individual projection report
      for (const month of pendingProjection.monthlyData) {
        const normalizedPeriod = normalizePeriod(month.month)
        const extractedData: ProjectionExtractedData = {
          period: normalizedPeriod,
          projectedRevenue: month.projectedRevenue,
          projectedCogsPercent: pendingProjection.cogsPercent,
          projectedCogs: month.projectedCogs,
          projectedGrossProfit: month.projectedGrossProfit,
          projectedOpex: month.opexBreakdown,
          projectedTotalOpex: month.totalOpex,
          projectedNetProfit: month.projectedNetProfit,
          assumptions: pendingProjection.assumptions,
        }
        await saveReport(portfolioId, {
          type: 'projection',
          fileName: fileRef.current?.files?.[0]?.name ?? 'Upload Proyeksi Bulanan',
          fileUrl: '',
          period: normalizedPeriod,
          extractedData,
          uploadedBy: user.uid,
        })
      }
      await syncFinancialData(portfolioId)
      setPendingProjection(null)
      fetchReports()
      toast.success(`${pendingProjection.monthlyData.length} bulan proyeksi berhasil disimpan`)
    } catch {
      toast.error('Gagal menyimpan proyeksi')
    } finally {
      setIsConfirming(false)
    }
  }

  const onSave = async (data: ProjectionExtractedData) => {
    if (!portfolioId || !user) return
    setIsSaving(true)
    const extractedData: ProjectionExtractedData = { ...data, projectedOpex: opexItems }
    try {
      if (editingReport) {
        await updateReport(portfolioId, editingReport.id, {
          period: extractedData.period,
          extractedData,
        })
        toast.success('Proyeksi berhasil diperbarui')
      } else {
        await saveReport(portfolioId, {
          type: 'projection',
          fileName: fileRef.current?.files?.[0]?.name ?? 'Input Manual',
          fileUrl: '',
          period: extractedData.period,
          extractedData,
          uploadedBy: user.uid,
        })
        toast.success('Proyeksi berhasil disimpan')
      }
      await syncFinancialData(portfolioId)
      setDialogOpen(false)
      reset()
      setOpexItems([])
      setEditingReport(null)
      fetchReports()
    } catch {
      toast.error('Gagal menyimpan proyeksi')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!portfolioId) return
    setDeleteId(id)
    try {
      await deleteReport(portfolioId, id)
      await syncFinancialData(portfolioId)
      toast.success('Proyeksi berhasil dihapus')
      fetchReports()
    } catch {
      toast.error('Gagal menghapus proyeksi')
    } finally {
      setDeleteId(null)
    }
  }

  const addOpexItem = () => setOpexItems(prev => [...prev, { name: '', amount: 0, percentage: 0 }])
  const removeOpexItem = (i: number) => setOpexItems(prev => prev.filter((_, idx) => idx !== i))
  const updateOpexItem = (i: number, field: keyof OpexItem, val: string | number) => {
    setOpexItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      if (field === 'percentage') {
        const pct = Number(val) || 0
        const revenue = Number(watchedRevenue) || 0
        return { ...item, percentage: pct, amount: Math.round(revenue * pct / 100) }
      }
      return { ...item, [field]: val }
    }))
  }

  // Recalculate opex amounts when revenue changes
  useEffect(() => {
    const revenue = Number(watchedRevenue) || 0
    setOpexItems(prev => prev.map(item => ({
      ...item,
      amount: Math.round(revenue * (item.percentage || 0) / 100),
    })))
  }, [watchedRevenue])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Proyeksi Plan</h2>
        <Button onClick={openManualInput} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Input Manual
        </Button>
      </div>

      {/* Upload area */}
      <Card>
        <CardContent className="pt-6">
          {mode === 'idle' ? (
            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-10 cursor-pointer hover:border-[#38a169] hover:bg-[#38a169]/5 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Upload file untuk ekstrak otomatis dengan AI</p>
                <p className="text-sm text-muted-foreground mt-1">PDF, Excel (.xlsx), atau CSV — maks. 10MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-10 w-10 animate-spin text-[#38a169]" />
              <p className="font-medium">Menganalisis dokumen proyeksi...</p>
              <p className="text-sm text-muted-foreground">Proses ini mungkin memakan 10–30 detik</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analyst Review Table */}
      {pendingProjection && (
        <Card>
          <CardContent className="pt-6">
            <ProjectionReviewTable
              data={pendingProjection}
              onConfirm={handleConfirmProjection}
              onCancel={() => setPendingProjection(null)}
              isConfirming={isConfirming}
            />
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Proyeksi ({reports.length})</CardTitle></CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            portfolio?.isGracePeriod ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">Grace Period</p>
                    <p className="text-sm text-amber-700">
                      Dokumen proyeksi belum diperlukan selama masa grace period. Upload proyeksi setelah grace period berakhir.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada dokumen proyeksi</p>
            )
          ) : (
            <div className="divide-y">
              {reports.map(r => {
                const d = r.extractedData as ProjectionExtractedData
                return (
                  <div key={r.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{formatPeriod(r.period)}</p>
                      <p className="text-xs text-muted-foreground">{r.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Proyeksi: {formatCurrencyExact(d.projectedNetProfit)}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deleteId === r.id}
                        onClick={() => handleDelete(r.id)}
                      >
                        {deleteId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReport ? 'Edit Proyeksi' : 'Input Proyeksi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSave)} className="space-y-5">
            {/* Period & Revenue */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Periode</Label>
                <MonthYearPicker value={watch('period')} onChange={(v) => setValue('period', v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Projected Revenue (IDR)</Label>
                <Input {...register('projectedRevenue', { valueAsNumber: true })} type="number" className="text-sm" />
              </div>
            </div>

            {/* COGS as % of Revenue */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold">COGS</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">% of Revenue</Label>
                  <div className="relative">
                    <Input
                      {...register('projectedCogsPercent', { valueAsNumber: true })}
                      type="number" step="0.1" min="0" max="100"
                      className="text-sm pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nilai COGS (IDR)</Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                    {formatCurrencyExact(watch('projectedCogs'))}
                  </div>
                </div>
              </div>
            </div>

            {/* Gross Profit (auto) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Gross Profit (IDR)</Label>
                <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                  {formatCurrencyExact(watch('projectedGrossProfit'))}
                </div>
              </div>
            </div>

            {/* Opex Items as % of Revenue */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Detail Projected Opex</h4>
                <Button type="button" variant="outline" size="sm" onClick={addOpexItem}>
                  <Plus className="h-3 w-3 mr-1" /> Tambah
                </Button>
              </div>
              {opexItems.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_100px_140px_32px] gap-2 text-xs text-muted-foreground px-1">
                    <span>Nama</span><span>% Revenue</span><span>Nilai (IDR)</span><span />
                  </div>
                  {opexItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_100px_140px_32px] gap-2 items-center">
                      <Input
                        placeholder="Nama opex"
                        value={item.name}
                        onChange={e => updateOpexItem(i, 'name', e.target.value)}
                        className="text-sm"
                      />
                      <div className="relative">
                        <Input
                          type="number" step="0.1" min="0" max="100"
                          value={item.percentage ?? 0}
                          onChange={e => updateOpexItem(i, 'percentage', Number(e.target.value))}
                          className="text-sm pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      <div className="h-9 flex items-center px-3 rounded-md bg-muted text-xs font-medium truncate">
                        {formatCurrencyExact(item.amount)}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeOpexItem(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t text-sm">
                <span className="font-medium">Total Opex</span>
                <span className="font-semibold">{formatCurrencyExact(watch('projectedTotalOpex'))}</span>
              </div>
            </div>

            {/* Net Profit (auto) */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Projected Net Profit</span>
                <span className={`text-lg font-bold ${watch('projectedNetProfit') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrencyExact(watch('projectedNetProfit'))}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Asumsi</Label>
              <Textarea {...register('assumptions')} className="text-sm" rows={3} />
            </div>

            <div className="flex gap-3 pt-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Menyimpan...' : editingReport ? 'Perbarui' : 'Simpan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
