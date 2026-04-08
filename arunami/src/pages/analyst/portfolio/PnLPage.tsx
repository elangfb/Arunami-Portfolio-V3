import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { extractPnL } from '@/lib/gemini'
import { getReports, saveReport, updateReport, deleteReport, syncFinancialData, getPortfolioConfigOrDefault } from '@/lib/firestore'
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
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { formatPeriod, normalizePeriod } from '@/lib/dateUtils'
import type { PnLExtractedData, OpexItem, PortfolioReport, Portfolio, PortfolioConfig, RevenueCategory } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

type Mode = 'idle' | 'extracting'

export default function PnLPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [reports, setReports] = useState<PortfolioReport[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReport, setEditingReport] = useState<PortfolioReport | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null)
  const [categories, setCategories] = useState<RevenueCategory[]>([])

  const { register, handleSubmit, reset, setValue, watch } = useForm<PnLExtractedData>({
    defaultValues: {
      period: '', revenue: 0, cogs: 0, grossProfit: 0,
      opex: [], totalOpex: 0, operatingProfit: 0, interest: 0, taxes: 0,
      netProfit: 0, transactionCount: 0,
      unitBreakdown: {},
      notes: '',
    },
  })

  const [opexItems, setOpexItems] = useState<OpexItem[]>([])

  // Auto-calculate derived fields
  const watchedRevenue = watch('revenue')
  const watchedCogs = watch('cogs')
  const watchedInterest = watch('interest')
  const watchedTaxes = watch('taxes')

  useEffect(() => {
    const revenue = Number(watchedRevenue) || 0
    const cogs = Number(watchedCogs) || 0
    const totalOpex = opexItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const interest = Number(watchedInterest) || 0
    const taxes = Number(watchedTaxes) || 0

    const grossProfit = revenue - cogs
    const operatingProfit = grossProfit - totalOpex
    const netProfit = operatingProfit - interest - taxes

    setValue('totalOpex', totalOpex)
    setValue('grossProfit', grossProfit)
    setValue('operatingProfit', operatingProfit)
    setValue('netProfit', netProfit)
  }, [watchedRevenue, watchedCogs, watchedInterest, watchedTaxes, opexItems, setValue])

  const fetchReports = async () => {
    if (!portfolioId) return
    const data = await getReports(portfolioId, 'pnl')
    setReports(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
  }

  const fetchConfig = async () => {
    if (!portfolioId) return
    const config = await getPortfolioConfigOrDefault(portfolioId)
    setPortfolioConfig(config)
    setCategories(config.revenueCategories)
  }

  useEffect(() => { fetchReports(); fetchConfig() }, [portfolioId])

  // Open dialog for manual input
  const openManualInput = () => {
    setEditingReport(null)
    const emptyBreakdown: Record<string, number> = {}
    for (const cat of categories) emptyBreakdown[cat.id] = 0
    reset({
      period: '', revenue: 0, cogs: 0, grossProfit: 0,
      opex: [], totalOpex: 0, operatingProfit: 0, interest: 0, taxes: 0,
      netProfit: 0, transactionCount: 0,
      unitBreakdown: emptyBreakdown,
      notes: '',
    })
    setOpexItems([])
    setDialogOpen(true)
  }

  // Open dialog for editing
  const openEdit = (report: PortfolioReport) => {
    setEditingReport(report)
    const d = report.extractedData as PnLExtractedData
    reset(d)
    setOpexItems(d.opex ?? [])
    setDialogOpen(true)
  }

  // Populate form from extracted data
  const populateForm = (data: PnLExtractedData) => {
    // Normalize period to YYYY-MM format
    data.period = normalizePeriod(data.period)
    Object.entries(data).forEach(([k, v]) => {
      if (k !== 'opex' && k !== 'unitBreakdown') {
        setValue(k as keyof PnLExtractedData, v as never)
      }
    })
    if (data.unitBreakdown) {
      for (const cat of categories) {
        setValue(`unitBreakdown.${cat.id}` as `unitBreakdown.${string}`, data.unitBreakdown[cat.id] ?? 0)
      }
    }
    setOpexItems(data.opex ?? [])
  }

  // File upload → extract → open dialog
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File maksimal 10MB'); return }
    setMode('extracting')
    try {
      const data = await extractPnL(file, portfolioConfig ?? undefined)
      setEditingReport(null)
      populateForm(data)
      setDialogOpen(true)
      toast.success('Data berhasil diekstrak. Silakan review sebelum menyimpan.')
    } catch {
      toast.error('Gagal mengekstrak data. Pastikan dokumen valid.')
    } finally {
      setMode('idle')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Save (create or update)
  const onSave = async (data: PnLExtractedData) => {
    if (!portfolioId || !user) return
    setIsSaving(true)
    const extractedData: PnLExtractedData = { ...data, opex: opexItems }
    try {
      if (editingReport) {
        await updateReport(portfolioId, editingReport.id, {
          period: extractedData.period,
          extractedData,
        })
        toast.success('Laporan PnL berhasil diperbarui')
      } else {
        await saveReport(portfolioId, {
          type: 'pnl',
          fileName: fileRef.current?.files?.[0]?.name ?? 'Input Manual',
          fileUrl: '',
          period: extractedData.period,
          extractedData,
          uploadedBy: user.uid,
        })
        toast.success('Laporan PnL berhasil disimpan')
      }
      await syncFinancialData(portfolioId)
      setDialogOpen(false)
      reset()
      setOpexItems([])
      setEditingReport(null)
      fetchReports()
    } catch {
      toast.error('Gagal menyimpan laporan')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete
  const handleDelete = async (id: string) => {
    if (!portfolioId) return
    setDeleteId(id)
    try {
      await deleteReport(portfolioId, id)
      await syncFinancialData(portfolioId)
      toast.success('Laporan berhasil dihapus')
      fetchReports()
    } catch {
      toast.error('Gagal menghapus laporan')
    } finally {
      setDeleteId(null)
    }
  }

  // Opex helpers
  const addOpexItem = () => setOpexItems(prev => [...prev, { name: '', amount: 0 }])
  const removeOpexItem = (i: number) => setOpexItems(prev => prev.filter((_, idx) => idx !== i))
  const updateOpexItem = (i: number, field: keyof OpexItem, val: string | number) =>
    setOpexItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Laporan PnL</h2>
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
              <p className="font-medium">Mengekstrak data dengan AI...</p>
              <p className="text-sm text-muted-foreground">Proses ini mungkin memakan 10–30 detik</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat PnL ({reports.length})</CardTitle></CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            portfolio?.isGracePeriod ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">Grace Period</p>
                    <p className="text-sm text-amber-700">
                      Laporan PnL belum diperlukan selama masa grace period. Upload PnL setelah grace period berakhir.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada laporan PnL</p>
            )
          ) : (
            <div className="divide-y">
              {reports.map(r => {
                const d = r.extractedData as PnLExtractedData
                return (
                  <div key={r.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{formatPeriod(r.period)}</p>
                      <p className="text-xs text-muted-foreground">{r.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Net Profit: {formatCurrencyExact(d.netProfit)}</Badge>
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
            <DialogTitle>{editingReport ? 'Edit Laporan PnL' : 'Input Laporan PnL'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Periode</Label>
                <MonthYearPicker value={watch('period')} onChange={(v) => setValue('period', v)} />
              </div>
              {([
                ['revenue', 'Revenue (IDR)', false],
                ['cogs', 'COGS (IDR)', false],
                ['grossProfit', 'Gross Profit (IDR)', true],
                ['totalOpex', 'Total Opex (IDR)', true],
                ['operatingProfit', 'Operating Profit (IDR)', true],
                ['interest', 'Interest (IDR)', false],
                ['taxes', 'Taxes (IDR)', false],
                ['netProfit', 'Net Profit (IDR)', true],
                ['transactionCount', 'Jumlah Transaksi', false],
              ] as [keyof PnLExtractedData, string, boolean][]).map(([field, label, readOnly]) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    {...register(field, { valueAsNumber: true })}
                    type="number"
                    readOnly={readOnly}
                    className={`text-sm ${readOnly ? 'bg-muted cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </div>

            {/* Unit Breakdown */}
            <div>
              <Label className="text-xs font-semibold">Unit Breakdown</Label>
              <div className="grid grid-cols-3 gap-4 mt-1">
                {categories.map(cat => (
                  <div key={cat.id} className="space-y-1">
                    <Label className="text-xs">{cat.name}</Label>
                    <Input {...register(`unitBreakdown.${cat.id}`, { valueAsNumber: true })} type="number" className="text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Opex Items */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Detail Opex</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOpexItem}>
                  <Plus className="h-3 w-3 mr-1" /> Tambah
                </Button>
              </div>
              {opexItems.length > 0 && (
                <div className="space-y-2 mt-2">
                  {opexItems.map((item, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="Nama opex"
                        value={item.name}
                        onChange={e => updateOpexItem(i, 'name', e.target.value)}
                        className="text-sm flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Jumlah (IDR)"
                        value={item.amount}
                        onChange={e => updateOpexItem(i, 'amount', Number(e.target.value))}
                        className="text-sm w-40"
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeOpexItem(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Catatan</Label>
              <Textarea {...register('notes')} className="text-sm" rows={3} />
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
