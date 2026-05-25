import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getManagementReports, saveManagementReport, updateManagementReport, deleteManagementReport,
  getReports, getNotes,
} from '@/lib/firestore'
import { generateManagementReport, refineBusinessSummary } from '@/lib/gemini'
import { useAuthStore } from '@/store/authStore'
import { comparePeriods } from '@/lib/dateUtils'
import { ManagementHome } from './management/ManagementHome'
import { ReportList } from './management/ReportList'
import { CreatePicker } from './management/CreatePicker'
import { ReportEditor, type ManagementFormData } from './management/ReportEditor'
import type {
  ManagementReport, IssueSeverity, ActionStatus, Portfolio,
  PortfolioReport, PnLExtractedData, ProjectionExtractedData,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

type View = 'home' | 'list' | 'pick' | 'editor'

interface EditorState {
  mode: 'create' | 'edit'
  period: string
  editingId: string | null
  origin: 'list' | 'pick'
  initial?: Pick<ManagementReport, 'businessSummary' | 'issues' | 'actionItems'>
}

export default function ManagementPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()

  const [view, setView] = useState<View>('home')
  const [reports, setReports] = useState<ManagementReport[]>([])
  const [pnlReports, setPnlReports] = useState<PortfolioReport[]>([])
  const [projReports, setProjReports] = useState<PortfolioReport[]>([])
  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)

  const pnlPeriods = useMemo(
    () => [...new Set(pnlReports.map(r => r.period))],
    [pnlReports],
  )
  const existingPeriods = useMemo(() => reports.map(r => r.period), [reports])

  const fetchAll = async () => {
    if (!portfolioId) return
    setLoading(true)
    try {
      const [mgmt, pnls, projs] = await Promise.all([
        getManagementReports(portfolioId),
        getReports(portfolioId, 'pnl'),
        getReports(portfolioId, 'projection'),
      ])
      setReports(mgmt.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
      setPnlReports(pnls)
      setProjReports(projs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [portfolioId])

  // ─── Editor ──────────────────────────────────────────────────────────────
  const openEdit = (r: ManagementReport, origin: 'list' | 'pick' = 'list') => {
    setEditor({
      mode: 'edit', period: r.period, editingId: r.id, origin,
      initial: { businessSummary: r.businessSummary, issues: r.issues, actionItems: r.actionItems },
    })
    setView('editor')
  }

  const startManual = (period: string) => {
    setEditor({ mode: 'create', period, editingId: null, origin: 'pick' })
    setView('editor')
  }

  const editExistingByPeriod = (period: string) => {
    const r = reports.find(x => x.period === period)
    if (r) openEdit(r, 'pick')
  }

  const handleGenerateAI = async (period: string) => {
    if (!portfolioId || !user || !portfolio) return
    setGenerating(true)
    try {
      const notes = await getNotes(portfolioId)
      const matchingPnl = pnlReports.find(p => p.period === period)
      if (!matchingPnl) {
        toast.error('Tidak ada data PnL untuk periode ini')
        return
      }
      const sortedPnl = [...pnlReports].sort((a, b) => comparePeriods(a.period, b.period))
      const idx = sortedPnl.findIndex(p => p.period === period)
      const prevPnl = idx > 0 ? sortedPnl[idx - 1] : undefined
      const matchingProj = projReports.find(p => p.period === period)

      toast.info('AI sedang menganalisis data...')
      const generated = await generateManagementReport({
        period,
        pnl: matchingPnl.extractedData as PnLExtractedData,
        projection: matchingProj ? (matchingProj.extractedData as ProjectionExtractedData) : null,
        previousPnl: prevPnl ? (prevPnl.extractedData as PnLExtractedData) : null,
        portfolioName: portfolio.name,
        arunamiNotes: notes.map(n => n.content).filter(Boolean),
      })

      setEditor({
        mode: 'create', period, editingId: null, origin: 'pick',
        initial: { businessSummary: generated.businessSummary, issues: [], actionItems: [] },
      })
      setView('editor')
    } catch (err) {
      console.error(err)
      toast.error('Gagal membuat report dengan AI')
    } finally {
      setGenerating(false)
    }
  }

  const handleEditorRefine = async (draft: string): Promise<string | null> => {
    if (!portfolioId || !portfolio || !editor) return null
    try {
      const matchingPnl = pnlReports.find(p => p.period === editor.period)
      const matchingProj = projReports.find(p => p.period === editor.period)
      const result = await refineBusinessSummary({
        draft,
        period: editor.period,
        pnl: matchingPnl ? (matchingPnl.extractedData as PnLExtractedData) : null,
        projection: matchingProj ? (matchingProj.extractedData as ProjectionExtractedData) : null,
        portfolioName: portfolio.name,
      })
      toast.success('Summary berhasil di-refine')
      return result.refinedSummary
    } catch (err) {
      console.error(err)
      toast.error('Gagal me-refine summary')
      return null
    }
  }

  const handleEditorSubmit = async (data: ManagementFormData) => {
    if (!portfolioId || !user || !editor) return
    setSaving(true)
    try {
      if (editor.editingId) {
        await updateManagementReport(portfolioId, editor.editingId, data)
        toast.success('Report diperbarui')
      } else {
        await saveManagementReport(portfolioId, { ...data, createdBy: user.uid })
        toast.success('Management report berhasil disimpan')
      }
      await fetchAll()
      setEditor(null)
      setView('list')
    } catch {
      toast.error(editor.editingId ? 'Gagal memperbarui report' : 'Gagal menyimpan report')
    } finally {
      setSaving(false)
    }
  }

  const cancelEditor = () => {
    const origin = editor?.origin ?? 'list'
    setEditor(null)
    setView(origin)
  }

  // ─── List actions ────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!portfolioId) return
    if (!window.confirm('Hapus report ini? Tindakan ini tidak dapat dibatalkan.')) return
    try {
      await deleteManagementReport(portfolioId, id)
      toast.success('Report dihapus')
      fetchAll()
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
      fetchAll()
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
      fetchAll()
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1e5f3f] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {view === 'home' && (
        <ManagementHome
          reportCount={reports.length}
          onView={() => setView('list')}
          onCreate={() => setView('pick')}
        />
      )}

      {view === 'list' && (
        <ReportList
          reports={reports}
          onBack={() => setView('home')}
          onCreate={() => setView('pick')}
          onEdit={r => openEdit(r, 'list')}
          onDelete={handleDelete}
          onPatchSeverity={patchIssueSeverity}
          onPatchStatus={patchActionStatus}
        />
      )}

      {view === 'pick' && (
        <CreatePicker
          pnlPeriods={pnlPeriods}
          existingPeriods={existingPeriods}
          generating={generating}
          onBack={() => setView('home')}
          onGenerateAI={handleGenerateAI}
          onManual={startManual}
          onEditExisting={editExistingByPeriod}
        />
      )}

      {view === 'editor' && editor && (
        <ReportEditor
          key={editor.editingId ?? `new-${editor.period}-${editor.initial ? 'ai' : 'manual'}`}
          mode={editor.mode}
          period={editor.period}
          initial={editor.initial}
          saving={saving}
          onRefine={handleEditorRefine}
          onSubmit={handleEditorSubmit}
          onCancel={cancelEditor}
        />
      )}
    </div>
  )
}
