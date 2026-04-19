import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'
import {
  getManagementReports, saveManagementReport, updateManagementReport, deleteManagementReport,
  getReports, getNotes,
} from '@/lib/firestore'
import { generateManagementReport, refineBusinessSummary } from '@/lib/gemini'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PlusCircle, Trash2, Sparkles, Pencil, Copy, Wand2 } from 'lucide-react'
import type {
  ManagementReport, IssueSeverity, ActionStatus, ActionCategory, Portfolio,
  PnLExtractedData, ProjectionExtractedData,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const severityBadgeClass = (s: IssueSeverity) =>
  s === 'high'
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : s === 'medium'
    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'

const statusBadgeClass = (s: ActionStatus) =>
  s === 'done'
    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
    : s === 'in_progress'
    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
    : 'bg-muted text-foreground/80 hover:bg-muted/80'

const statusLabel = (s: ActionStatus) =>
  s === 'done' ? 'Done' : s === 'in_progress' ? 'In Progress' : 'Pending'

type FormData = Omit<ManagementReport, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

export default function ManagementPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [reports, setReports] = useState<ManagementReport[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Refine Summary state
  const [refinePeriod, setRefinePeriod] = useState('')
  const [refineDraft, setRefineDraft] = useState('')
  const [refineResult, setRefineResult] = useState('')
  const [refining, setRefining] = useState(false)

  const defaultFormValues: FormData = {
    period: '', businessSummary: '',
    issues: [{ id: crypto.randomUUID(), title: '', severity: 'medium', description: '' }],
    actionItems: [{ id: crypto.randomUUID(), title: '', status: 'pending', assignee: '', dueDate: '', category: 'business' }],
  }

  const { register, handleSubmit, control, reset, setValue, watch } = useForm<FormData>({
    defaultValues: defaultFormValues,
  })

  const { fields: issueFields, append: appendIssue, remove: removeIssue } = useFieldArray({ control, name: 'issues' })
  const { fields: actionFields, append: appendAction, remove: removeAction } = useFieldArray({ control, name: 'actionItems' })

  const fetchReports = async () => {
    if (!portfolioId) return
    const data = await getManagementReports(portfolioId)
    setReports(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
  }

  useEffect(() => { fetchReports() }, [portfolioId])

  const onSubmit = async (data: FormData) => {
    if (!portfolioId || !user) return
    setSaving(true)
    try {
      if (editingId) {
        await updateManagementReport(portfolioId, editingId, data)
        toast.success('Report diperbarui')
      } else {
        await saveManagementReport(portfolioId, { ...data, createdBy: user.uid })
        toast.success('Management report berhasil disimpan')
      }
      closeDialog(); fetchReports()
    } catch {
      toast.error(editingId ? 'Gagal memperbarui report' : 'Gagal menyimpan report')
    } finally {
      setSaving(false)
    }
  }

  const openEditDialog = (r: ManagementReport) => {
    reset({
      period: r.period,
      businessSummary: r.businessSummary,
      issues: r.issues.length > 0 ? r.issues : defaultFormValues.issues,
      actionItems: r.actionItems.length > 0 ? r.actionItems : defaultFormValues.actionItems,
    })
    setEditingId(r.id)
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setEditingId(null)
    reset(defaultFormValues)
  }

  const handleDelete = async (id: string) => {
    if (!portfolioId) return
    try {
      await deleteManagementReport(portfolioId, id)
      toast.success('Report dihapus')
      fetchReports()
    } catch {
      toast.error('Gagal menghapus report')
    }
  }

  const patchIssueSeverity = async (reportId: string, issueId: string, severity: IssueSeverity) => {
    if (!portfolioId) return
    const current = reports.find(r => r.id === reportId)
    if (!current) return
    const nextIssues = current.issues.map(i => i.id === issueId ? { ...i, severity } : i)
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, issues: nextIssues } : r))
    try {
      await updateManagementReport(portfolioId, reportId, { issues: nextIssues })
    } catch {
      toast.error('Gagal update severity')
      fetchReports()
    }
  }

  const patchActionStatus = async (reportId: string, actionId: string, status: ActionStatus) => {
    if (!portfolioId) return
    const current = reports.find(r => r.id === reportId)
    if (!current) return
    const nextActions = current.actionItems.map(a => a.id === actionId ? { ...a, status } : a)
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, actionItems: nextActions } : r))
    try {
      await updateManagementReport(portfolioId, reportId, { actionItems: nextActions })
    } catch {
      toast.error('Gagal update status')
      fetchReports()
    }
  }

  /**
   * AI-generate a Portfolio Management report for the latest P&L period.
   * Analyzes P&L vs projection and produces business summary, issues, and
   * action items in Bahasa Indonesia, then saves as a ManagementReport.
   */
  const handleGenerateReport = async () => {
    if (!portfolioId || !user || !portfolio) return
    setGenerating(true)
    try {
      const [pnls, projs, notes] = await Promise.all([
        getReports(portfolioId, 'pnl'),
        getReports(portfolioId, 'projection'),
        getNotes(portfolioId),
      ])
      if (pnls.length === 0) {
        toast.error('Belum ada data PnL. Upload PnL terlebih dahulu.')
        setGenerating(false)
        return
      }

      // Pick the latest P&L period
      const sortedPnl = [...pnls].sort((a, b) => comparePeriods(a.period, b.period))
      const latestPnl = sortedPnl.at(-1)!
      const prevPnl = sortedPnl.at(-2)
      const matchingProj = projs.find(p => p.period === latestPnl.period)

      toast.info('AI sedang menganalisis data...')
      const generated = await generateManagementReport({
        period: latestPnl.period,
        pnl: latestPnl.extractedData as PnLExtractedData,
        projection: matchingProj ? (matchingProj.extractedData as ProjectionExtractedData) : null,
        previousPnl: prevPnl ? (prevPnl.extractedData as PnLExtractedData) : null,
        portfolioName: portfolio.name,
        arunamiNotes: notes.map(n => n.content).filter(Boolean),
      })

      await saveManagementReport(portfolioId, {
        period: latestPnl.period,
        businessSummary: generated.businessSummary,
        issues: [],
        actionItems: [],
        createdBy: user.uid,
      })

      toast.success(`Summary untuk ${formatPeriod(latestPnl.period)} berhasil dibuat. Tambahkan isu & action items via tombol edit.`)
      fetchReports()
    } catch (err) {
      console.error(err)
      toast.error('Gagal membuat report dengan AI')
    } finally {
      setGenerating(false)
    }
  }

  /**
   * Refine a user-drafted business summary so its tone matches the rest of
   * the report suite. Loads PnL + projection for the selected period (if
   * available) so the AI can preserve facts without inventing new ones.
   */
  const handleRefineSummary = async () => {
    if (!portfolioId || !portfolio) return
    if (!refineDraft.trim()) {
      toast.error('Masukkan draf summary terlebih dahulu')
      return
    }
    if (!refinePeriod) {
      toast.error('Pilih periode terlebih dahulu')
      return
    }
    setRefining(true)
    try {
      const [pnls, projs] = await Promise.all([
        getReports(portfolioId, 'pnl'),
        getReports(portfolioId, 'projection'),
      ])
      const matchingPnl = pnls.find(p => p.period === refinePeriod)
      const matchingProj = projs.find(p => p.period === refinePeriod)

      const result = await refineBusinessSummary({
        draft: refineDraft,
        period: refinePeriod,
        pnl: matchingPnl ? (matchingPnl.extractedData as PnLExtractedData) : null,
        projection: matchingProj ? (matchingProj.extractedData as ProjectionExtractedData) : null,
        portfolioName: portfolio.name,
      })
      setRefineResult(result.refinedSummary)
      toast.success('Summary berhasil di-refine')
    } catch (err) {
      console.error(err)
      toast.error('Gagal me-refine summary')
    } finally {
      setRefining(false)
    }
  }

  const handleCopyRefined = async () => {
    if (!refineResult) return
    try {
      await navigator.clipboard.writeText(refineResult)
      toast.success('Disalin ke clipboard')
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Portfolio Management</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerateReport} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? 'Menganalisis...' : 'Generate Report with AI'}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); else setOpen(true) }}>
            <DialogTrigger asChild>
              <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Buat Report</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Portfolio Management Report' : 'Buat Portfolio Management Report'}</DialogTitle>
              </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Periode</Label>
                  <MonthYearPicker value={watch('period')} onChange={(v) => setValue('period', v)} disabled={!!editingId} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Business Summary</Label>
                <Textarea rows={3} placeholder="Ringkasan kinerja bisnis..." {...register('businessSummary')} />
              </div>

              {/* Issues */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Isu ({issueFields.length})</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => appendIssue({ id: crypto.randomUUID(), title: '', severity: 'medium', description: '' })}>
                    <PlusCircle className="h-3 w-3 mr-1" />Tambah
                  </Button>
                </div>
                {issueFields.map((field, i) => (
                  <div key={field.id} className="border rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input placeholder="Judul isu" {...register(`issues.${i}.title`)} className="flex-1 text-sm" />
                      <Select value={watch(`issues.${i}.severity`) ?? 'medium'} onValueChange={v => setValue(`issues.${i}.severity`, v as IssueSeverity)}>
                        <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeIssue(i)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <Input placeholder="Deskripsi isu" {...register(`issues.${i}.description`)} className="text-sm" />
                  </div>
                ))}
              </div>

              {/* Action Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Action Items ({actionFields.length})</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => appendAction({ id: crypto.randomUUID(), title: '', status: 'pending', assignee: '', dueDate: '', category: 'business' })}>
                    <PlusCircle className="h-3 w-3 mr-1" />Tambah
                  </Button>
                </div>
                {actionFields.map((field, i) => (
                  <div key={field.id} className="border rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input placeholder="Judul action" {...register(`actionItems.${i}.title`)} className="flex-1 text-sm" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeAction(i)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={watch(`actionItems.${i}.status`) ?? 'pending'} onValueChange={v => setValue(`actionItems.${i}.status`, v as ActionStatus)}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={watch(`actionItems.${i}.category`) ?? 'business'} onValueChange={v => setValue(`actionItems.${i}.category`, v as ActionCategory)}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="operational">Operational</SelectItem>
                          <SelectItem value="financial">Financial</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="date" {...register(`actionItems.${i}.dueDate`)} className="text-xs" />
                    </div>
                    <Input placeholder="PIC / Assignee" {...register(`actionItems.${i}.assignee`)} className="text-sm" />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Batal</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan'}</Button>
              </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            Refine Summary
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tulis draf summary, pilih periode, dan AI akan menyelaraskan nada bahasanya dengan laporan lain. Fakta & angka dari draf tetap dipertahankan.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Periode</Label>
              <MonthYearPicker value={refinePeriod} onChange={setRefinePeriod} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Draf Summary</Label>
            <Textarea
              rows={4}
              placeholder="Tulis atau tempel draf business summary di sini..."
              value={refineDraft}
              onChange={e => setRefineDraft(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleRefineSummary} disabled={refining}>
              <Sparkles className="mr-2 h-4 w-4" />
              {refining ? 'Merefine...' : 'Refine dengan AI'}
            </Button>
          </div>
          {refineResult && (
            <div className="space-y-1 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Hasil Refine</Label>
                <Button size="sm" variant="ghost" onClick={handleCopyRefined}>
                  <Copy className="mr-2 h-3 w-3" />
                  Copy
                </Button>
              </div>
              <Textarea rows={4} value={refineResult} readOnly className="bg-muted/30" />
            </div>
          )}
        </CardContent>
      </Card>

      {reports.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada management report</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div>
                  <CardTitle className="text-base">{formatPeriod(r.period)}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.businessSummary}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEditDialog(r)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {r.issues.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">ISU</p>
                    <div className="space-y-1.5">
                      {r.issues.map(issue => (
                        <div key={issue.id} className="flex items-center gap-2">
                          <Select value={issue.severity} onValueChange={v => patchIssueSeverity(r.id, issue.id, v as IssueSeverity)}>
                            <SelectTrigger className={`h-6 w-20 rounded-full border-0 px-2.5 text-xs font-medium capitalize gap-1 [&>svg]:h-3 [&>svg]:w-3 ${severityBadgeClass(issue.severity)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm">{issue.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">ACTION ITEMS</p>
                    <div className="space-y-1.5">
                      {r.actionItems.map(action => (
                        <div key={action.id} className="flex items-center gap-2">
                          <Select value={action.status} onValueChange={v => patchActionStatus(r.id, action.id, v as ActionStatus)}>
                            <SelectTrigger className={`h-6 w-28 rounded-full border-0 px-2.5 text-xs font-medium gap-1 [&>svg]:h-3 [&>svg]:w-3 ${statusBadgeClass(action.status)}`}>
                              <span>{statusLabel(action.status)}</span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm">{action.title}</span>
                          {action.assignee && <span className="text-xs text-muted-foreground">· {action.assignee}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
