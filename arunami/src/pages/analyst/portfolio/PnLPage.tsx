import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { extractPnLMonthly } from '@/lib/gemini'
import { getReports, saveReport, updateReport, deleteReport, deleteAllReports, syncFinancialData, getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
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
import { Upload, Loader2, Plus, Pencil, Trash2, X, AlertTriangle, Check } from 'lucide-react'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { PnLReviewTable } from '@/components/PnLReviewTable'
import { CustomCategoryBlock } from '@/components/CustomCategoryBlock'
import {
  AddCustomCategoryDialog,
  type AddCategoryPayload,
} from '@/components/AddCustomCategoryDialog'
import { formatPeriod, normalizePeriod, comparePeriods } from '@/lib/dateUtils'
import {
  unionCategories,
  addCategory as addCategoryInList,
  removeCategory as removeCategoryInList,
  addSubItem as addSubItemInList,
  removeSubItem as removeSubItemInList,
  unionCogsSubItems,
  unionRevenueSubItems,
  slugifyCategory,
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
  PnLExtractedData, PnLUploadPending, OpexItem, PortfolioReport, Portfolio,
  PortfolioConfig, RevenueCategory, CustomCategory, CustomCategoryType, CustomSubItem,
} from '@/types'

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
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null)
  const [categories, setCategories] = useState<RevenueCategory[]>([])
  const [pendingPnl, setPendingPnl] = useState<PnLUploadPending | null>(null)
  const [pendingUnits, setPendingUnits] = useState<RevenueCategory[]>([])
  const [isConfirming, setIsConfirming] = useState(false)

  // Inline editing state
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineData, setInlineData] = useState<Record<string, number>>({})
  const [inlineCategories, setInlineCategories] = useState<CustomCategory[]>([])
  const [inlineCogsSubItems, setInlineCogsSubItems] = useState<CustomSubItem[]>([])
  const [inlineRevenueSubItems, setInlineRevenueSubItems] = useState<CustomSubItem[]>([])
  // Opex items added during the current inline edit that don't exist in any saved
  // report yet. Merged into the displayed opex name set so the new row shows up
  // immediately while the user is editing.
  const [inlineAddedOpexNames, setInlineAddedOpexNames] = useState<string[]>([])
  const [inlineSaving, setInlineSaving] = useState(false)
  const [addDialog, setAddDialog] = useState<{
    open: boolean
    lockedMode?: 'main' | 'sub'
    presetParentId?: string
  }>({ open: false })
  // Accordion expand/collapse state — session-only, all expanded by default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const isExpanded = (id: string) => expanded[id] !== false
  const toggleExpanded = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false }))

  const { register, handleSubmit, reset, setValue, watch } = useForm<PnLExtractedData>({
    defaultValues: {
      period: '', revenue: 0, cogs: 0, grossProfit: 0,
      opex: [], totalOpex: 0, operatingProfit: 0, interest: 0, taxes: 0,
      netProfit: 0,
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

  const handleRowOrderChange = async (next: import('@/types').RowOrder) => {
    if (!portfolioId || !portfolioConfig) return
    const optimistic: PortfolioConfig = { ...portfolioConfig, pnlRowOrder: next }
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

  useEffect(() => { fetchReports(); fetchConfig() }, [portfolioId])

  // Open dialog for manual input
  const openManualInput = () => {
    setEditingReport(null)
    const emptyBreakdown: Record<string, number> = {}
    for (const cat of categories) emptyBreakdown[cat.id] = 0
    reset({
      period: '', revenue: 0, cogs: 0, grossProfit: 0,
      opex: [], totalOpex: 0, operatingProfit: 0, interest: 0, taxes: 0,
      netProfit: 0,
      unitBreakdown: emptyBreakdown,
      notes: '',
    })
    setOpexItems([])
    setDialogOpen(true)
  }

  // openEdit kept for potential future use but no longer called from Pencil button

  // Inline editing helpers
  const recalcPnl = (
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
    // When revenue breakdown exists, derive revenue from the sum of revSub:* keys.
    const revKeys = Object.keys(next).filter(k => k.startsWith('revSub:'))
    if (revKeys.length > 0) {
      next.revenue = revKeys.reduce((s, k) => s + (next[k] || 0), 0)
    }
    // When cogs breakdown exists, derive cogs from the sum of cogsSub:* keys.
    const cogsKeys = Object.keys(next).filter(k => k.startsWith('cogsSub:'))
    if (cogsKeys.length > 0) {
      next.cogs = cogsKeys.reduce((s, k) => s + (next[k] || 0), 0)
    }
    next.grossProfit = (next.revenue || 0) - (next.cogs || 0)
    next.totalOpex = opexTotal
    next.operatingProfit = next.grossProfit - next.totalOpex
    next.netProfit =
      next.operatingProfit - (next.interest || 0) - (next.taxes || 0) + customIncome - customExpense
    return next
  }

  const startInlineEdit = (report: PortfolioReport) => {
    const d = report.extractedData as PnLExtractedData
    const data: Record<string, number> = {
      revenue: d.revenue,
      cogs: d.cogs,
      grossProfit: d.grossProfit,
      totalOpex: d.totalOpex,
      operatingProfit: d.operatingProfit,
      interest: d.interest,
      taxes: d.taxes,
      netProfit: d.netProfit,
    }
    for (const item of d.opex ?? []) {
      data[`opex:${item.name}`] = item.amount
    }
    // Initialize opex items from ALL reports that may not exist in this report
    const allOpexNames = [...new Set(reports.flatMap(r => {
      const rd = r.extractedData as PnLExtractedData
      return (rd.opex ?? []).map(o => o.name)
    }))]
    for (const name of allOpexNames) {
      if (data[`opex:${name}`] === undefined) data[`opex:${name}`] = 0
    }
    // Seed custom category rows from union of all reports; use this report's
    // amounts when present, otherwise 0.
    const catsUnion = unionCategories(
      reports.map(r => (r.extractedData as PnLExtractedData).customCategories),
    )
    const ownCats = d.customCategories ?? []
    for (const cat of catsUnion) {
      for (const sub of cat.subItems) {
        const ownCat = ownCats.find(c => c.id === cat.id)
        const ownSub = ownCat?.subItems.find(s => s.id === sub.id)
        data[`custom:${cat.id}:${sub.id}`] = ownSub?.amount ?? 0
      }
    }
    // Seed cogs sub-items the same way.
    const cogsUnion = unionCogsSubItems(
      reports.map(r => (r.extractedData as PnLExtractedData).cogsSubItems),
    )
    const ownCogs = d.cogsSubItems ?? []
    for (const sub of cogsUnion) {
      data[`cogsSub:${sub.id}`] = ownCogs.find(s => s.id === sub.id)?.amount ?? 0
    }
    // Seed revenue sub-items the same way.
    const revUnion = unionRevenueSubItems(
      reports.map(r => (r.extractedData as PnLExtractedData).revenueSubItems),
    )
    const ownRev = d.revenueSubItems ?? []
    for (const sub of revUnion) {
      data[`revSub:${sub.id}`] = ownRev.find(s => s.id === sub.id)?.amount ?? 0
    }
    setInlineCategories(catsUnion)
    setInlineCogsSubItems(cogsUnion)
    setInlineRevenueSubItems(revUnion)
    setInlineData(recalcPnl(data, catsUnion))
    setInlineEditId(report.id)
  }

  const handleInlineChange = (key: string, value: number) => {
    setInlineData(prev => recalcPnl({ ...prev, [key]: value }, inlineCategories))
  }

  const handleInlineAddCategory = (name: string, type: CustomCategoryType) => {
    const { categories: nextCats } = addCategoryInList(inlineCategories, name, type)
    setInlineCategories(nextCats)
    setInlineData(prev => recalcPnl(prev, nextCats))
  }

  const handleInlineDialogSubmit = (payload: AddCategoryPayload) => {
    if (payload.kind === 'main') {
      handleInlineAddCategory(payload.name, payload.type)
      return
    }
    if (payload.parentId === '__revenue__') {
      handleInlineAddRevenueSub(payload.name)
      return
    }
    if (payload.parentId === '__cogs__') {
      handleInlineAddCogsSub(payload.name)
      return
    }
    if (payload.parentId === '__opex__') {
      handleInlineAddOpexByName(payload.name)
      return
    }
    const { categories: nextCats, subId } = addSubItemInList(
      inlineCategories,
      payload.parentId,
      payload.name,
    )
    if (!subId) return
    setInlineCategories(nextCats)
    setInlineData(prev => recalcPnl({ ...prev, [`custom:${payload.parentId}:${subId}`]: 0 }, nextCats))
  }

  // ── Revenue breakdown handlers (inline edit) ────────────────────────────
  const handleInlineAddRevenueSub = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (inlineRevenueSubItems.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Komponen revenue dengan nama ini sudah ada')
      return
    }
    const existingIds = new Set(inlineRevenueSubItems.map(s => s.id))
    const base = slugifyCategory(trimmed) || `rev-${Date.now()}`
    let subId = base
    let i = 2
    while (existingIds.has(subId)) subId = `${base}-${i++}`
    const next = [...inlineRevenueSubItems, { id: subId, name: trimmed, amount: 0 }]
    setInlineRevenueSubItems(next)
    setInlineData(prev => recalcPnl({ ...prev, [`revSub:${subId}`]: 0 }, inlineCategories))
  }

  const handleInlineRevenueRemoveSub = (_catId: string, subId: string) => {
    setInlineRevenueSubItems(prev => prev.filter(s => s.id !== subId))
    setInlineData(prev => {
      const { [`revSub:${subId}`]: _removed, ...rest } = prev
      void _removed
      return recalcPnl(rest, inlineCategories)
    })
  }

  const handleInlineRemoveCategory = (catId: string) => {
    const nextCats = removeCategoryInList(inlineCategories, catId)
    setInlineCategories(nextCats)
    setInlineData(prev => {
      const stripped: Record<string, number> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`custom:${catId}:`)) stripped[k] = v
      }
      return recalcPnl(stripped, nextCats)
    })
  }

  const handleInlineAddSubItem = (catId: string) => {
    const cat = inlineCategories.find(c => c.id === catId)
    const name = window.prompt(`Nama sub-kategori baru untuk "${cat?.name ?? 'Kategori'}":`)
    if (!name?.trim()) return
    const { categories: nextCats, subId } = addSubItemInList(inlineCategories, catId, name)
    if (!subId) return
    setInlineCategories(nextCats)
    setInlineData(prev => recalcPnl({ ...prev, [`custom:${catId}:${subId}`]: 0 }, nextCats))
  }

  const handleInlineRemoveSubItem = (catId: string, subId: string) => {
    const nextCats = removeSubItemInList(inlineCategories, catId, subId)
    setInlineCategories(nextCats)
    setInlineData(prev => {
      const { [`custom:${catId}:${subId}`]: _removed, ...rest } = prev
      void _removed
      return recalcPnl(rest, nextCats)
    })
  }

  // ── COGS breakdown handlers (inline edit) ──────────────────────────────
  const handleInlineAddCogsSub = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (inlineCogsSubItems.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Komponen COGS dengan nama ini sudah ada')
      return
    }
    const existingIds = new Set(inlineCogsSubItems.map(s => s.id))
    const base = slugifyCategory(trimmed) || `cogs-${Date.now()}`
    let subId = base
    let i = 2
    while (existingIds.has(subId)) subId = `${base}-${i++}`
    const next = [...inlineCogsSubItems, { id: subId, name: trimmed, amount: 0 }]
    setInlineCogsSubItems(next)
    setInlineData(prev => recalcPnl({ ...prev, [`cogsSub:${subId}`]: 0 }, inlineCategories))
  }

  const handleInlineCogsRemoveSub = (_catId: string, subId: string) => {
    setInlineCogsSubItems(prev => prev.filter(s => s.id !== subId))
    setInlineData(prev => {
      const { [`cogsSub:${subId}`]: _removed, ...rest } = prev
      void _removed
      return recalcPnl(rest, inlineCategories)
    })
  }

  // ── OPEX-add during inline edit (via AddCustomCategoryDialog) ─────────
  const handleInlineAddOpexByName = (rawName: string) => {
    const name = rawName.trim()
    if (!name) return
    // Collide against both saved reports and newly-added-in-this-edit names.
    const allOpex = [...new Set(reports.flatMap(r => {
      const rd = r.extractedData as PnLExtractedData
      return (rd.opex ?? []).map(o => o.name)
    }))]
    if ([...allOpex, ...inlineAddedOpexNames].some(n => n.toLowerCase() === name.toLowerCase())) {
      toast.error('Item opex dengan nama ini sudah ada')
      return
    }
    setInlineAddedOpexNames(prev => [...prev, name])
    setInlineData(prev => recalcPnl({ ...prev, [`opex:${name}`]: 0 }, inlineCategories))
  }

  const handleInlineSave = async (report: PortfolioReport) => {
    if (!portfolioId || !user) return
    setInlineSaving(true)
    try {
      const d = report.extractedData as PnLExtractedData
      const opex: OpexItem[] = Object.entries(inlineData)
        .filter(([k]) => k.startsWith('opex:'))
        .map(([k, amount]) => ({ name: k.slice(5), amount }))

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

      const cogsSubItems: CustomSubItem[] = inlineCogsSubItems.map(sub => ({
        id: sub.id,
        name: sub.name,
        amount: inlineData[`cogsSub:${sub.id}`] ?? 0,
      }))

      const revenueSubItems: CustomSubItem[] = inlineRevenueSubItems.map(sub => ({
        id: sub.id,
        name: sub.name,
        amount: inlineData[`revSub:${sub.id}`] ?? 0,
      }))

      const extractedData: PnLExtractedData = {
        ...d,
        revenue: inlineData.revenue ?? d.revenue,
        cogs: inlineData.cogs ?? d.cogs,
        grossProfit: inlineData.grossProfit ?? d.grossProfit,
        opex,
        totalOpex: inlineData.totalOpex ?? d.totalOpex,
        operatingProfit: inlineData.operatingProfit ?? d.operatingProfit,
        interest: inlineData.interest ?? d.interest,
        taxes: inlineData.taxes ?? d.taxes,
        netProfit: inlineData.netProfit ?? d.netProfit,
        customCategories,
        cogsSubItems,
        revenueSubItems,
      }

      await updateReport(portfolioId, report.id, { extractedData })
      await syncFinancialData(portfolioId)
      setInlineEditId(null)
      setInlineData({})
      setInlineCategories([])
      setInlineCogsSubItems([])
      setInlineRevenueSubItems([])
      setInlineAddedOpexNames([])
      fetchReports()
      toast.success('Laporan PnL berhasil diperbarui')
    } catch {
      toast.error('Gagal menyimpan laporan')
    } finally {
      setInlineSaving(false)
    }
  }

  const cancelInlineEdit = () => {
    setInlineEditId(null)
    setInlineData({})
    setInlineCategories([])
    setInlineCogsSubItems([])
    setInlineRevenueSubItems([])
    setInlineAddedOpexNames([])
  }

  // File upload → extract → show inline review table
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File maksimal 10MB'); return }
    if (!portfolioId || !portfolio) { toast.error('Portofolio belum siap'); return }
    setMode('extracting')
    try {
      const data = await extractPnLMonthly(file, portfolioConfig ?? undefined)

      // Unit breakdown: use only the units the analyst has previously saved
      // (from PortfolioConfig.pnlUnitCategories). First upload → empty list.
      // Analyst adds/removes via + and X buttons in the review table.
      const savedUnits = portfolioConfig?.pnlUnitCategories ?? []
      setPendingUnits(savedUnits)
      const filteredBreakdown: Record<string, number> = {}
      for (const u of savedUnits) {
        filteredBreakdown[u.id] = data.unitBreakdown?.[u.id] ?? 0
      }

      // Normalize month periods in each row
      const normalizedData: PnLUploadPending = {
        ...data,
        unitBreakdown: filteredBreakdown,
        monthlyData: data.monthlyData.map(m => ({
          ...m,
          month: normalizePeriod(m.month),
        })),
      }

      setPendingPnl(normalizedData)
      toast.success('Data berhasil diekstrak — silakan review sebelum konfirmasi')

      // One-shot enrichment on the very first upload — discovers custom revenue
      // categories and KPI metrics from this file and merges into PortfolioConfig.
      try {
        const result = await enrichConfigFromFirstUpload({
          portfolioId,
          file,
          kind: 'pnl',
          industryType: portfolio.industryType,
        })
        if (result.ranEnrichment && (result.newCategories.length > 0 || result.newKpis.length > 0)) {
          const parts: string[] = []
          if (result.newCategories.length > 0) parts.push(`${result.newCategories.length} kategori revenue`)
          if (result.newKpis.length > 0) parts.push(`${result.newKpis.length} metrik KPI`)
          toast.success(`Konfigurasi portofolio diperbarui: ${parts.join(' & ')} ditemukan dari laporan.`)
          await fetchConfig()
        }
      } catch (err) {
        console.warn('Config enrichment failed:', err)
      }
    } catch (err) {
      console.error('PnL extraction failed:', err)
      toast.error('Gagal mengekstrak data. Pastikan dokumen valid.')
    } finally {
      setMode('idle')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Confirm & save from the inline review table (upload flow)
  const handleConfirmPnl = async () => {
    if (!portfolioId || !user || !pendingPnl) return
    if (pendingPnl.monthlyData.length === 0) {
      toast.error('Tidak ada data bulan untuk disimpan')
      return
    }
    setIsConfirming(true)
    try {
      // Save each month as an individual PnL report
      for (const month of pendingPnl.monthlyData) {
        const normalizedPeriod = normalizePeriod(month.month)
        const extractedData: PnLExtractedData = {
          period: normalizedPeriod,
          revenue: month.revenue,
          cogs: month.cogs,
          grossProfit: month.grossProfit,
          opex: month.opex,
          totalOpex: month.totalOpex,
          operatingProfit: month.operatingProfit,
          interest: month.interest,
          taxes: month.taxes,
          netProfit: month.netProfit,
          unitBreakdown: pendingPnl.unitBreakdown ?? {},
          notes: pendingPnl.notes ?? '',
          customCategories: month.customCategories ?? [],
          cogsSubItems: month.cogsSubItems ?? [],
        }
        await saveReport(portfolioId, {
          type: 'pnl',
          fileName: fileRef.current?.files?.[0]?.name ?? 'Upload PnL',
          fileUrl: '',
          period: normalizedPeriod,
          extractedData,
          uploadedBy: user.uid,
        })
      }

      // Persist the unit category list so the next upload pre-populates it.
      const existingUnits = portfolioConfig?.pnlUnitCategories ?? []
      const unitsChanged =
        existingUnits.length !== pendingUnits.length ||
        existingUnits.some((u, i) => u.id !== pendingUnits[i]?.id || u.name !== pendingUnits[i]?.name)
      if (portfolioConfig && unitsChanged) {
        const { createdAt: _ignored, ...rest } = portfolioConfig
        void _ignored
        await savePortfolioConfig(portfolioId, { ...rest, pnlUnitCategories: pendingUnits })
      }

      await syncFinancialData(portfolioId)
      setPendingPnl(null)
      setPendingUnits([])
      fetchReports()
      fetchConfig()
      toast.success(`${pendingPnl.monthlyData.length} bulan laporan PnL berhasil disimpan`)
    } catch {
      toast.error('Gagal menyimpan laporan')
    } finally {
      setIsConfirming(false)
    }
  }

  // Save (create or update) — used by the manual-input / edit-existing dialog
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

  const handleResetAll = async () => {
    if (!portfolioId) return
    setIsResetting(true)
    try {
      await deleteAllReports(portfolioId, 'pnl')
      await syncFinancialData(portfolioId)
      setReports([])
      setResetDialogOpen(false)
      toast.success('Semua data PnL berhasil dihapus')
    } catch {
      toast.error('Gagal menghapus data PnL')
    } finally {
      setIsResetting(false)
    }
  }

  // Opex helpers
  const addOpexItem = () => setOpexItems(prev => [...prev, { name: '', amount: 0 }])
  const removeOpexItem = (i: number) => setOpexItems(prev => prev.filter((_, idx) => idx !== i))
  const updateOpexItem = (i: number, field: keyof OpexItem, val: string | number) =>
    setOpexItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const returnModel = portfolioConfig?.returnModel

  return (
    <div className="p-6 space-y-6">
      {returnModel === 'fixed_yield' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <strong>Fixed Yield:</strong> Distribusi untuk model ini tidak bergantung pada P&L.
            Upload P&L tetap dapat dilakukan untuk transparansi dan pelaporan.
          </p>
        </div>
      )}
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

      {/* Analyst Review Table — shown after a successful upload */}
      {pendingPnl && (
        <Card>
          <CardContent className="pt-6">
            <PnLReviewTable
              data={pendingPnl}
              onDataChange={setPendingPnl}
              onConfirm={handleConfirmPnl}
              onCancel={() => { setPendingPnl(null); setPendingUnits([]) }}
              isConfirming={isConfirming}
              units={pendingUnits}
              onUnitsChange={setPendingUnits}
              rowOrder={portfolioConfig?.pnlRowOrder}
              onRowOrderChange={handleRowOrderChange}
            />
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Riwayat PnL ({reports.length})</CardTitle>
          {reports.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setResetDialogOpen(true)} disabled={isResetting}>
              Reset PnL
            </Button>
          )}
        </CardHeader>
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
            (() => {
              const sorted = [...reports].sort((a, b) => comparePeriods(a.period, b.period))
              const savedOpexNames = [...new Set(sorted.flatMap(r => {
                const d = r.extractedData as PnLExtractedData
                return (d.opex ?? []).map(o => o.name)
              }))]
              // Merge in any opex items added during the current inline edit so
              // the new row renders immediately (before save).
              const rawOpexNames = inlineEditId
                ? [...savedOpexNames, ...inlineAddedOpexNames.filter(n => !savedOpexNames.includes(n))]
                : savedOpexNames
              const rowOrder = portfolioConfig?.pnlRowOrder
              const getCell = (r: PortfolioReport, key: string): number => {
                const d = r.extractedData as PnLExtractedData
                if (key.startsWith('opex:')) {
                  const name = key.slice(5)
                  return d.opex?.find(o => o.name === name)?.amount ?? 0
                }
                return (d[key as keyof PnLExtractedData] as number) ?? 0
              }
              // Revenue / COGS can be either flat or broken down into sub-items.
              // When editing, use inline*SubItems; else union across saved reports.
              const rawRevenueSubItems = inlineEditId
                ? inlineRevenueSubItems
                : unionRevenueSubItems(
                    sorted.map(r => (r.extractedData as PnLExtractedData).revenueSubItems),
                  )
              const rawCogsSubItems = inlineEditId
                ? inlineCogsSubItems
                : unionCogsSubItems(
                    sorted.map(r => (r.extractedData as PnLExtractedData).cogsSubItems),
                  )
              const revenueCategory: CustomCategory = {
                id: '__revenue__',
                name: 'Revenue',
                type: 'income',
                subItems: rawRevenueSubItems,
              }
              const cogsCategory: CustomCategory = {
                id: '__cogs__',
                name: 'COGS',
                type: 'expense',
                subItems: rawCogsSubItems,
              }
              const opexCategory: CustomCategory = {
                id: '__opex__',
                name: 'Operating Expenses',
                type: 'expense',
                subItems: rawOpexNames.map(n => ({ id: n, name: n, amount: 0 })),
              }
              // Categories shown in the table:
              //   - When NOT editing: union across all saved reports.
              //   - When editing: inlineCategories (starts as union, with in-flight edits).
              const rawDisplayCategories = inlineEditId
                ? inlineCategories
                : unionCategories(
                    sorted.map(r => (r.extractedData as PnLExtractedData).customCategories),
                  )
              const categoryIds = rawDisplayCategories.map(c => c.id)
              // Body zone only orders custom categories; opex is now under a pinned block.
              const bodyOrder = resolveBodyOrder([], categoryIds, rowOrder).filter(e => e.type === 'cat')
              const catById = new Map(rawDisplayCategories.map(c => [c.id, c]))
              const columns = sorted.map(r => ({ key: r.id, editable: inlineEditId === r.id }))
              const showGrandTotal = false

              // Per-report amount getters for the three pinned blocks + custom blocks
              const getRevenueSubAmount = (reportId: string, _catId: string, subId: string): number => {
                if (inlineEditId === reportId) return inlineData[`revSub:${subId}`] ?? 0
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                return d?.revenueSubItems?.find(s => s.id === subId)?.amount ?? 0
              }
              const getCogsSubAmount = (reportId: string, _catId: string, subId: string): number => {
                if (inlineEditId === reportId) return inlineData[`cogsSub:${subId}`] ?? 0
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                return d?.cogsSubItems?.find(s => s.id === subId)?.amount ?? 0
              }
              const getOpexAmount = (reportId: string, _catId: string, subId: string): number => {
                if (inlineEditId === reportId) return inlineData[`opex:${subId}`] ?? 0
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                return d?.opex?.find(o => o.name === subId)?.amount ?? 0
              }
              const getCustomAmount = (reportId: string, catId: string, subId: string): number => {
                if (inlineEditId === reportId) return inlineData[`custom:${catId}:${subId}`] ?? 0
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                const cat = d?.customCategories?.find(c => c.id === catId)
                return cat?.subItems.find(s => s.id === subId)?.amount ?? 0
              }

              // Column subtotal overrides: when a specific report has no sub-item
              // breakdown for a pinned category, show the stored flat number instead
              // of a misleading 0.
              const revenueColumnOverride = (reportId: string): number | undefined => {
                if (inlineEditId === reportId) {
                  return inlineRevenueSubItems.length > 0 ? undefined : (inlineData.revenue ?? 0)
                }
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                if (!d) return undefined
                return (d.revenueSubItems?.length ?? 0) > 0 ? undefined : (Number(d.revenue) || 0)
              }
              const cogsColumnOverride = (reportId: string): number | undefined => {
                if (inlineEditId === reportId) {
                  return inlineCogsSubItems.length > 0 ? undefined : (inlineData.cogs ?? 0)
                }
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                if (!d) return undefined
                return (d.cogsSubItems?.length ?? 0) > 0 ? undefined : (Number(d.cogs) || 0)
              }
              const opexColumnOverride = (reportId: string): number | undefined => {
                if (inlineEditId === reportId) {
                  // Total Opex is already computed into inlineData.totalOpex.
                  return inlineData.totalOpex ?? 0
                }
                const r = sorted.find(x => x.id === reportId)
                const d = r?.extractedData as PnLExtractedData | undefined
                if (!d) return undefined
                return (d.opex ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0)
              }

              const moveCategory = (catId: string, direction: MoveDirection) => {
                const next = moveInBody(rowOrder, [], categoryIds, { type: 'cat', id: catId }, direction)
                handleRowOrderChange({ ...(rowOrder ?? {}), body: next })
              }
              const moveSubItem = (catId: string, subId: string, direction: MoveDirection) => {
                const cat = catById.get(catId)
                if (!cat) return
                const availableIds = cat.subItems.map(s => s.id)
                const next = moveSubItemInCategory(rowOrder?.customSubItems?.[catId], availableIds, subId, direction)
                handleRowOrderChange(setSubItemOrder(rowOrder, catId, next))
              }
              const moveOpexSub = (_catId: string, subId: string, direction: MoveDirection) => {
                const availableIds = opexCategory.subItems.map(s => s.id)
                const next = moveSubItemInCategory(rowOrder?.customSubItems?.['__opex__'], availableIds, subId, direction)
                handleRowOrderChange(setSubItemOrder(rowOrder, '__opex__', next))
              }

              const renderComputedRow = (row: { label: string; key: string; bold?: boolean; className?: string }) => (
                <tr key={row.key} className={row.bold ? 'bg-muted/20' : 'hover:bg-muted/10'}>
                  <td className={`sticky left-0 z-10 bg-white px-4 py-2 border-r ${row.bold ? 'font-semibold bg-muted/20' : ''}`}>
                    {row.label}
                  </td>
                  {sorted.map(r => {
                    const isEditing = inlineEditId === r.id
                    const val = isEditing ? (inlineData[row.key] ?? 0) : getCell(r, row.key)
                    const colorClass = row.key === 'netProfit'
                      ? (val >= 0 ? 'text-green-600' : 'text-red-600')
                      : (row.className ?? '')
                    return (
                      <td key={r.id} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${colorClass} ${row.bold ? 'font-semibold' : ''}`}>
                        {formatCurrencyExact(val)}
                      </td>
                    )
                  })}
                </tr>
              )
              const renderEditableRow = (row: { label: string; key: string; className?: string }) => (
                <tr key={row.key} className="hover:bg-muted/10">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r">{row.label}</td>
                  {sorted.map(r => {
                    const isEditing = inlineEditId === r.id
                    const val = isEditing ? (inlineData[row.key] ?? 0) : getCell(r, row.key)
                    return (
                      <td key={r.id} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${row.className ?? ''}`}>
                        {isEditing ? (
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
              // Flat editable row for Revenue/COGS when no sub-item breakdown exists.
              const renderFlatMainRow = (
                label: string,
                flatKey: 'revenue' | 'cogs',
                parentId: '__revenue__' | '__cogs__',
              ) => (
                <tr key={`flat-${parentId}`} className="bg-muted/20">
                  <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 border-r font-semibold">
                    <div className="flex items-center gap-1">
                      <span className="flex-1 truncate">{label}</span>
                      {inlineEditId && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: parentId })}
                          title="Tambah sub-kategori"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                  {sorted.map(r => {
                    const isEditing = inlineEditId === r.id
                    const val = isEditing ? (inlineData[flatKey] ?? 0) : getCell(r, flatKey)
                    return (
                      <td key={r.id} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums font-semibold`}>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={inlineData[flatKey] ?? 0}
                            onChange={e => handleInlineChange(flatKey, Number(e.target.value) || 0)}
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
                        {/* Revenue — block when breakdown exists, flat editable row when not */}
                        {rawRevenueSubItems.length > 0 ? (
                          <CustomCategoryBlock
                            key="pinned-revenue"
                            category={revenueCategory}
                            columns={columns}
                            showGrandTotal={showGrandTotal}
                            getAmount={getRevenueSubAmount}
                            onAmountChange={(columnKey, _catId, subId, value) => {
                              if (inlineEditId !== columnKey) return
                              handleInlineChange(`revSub:${subId}`, value)
                            }}
                            onRemoveCategory={() => {}}
                            onAddSubItem={() => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: '__revenue__' })}
                            onRemoveSubItem={handleInlineRevenueRemoveSub}
                            pinned
                            hideTypeBadge
                            hideAddSubButton={!inlineEditId}
                            allowRemoveSubItem={!!inlineEditId}
                            isExpanded={isExpanded('__revenue__')}
                            onToggleExpand={() => toggleExpanded('__revenue__')}
                            onInlineAddSubItem={inlineEditId
                              ? catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })
                              : undefined}
                            columnSubtotalOverride={revenueColumnOverride}
                            sumTone="neutral"
                          />
                        ) : (
                          renderFlatMainRow('Revenue', 'revenue', '__revenue__')
                        )}

                        {/* COGS — block when breakdown exists, flat editable row when not */}
                        {rawCogsSubItems.length > 0 ? (
                          <CustomCategoryBlock
                            key="pinned-cogs"
                            category={cogsCategory}
                            columns={columns}
                            showGrandTotal={showGrandTotal}
                            getAmount={getCogsSubAmount}
                            onAmountChange={(columnKey, _catId, subId, value) => {
                              if (inlineEditId !== columnKey) return
                              handleInlineChange(`cogsSub:${subId}`, value)
                            }}
                            onRemoveCategory={() => {}}
                            onAddSubItem={() => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: '__cogs__' })}
                            onRemoveSubItem={handleInlineCogsRemoveSub}
                            pinned
                            hideTypeBadge
                            hideAddSubButton={!inlineEditId}
                            allowRemoveSubItem={!!inlineEditId}
                            isExpanded={isExpanded('__cogs__')}
                            onToggleExpand={() => toggleExpanded('__cogs__')}
                            onInlineAddSubItem={inlineEditId
                              ? catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })
                              : undefined}
                            columnSubtotalOverride={cogsColumnOverride}
                            sumTone="expense"
                          />
                        ) : (
                          renderFlatMainRow('COGS', 'cogs', '__cogs__')
                        )}

                        {renderComputedRow({ label: 'Gross Profit', key: 'grossProfit', bold: true, className: 'text-green-700' })}

                        {/* Operating Expenses — always a pinned accordion block */}
                        <CustomCategoryBlock
                          key="pinned-opex"
                          category={applySubItemOrder(opexCategory, rowOrder?.customSubItems?.['__opex__'])}
                          columns={columns}
                          showGrandTotal={showGrandTotal}
                          getAmount={getOpexAmount}
                          onAmountChange={(columnKey, _catId, subId, value) => {
                            if (inlineEditId !== columnKey) return
                            handleInlineChange(`opex:${subId}`, value)
                          }}
                          onRemoveCategory={() => {}}
                          onAddSubItem={() => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: '__opex__' })}
                          onRemoveSubItem={(_catId, subId) => {
                            // Opex can be removed during inline edit. Strip from inlineData.
                            setInlineData(prev => {
                              const { [`opex:${subId}`]: _removed, ...rest } = prev
                              void _removed
                              return recalcPnl(rest, inlineCategories)
                            })
                            setInlineAddedOpexNames(prev => prev.filter(n => n !== subId))
                          }}
                          onMoveSubItem={moveOpexSub}
                          pinned
                          hideTypeBadge
                          hideAddSubButton={!inlineEditId}
                          allowRemoveSubItem={!!inlineEditId}
                          isExpanded={isExpanded('__opex__')}
                          onToggleExpand={() => toggleExpanded('__opex__')}
                          onInlineAddSubItem={inlineEditId
                            ? catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })
                            : undefined}
                          columnSubtotalOverride={opexColumnOverride}
                          sumTone="expense"
                        />

                        {renderComputedRow({ label: 'Operating Profit', key: 'operatingProfit', bold: true })}

                        {/* Custom income/expense category blocks */}
                        {bodyOrder.map((entry, bodyIdx) => {
                          const isFirstInBody = bodyIdx === 0
                          const isLastInBody = bodyIdx === bodyOrder.length - 1
                          const cat = catById.get(entry.id)
                          if (!cat) return null
                          const ordered = applySubItemOrder(cat, rowOrder?.customSubItems?.[cat.id])
                          return (
                            <CustomCategoryBlock
                              key={`body-cat-${cat.id}`}
                              category={ordered}
                              columns={columns}
                              showGrandTotal={showGrandTotal}
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
                              isExpanded={isExpanded(cat.id)}
                              onToggleExpand={() => toggleExpanded(cat.id)}
                              onInlineAddSubItem={inlineEditId
                                ? catId => setAddDialog({ open: true, lockedMode: 'sub', presetParentId: catId })
                                : undefined}
                              hideAddSubButton={!inlineEditId}
                              allowRemoveSubItem={!!inlineEditId}
                            />
                          )
                        })}

                        {renderEditableRow({ label: 'Interest', key: 'interest', className: 'text-red-600' })}
                        {renderEditableRow({ label: 'Taxes', key: 'taxes', className: 'text-red-600' })}

                        {renderComputedRow({ label: 'Net Profit', key: 'netProfit', bold: true })}
                      </tbody>
                      {inlineEditId && (
                        <tfoot>
                          <tr>
                            <td colSpan={sorted.length + 1} className="px-4 py-2 border-t">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAddDialog({ open: true, lockedMode: 'main' })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Tambah Kategori Utama
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
            <DialogTitle>Input Laporan PnL</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Periode</Label>
                <MonthYearPicker value={watch('period')} onChange={(v) => setValue('period', v)} />
              </div>
              {(() => {
                // If this report already has a COGS breakdown, the flat input would
                // silently nuke it — lock it down and direct the user to the inline
                // edit flow.
                const cogsLocked = (editingReport?.extractedData as PnLExtractedData | undefined)
                  ?.cogsSubItems?.length
                  ? true
                  : false
                return ([
                  ['revenue', 'Revenue (IDR)', false],
                  ['cogs', 'COGS (IDR)', cogsLocked],
                  ['grossProfit', 'Gross Profit (IDR)', true],
                  ['totalOpex', 'Total Opex (IDR)', true],
                  ['operatingProfit', 'Operating Profit (IDR)', true],
                  ['interest', 'Interest (IDR)', false],
                  ['taxes', 'Taxes (IDR)', false],
                  ['netProfit', 'Net Profit (IDR)', true],
                ] as [keyof PnLExtractedData, string, boolean][]).map(([field, label, readOnly]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      {...register(field, { valueAsNumber: true })}
                      type="number"
                      readOnly={readOnly}
                      className={`text-sm ${readOnly ? 'bg-muted cursor-not-allowed' : ''}`}
                    />
                    {field === 'cogs' && cogsLocked && (
                      <p className="text-[10px] text-muted-foreground">
                        Edit breakdown COGS lewat tabel riwayat (inline edit).
                      </p>
                    )}
                  </div>
                ))
              })()}
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
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AddCustomCategoryDialog
        open={addDialog.open}
        onOpenChange={open => setAddDialog(prev => ({ ...prev, open }))}
        onSubmit={handleInlineDialogSubmit}
        lockedMode={addDialog.lockedMode}
        presetParentId={addDialog.presetParentId}
        existingMainCategories={[
          { id: '__revenue__', name: 'Revenue', type: 'income', subItems: inlineRevenueSubItems },
          { id: '__cogs__', name: 'COGS', type: 'expense', subItems: inlineCogsSubItems },
          {
            id: '__opex__',
            name: 'Operating Expenses',
            type: 'expense',
            subItems: [
              ...new Set([
                ...reports.flatMap(r => {
                  const d = r.extractedData as PnLExtractedData
                  return (d.opex ?? []).map(o => o.name)
                }),
                ...inlineAddedOpexNames,
              ]),
            ].map(n => ({ id: n, name: n, amount: 0 })),
          },
          ...inlineCategories,
        ]}
      />

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Semua Data PnL?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tindakan ini akan menghapus <strong>seluruh {reports.length} laporan PnL</strong> secara permanen dan tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={isResetting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleResetAll} disabled={isResetting}>
              {isResetting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Hapus Semua
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
