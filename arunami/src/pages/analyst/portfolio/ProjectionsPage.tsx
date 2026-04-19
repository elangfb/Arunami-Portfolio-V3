import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { extractProjectionMonthly } from '@/lib/gemini'
import { getReports, saveReport, updateReport, deleteReport, syncFinancialData, getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import { enrichConfigFromFirstUpload } from '@/lib/portfolioEnrichment'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyExact } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Upload, Loader2, Plus, Pencil, Trash2, X, AlertTriangle, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { ProjectionReviewTable } from '@/components/ProjectionReviewTable'
import { CustomCategoryBlock } from '@/components/CustomCategoryBlock'
import { AddCustomCategoryDialog } from '@/components/AddCustomCategoryDialog'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { formatPeriod, normalizePeriod, comparePeriods } from '@/lib/dateUtils'
import {
  unionCategories,
  addCategory as addCategoryInList,
  removeCategory as removeCategoryInList,
  addSubItem as addSubItemInList,
  removeSubItem as removeSubItemInList,
} from '@/lib/customCategories'
import {
  resolveBodyOrder,
  moveInBody,
  applySubItemOrder,
  moveSubItemInCategory,
  setSubItemOrder,
  type MoveDirection,
} from '@/lib/rowOrder'
import type {
  ProjectionExtractedData, ProjectionUploadPending, OpexItem, PortfolioReport, Portfolio,
  CustomCategory, CustomCategoryType, PortfolioConfig, RowOrder,
} from '@/types'

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
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null)

  // Inline editing state
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineData, setInlineData] = useState<Record<string, number>>({})
  const [inlineCategories, setInlineCategories] = useState<CustomCategory[]>([])
  const [inlineSaving, setInlineSaving] = useState(false)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)

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

  const fetchConfig = async () => {
    if (!portfolioId) return
    const config = await getPortfolioConfigOrDefault(portfolioId)
    setPortfolioConfig(config)
  }

  useEffect(() => { fetchReports(); fetchConfig() }, [portfolioId])

  const handleRowOrderChange = async (next: RowOrder) => {
    if (!portfolioId || !portfolioConfig) return
    const optimistic: PortfolioConfig = { ...portfolioConfig, projectionRowOrder: next }
    setPortfolioConfig(optimistic)
    try {
      const { createdAt: _omit, ...rest } = optimistic
      void _omit
      await savePortfolioConfig(portfolioId, rest)
    } catch {
      toast.error('Gagal menyimpan urutan baris')
      setPortfolioConfig(portfolioConfig)
    }
  }

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

  // openEdit kept for potential future use but no longer called from Pencil button

  // Inline editing helpers
  const recalcProjection = (
    data: Record<string, number>,
    cats: CustomCategory[],
  ): Record<string, number> => {
    const next = { ...data }
    const opexTotal = Object.entries(next)
      .filter(([k]) => k.startsWith('opex:'))
      .reduce((sum, [, v]) => sum + (v || 0), 0)
    let customIncome = 0
    let customExpense = 0
    for (const c of cats) {
      const sum = c.subItems.reduce(
        (s, sub) => s + (next[`custom:${c.id}:${sub.id}`] || 0),
        0,
      )
      if (c.type === 'income') customIncome += sum
      else customExpense += sum
    }
    next.projectedGrossProfit = (next.projectedRevenue || 0) - (next.projectedCogs || 0)
    next.projectedTotalOpex = opexTotal
    next.projectedNetProfit =
      next.projectedGrossProfit - next.projectedTotalOpex + customIncome - customExpense
    return next
  }

  const startInlineEdit = (report: PortfolioReport) => {
    const d = report.extractedData as ProjectionExtractedData
    const data: Record<string, number> = {
      projectedRevenue: d.projectedRevenue,
      projectedCogs: d.projectedCogs,
      projectedGrossProfit: d.projectedGrossProfit,
      projectedTotalOpex: d.projectedTotalOpex,
      projectedNetProfit: d.projectedNetProfit,
    }
    for (const item of d.projectedOpex ?? []) {
      data[`opex:${item.name}`] = item.amount
    }
    // Initialize opex items from ALL reports that may not exist in this report
    const allOpexNames = [...new Set(reports.flatMap(r => {
      const rd = r.extractedData as ProjectionExtractedData
      return (rd.projectedOpex ?? []).map(o => o.name)
    }))]
    for (const name of allOpexNames) {
      if (data[`opex:${name}`] === undefined) data[`opex:${name}`] = 0
    }
    const catsUnion = unionCategories(
      reports.map(r => (r.extractedData as ProjectionExtractedData).customCategories),
    )
    const ownCats = d.customCategories ?? []
    for (const cat of catsUnion) {
      for (const sub of cat.subItems) {
        const ownCat = ownCats.find(c => c.id === cat.id)
        const ownSub = ownCat?.subItems.find(s => s.id === sub.id)
        data[`custom:${cat.id}:${sub.id}`] = ownSub?.amount ?? 0
      }
    }
    setInlineCategories(catsUnion)
    setInlineData(recalcProjection(data, catsUnion))
    setInlineEditId(report.id)
  }

  const handleInlineChange = (key: string, value: number) => {
    setInlineData(prev => recalcProjection({ ...prev, [key]: value }, inlineCategories))
  }

  const handleInlineAddCategory = (name: string, type: CustomCategoryType) => {
    const { categories: nextCats } = addCategoryInList(inlineCategories, name, type)
    setInlineCategories(nextCats)
    setInlineData(prev => recalcProjection(prev, nextCats))
  }

  const handleInlineRemoveCategory = (catId: string) => {
    const nextCats = removeCategoryInList(inlineCategories, catId)
    setInlineCategories(nextCats)
    setInlineData(prev => {
      const stripped: Record<string, number> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`custom:${catId}:`)) stripped[k] = v
      }
      return recalcProjection(stripped, nextCats)
    })
  }

  const handleInlineAddSubItem = (catId: string) => {
    const cat = inlineCategories.find(c => c.id === catId)
    const name = window.prompt(`Nama sub-kategori baru untuk "${cat?.name ?? 'Kategori'}":`)
    if (!name?.trim()) return
    const { categories: nextCats, subId } = addSubItemInList(inlineCategories, catId, name)
    if (!subId) return
    setInlineCategories(nextCats)
    setInlineData(prev =>
      recalcProjection({ ...prev, [`custom:${catId}:${subId}`]: 0 }, nextCats),
    )
  }

  const handleInlineRemoveSubItem = (catId: string, subId: string) => {
    const nextCats = removeSubItemInList(inlineCategories, catId, subId)
    setInlineCategories(nextCats)
    setInlineData(prev => {
      const { [`custom:${catId}:${subId}`]: _removed, ...rest } = prev
      void _removed
      return recalcProjection(rest, nextCats)
    })
  }

  const handleInlineSave = async (report: PortfolioReport) => {
    if (!portfolioId || !user) return
    setInlineSaving(true)
    try {
      const d = report.extractedData as ProjectionExtractedData
      const projectedOpex: OpexItem[] = Object.entries(inlineData)
        .filter(([k]) => k.startsWith('opex:'))
        .map(([k, amount]) => ({ name: k.slice(5), amount }))

      const projectedRevenue = inlineData.projectedRevenue ?? d.projectedRevenue
      const projectedCogs = inlineData.projectedCogs ?? d.projectedCogs
      const projectedCogsPercent = projectedRevenue
        ? Math.round((projectedCogs / projectedRevenue) * 1000) / 10
        : 0

      const customCategories: CustomCategory[] = inlineCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        type: cat.type,
        subItems: cat.subItems.map(sub => ({
          id: sub.id,
          name: sub.name,
          amount: inlineData[`custom:${cat.id}:${sub.id}`] ?? 0,
        })),
      }))

      const extractedData: ProjectionExtractedData = {
        ...d,
        projectedRevenue,
        projectedCogsPercent,
        projectedCogs,
        projectedGrossProfit: inlineData.projectedGrossProfit ?? d.projectedGrossProfit,
        projectedOpex,
        projectedTotalOpex: inlineData.projectedTotalOpex ?? d.projectedTotalOpex,
        projectedNetProfit: inlineData.projectedNetProfit ?? d.projectedNetProfit,
        customCategories,
      }

      await updateReport(portfolioId, report.id, { extractedData })
      await syncFinancialData(portfolioId)
      setInlineEditId(null)
      setInlineData({})
      setInlineCategories([])
      fetchReports()
      toast.success('Proyeksi berhasil diperbarui')
    } catch {
      toast.error('Gagal menyimpan proyeksi')
    } finally {
      setInlineSaving(false)
    }
  }

  const cancelInlineEdit = () => {
    setInlineEditId(null)
    setInlineData({})
    setInlineCategories([])
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File maksimal 10MB'); return }
    if (!portfolioId || !portfolio) { toast.error('Portofolio belum siap'); return }
    setMode('extracting')
    try {
      const data = await extractProjectionMonthly(file)
      setPendingProjection(data)
      toast.success('Data proyeksi berhasil diekstrak — silakan review sebelum konfirmasi')

      // One-shot enrichment on the very first upload — discovers custom revenue
      // categories and KPI metrics from this file and merges into PortfolioConfig.
      try {
        const result = await enrichConfigFromFirstUpload({
          portfolioId,
          file,
          kind: 'projection',
          industryType: portfolio.industryType,
        })
        if (result.ranEnrichment && (result.newCategories.length > 0 || result.newKpis.length > 0)) {
          const parts: string[] = []
          if (result.newCategories.length > 0) parts.push(`${result.newCategories.length} kategori revenue`)
          if (result.newKpis.length > 0) parts.push(`${result.newKpis.length} metrik KPI`)
          toast.success(`Konfigurasi portofolio diperbarui: ${parts.join(' & ')} ditemukan dari laporan.`)
        }
      } catch (err) {
        console.warn('Config enrichment failed:', err)
      }
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
              onDataChange={setPendingProjection}
              onConfirm={handleConfirmProjection}
              onCancel={() => setPendingProjection(null)}
              isConfirming={isConfirming}
              rowOrder={portfolioConfig?.projectionRowOrder}
              onRowOrderChange={handleRowOrderChange}
            />
          </CardContent>
        </Card>
      )}

      {/* History — horizontal table */}
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
            (() => {
              const sorted = [...reports].sort((a, b) => comparePeriods(a.period, b.period))
              const rawOpexNames = [...new Set(sorted.flatMap(r => {
                const d = r.extractedData as ProjectionExtractedData
                return (d.projectedOpex ?? []).map(o => o.name)
              }))]
              const rowOrder = portfolioConfig?.projectionRowOrder
              const getCell = (r: PortfolioReport, key: string): number => {
                const d = r.extractedData as ProjectionExtractedData
                if (key.startsWith('opex:')) {
                  const name = key.slice(5)
                  return d.projectedOpex?.find(o => o.name === name)?.amount ?? 0
                }
                return (d[key as keyof ProjectionExtractedData] as number) ?? 0
              }
              const rowsBeforeBody: { label: string; key: string; bold?: boolean; className?: string; editable?: boolean }[] = [
                { label: 'Projected Revenue', key: 'projectedRevenue', bold: true, editable: true },
                { label: 'COGS', key: 'projectedCogs', className: 'text-red-600', editable: true },
                { label: 'Gross Profit', key: 'projectedGrossProfit', bold: true, className: 'text-green-700' },
              ]
              const rowsAfterBody: { label: string; key: string; bold?: boolean; className?: string; editable?: boolean }[] = [
                { label: 'Total Opex', key: 'projectedTotalOpex', className: 'text-red-600' },
              ]
              const netProfitRow = { label: 'Net Profit', key: 'projectedNetProfit', bold: true }
              const rawDisplayCategories = inlineEditId
                ? inlineCategories
                : unionCategories(
                    sorted.map(r => (r.extractedData as ProjectionExtractedData).customCategories),
                  )
              const categoryIds = rawDisplayCategories.map(c => c.id)
              const bodyOrder = resolveBodyOrder(rawOpexNames, categoryIds, rowOrder)
              const catById = new Map(rawDisplayCategories.map(c => [c.id, c]))
              const getCustomAmount = (reportId: string, catId: string, subId: string): number => {
                if (inlineEditId === reportId) {
                  return inlineData[`custom:${catId}:${subId}`] ?? 0
                }
                const r = sorted.find(x => x.id === reportId)
                if (!r) return 0
                const d = r.extractedData as ProjectionExtractedData
                const cat = d.customCategories?.find(c => c.id === catId)
                return cat?.subItems.find(s => s.id === subId)?.amount ?? 0
              }
              const moveOpex = (opexName: string, direction: MoveDirection) => {
                const next = moveInBody(rowOrder, rawOpexNames, categoryIds, { type: 'opex', id: opexName }, direction)
                handleRowOrderChange({ ...(rowOrder ?? {}), body: next })
              }
              const moveCategory = (catId: string, direction: MoveDirection) => {
                const next = moveInBody(rowOrder, rawOpexNames, categoryIds, { type: 'cat', id: catId }, direction)
                handleRowOrderChange({ ...(rowOrder ?? {}), body: next })
              }
              const moveSubItem = (catId: string, subId: string, direction: MoveDirection) => {
                const cat = catById.get(catId)
                if (!cat) return
                const availableIds = cat.subItems.map(s => s.id)
                const next = moveSubItemInCategory(rowOrder?.customSubItems?.[catId], availableIds, subId, direction)
                handleRowOrderChange(setSubItemOrder(rowOrder, catId, next))
              }
              const renderStandardRow = (row: { label: string; key: string; bold?: boolean; className?: string; editable?: boolean }) => (
                <tr key={row.key} className={row.bold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                  <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.bold ? 'font-semibold bg-muted/20' : ''}`}>
                    {row.label}
                  </td>
                  {sorted.map(r => {
                    const isEditing = inlineEditId === r.id
                    const val = isEditing ? (inlineData[row.key] ?? 0) : getCell(r, row.key)
                    const colorClass = row.className ?? ''
                    return (
                      <td key={r.id} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${colorClass} ${row.bold ? 'font-semibold' : ''}`}>
                        {isEditing && row.editable ? (
                          <Input
                            type="number"
                            value={inlineData[row.key] ?? 0}
                            onChange={e => handleInlineChange(row.key, Number(e.target.value) || 0)}
                            className="h-7 w-full text-right text-sm tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        ) : (
                          formatCurrencyExact(val)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
              return (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-medium min-w-[180px] border-r">
                            Variable
                          </th>
                          {sorted.map(r => (
                            <th key={r.id} className="px-3 py-2 text-right font-medium whitespace-nowrap min-w-[170px]">
                              <div>{formatPeriod(r.period)}</div>
                              <div className="flex justify-end gap-1 mt-1">
                                {inlineEditId === r.id ? (
                                  <>
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:text-green-700"
                                      disabled={inlineSaving}
                                      onClick={() => handleInlineSave(r)}
                                    >
                                      {inlineSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6"
                                      disabled={inlineSaving}
                                      onClick={cancelInlineEdit}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!!inlineEditId} onClick={() => startInlineEdit(r)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                                      disabled={deleteId === r.id || !!inlineEditId}
                                      onClick={() => handleDelete(r.id)}
                                    >
                                      {deleteId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rowsBeforeBody.map(renderStandardRow)}

                        {/* Interleaved body: opex rows + custom category blocks */}
                        {bodyOrder.map((entry, bodyIdx) => {
                          const isFirstInBody = bodyIdx === 0
                          const isLastInBody = bodyIdx === bodyOrder.length - 1

                          if (entry.type === 'opex') {
                            const opexName = entry.id
                            const key = `opex:${opexName}`
                            return (
                              <tr key={`body-opex-${opexName}`} className="hover:bg-muted/10">
                                <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r pl-8 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <div className="flex flex-col shrink-0">
                                      <button
                                        type="button"
                                        disabled={isFirstInBody}
                                        onClick={() => moveOpex(opexName, 'up')}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                                        title="Pindah ke atas"
                                      >
                                        <ChevronUp className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isLastInBody}
                                        onClick={() => moveOpex(opexName, 'down')}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                                        title="Pindah ke bawah"
                                      >
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <span className="flex-1">{opexName}</span>
                                  </div>
                                </td>
                                {sorted.map(r => {
                                  const isEditing = inlineEditId === r.id
                                  const val = isEditing ? (inlineData[key] ?? 0) : getCell(r, key)
                                  return (
                                    <td key={r.id} className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                                      {isEditing ? (
                                        <Input
                                          type="number"
                                          value={inlineData[key] ?? 0}
                                          onChange={e => handleInlineChange(key, Number(e.target.value) || 0)}
                                          className="h-7 w-full text-right text-sm tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        formatCurrencyExact(val)
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          }

                          const cat = catById.get(entry.id)
                          if (!cat) return null
                          const ordered = applySubItemOrder(cat, rowOrder?.customSubItems?.[cat.id])
                          return (
                            <CustomCategoryBlock
                              key={`body-cat-${cat.id}`}
                              category={ordered}
                              columns={sorted.map(r => ({
                                key: r.id,
                                editable: inlineEditId === r.id,
                              }))}
                              showGrandTotal={false}
                              getAmount={getCustomAmount}
                              onAmountChange={(columnKey, catId, subId, value) => {
                                if (inlineEditId !== columnKey) return
                                handleInlineChange(`custom:${catId}:${subId}`, value)
                              }}
                              onRemoveCategory={handleInlineRemoveCategory}
                              onAddSubItem={handleInlineAddSubItem}
                              onRemoveSubItem={handleInlineRemoveSubItem}
                              onMoveCategory={moveCategory}
                              isFirstInBody={isFirstInBody}
                              isLastInBody={isLastInBody}
                              onMoveSubItem={moveSubItem}
                            />
                          )
                        })}

                        {rowsAfterBody.map(renderStandardRow)}

                        {/* Net Profit row */}
                        <tr className="bg-muted/20">
                          <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 border-r font-semibold">
                            {netProfitRow.label}
                          </td>
                          {sorted.map(r => {
                            const isEditing = inlineEditId === r.id
                            const val = isEditing
                              ? (inlineData.projectedNetProfit ?? 0)
                              : getCell(r, 'projectedNetProfit')
                            return (
                              <td key={r.id} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums font-semibold ${
                                val >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatCurrencyExact(val)}
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                      {inlineEditId && (
                        <tfoot>
                          <tr>
                            <td colSpan={sorted.length + 1} className="px-4 py-2 border-t">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAddCategoryOpen(true)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Tambah Kategori
                              </Button>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )
            })()
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Input Proyeksi</DialogTitle>
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
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AddCustomCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        onSubmit={handleInlineAddCategory}
        existingNames={inlineCategories.map(c => c.name)}
      />
    </div>
  )
}
