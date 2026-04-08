import { useState, useCallback, useEffect } from 'react'
import { FileText, TrendingUp, Check, Loader2, Circle, AlertCircle, Bot, ClipboardList, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import FileDropZone from '@/components/FileDropZone'
import { extractPortfolioSetup } from '@/lib/gemini'
import type { ExtractionStage, PortfolioSetupExtraction, IndustryType } from '@/types'

interface StepUploadDocumentsProps {
  industryType: IndustryType
  onExtractionComplete: (result: PortfolioSetupExtraction) => void
  hasExtraction: boolean
  // Grace period mode props
  gracePeriod?: boolean
  graceMgmtFile?: File | null
  graceNoteFile?: File | null
  onGraceMgmtFile?: (f: File | null) => void
  onGraceNoteFile?: (f: File | null) => void
  onProcessingChange?: (processing: boolean) => void
}

const STAGE_LABELS: Record<string, string> = {
  reading_pnl: 'Membaca file PnL',
  extracting_pnl: 'Mengekstrak data keuangan',
  reading_projection: 'Membaca file Proyeksi',
  extracting_projection: 'Mengekstrak data proyeksi',
  classifying: 'Mengidentifikasi variabel unik',
}

function getStageOrder(hasPnl: boolean, hasProjection: boolean): string[] {
  const stages: string[] = []
  if (hasPnl) stages.push('reading_pnl', 'extracting_pnl')
  if (hasProjection) stages.push('reading_projection', 'extracting_projection')
  stages.push('classifying')
  return stages
}

function StageIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') return <Check className="h-5 w-5 text-green-600" />
  if (state === 'active') return <Loader2 className="h-5 w-5 animate-spin text-green-600" />
  return <Circle className="h-5 w-5 text-gray-300" />
}

export default function StepUploadDocuments({
  industryType,
  onExtractionComplete,
  hasExtraction,
  gracePeriod = false,
  graceMgmtFile,
  graceNoteFile,
  onGraceMgmtFile,
  onGraceNoteFile,
  onProcessingChange,
}: StepUploadDocumentsProps) {
  const [pnlFile, setPnlFile] = useState<File | null>(null)
  const [projectionFile, setProjectionFile] = useState<File | null>(null)
  const [stage, setStage] = useState<ExtractionStage>('idle')
  const [error, setError] = useState<string | null>(null)

  const isProcessing = stage !== 'idle' && stage !== 'done' && stage !== 'error'
  const hasFiles = pnlFile !== null || projectionFile !== null

  useEffect(() => { onProcessingChange?.(isProcessing) }, [isProcessing, onProcessingChange])

  // ─── Grace Period Mode ──────────────────────────────────────────────
  if (gracePeriod) {
    const hasBothFiles = graceMgmtFile != null && graceNoteFile != null
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            Upload Dokumen Grace Period
          </CardTitle>
          <CardDescription>
            Proyek dalam grace period — upload <strong>Management Report</strong> dan <strong>Arunami Note</strong> sebagai pengganti laporan PnL dan Proyeksi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FileDropZone
              label="Management Report"
              sublabel="Laporan manajemen periode terakhir (wajib)"
              file={graceMgmtFile ?? null}
              onFile={f => onGraceMgmtFile?.(f)}
              onRemove={() => onGraceMgmtFile?.(null)}
              disabled={false}
              icon={<ClipboardList className="h-6 w-6 text-amber-500" />}
            />
            <FileDropZone
              label="Arunami Note"
              sublabel="Catatan internal Arunami (wajib)"
              file={graceNoteFile ?? null}
              onFile={f => onGraceNoteFile?.(f)}
              onRemove={() => onGraceNoteFile?.(null)}
              disabled={false}
              icon={<StickyNote className="h-6 w-6 text-amber-500" />}
            />
          </div>

          {!hasBothFiles && (
            <div className="rounded-md bg-amber-50 p-3">
              <p className="text-sm text-amber-700">
                Kedua dokumen wajib diupload untuk melanjutkan ke langkah berikutnya.
              </p>
            </div>
          )}

          {hasBothFiles && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="flex items-center gap-2 text-sm text-green-700">
                <Check className="h-4 w-4" />
                Semua dokumen grace period sudah lengkap.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Normal Mode ────────────────────────────────────────────────────

  const handleProcess = useCallback(async () => {
    if (!hasFiles) return

    setError(null)
    setStage('reading_pnl')

    try {
      const result = await extractPortfolioSetup(
        pnlFile,
        projectionFile,
        industryType,
        (s) => setStage(s as ExtractionStage),
      )

      // Check for per-file errors
      const { errors, ...extraction } = result
      const errorMessages: string[] = []
      if (errors.pnl) errorMessages.push(errors.pnl)
      if (errors.projection) errorMessages.push(errors.projection)

      // If both failed, treat as full error
      if (pnlFile && errors.pnl && projectionFile && errors.projection) {
        setStage('error')
        setError(errorMessages.join('\n'))
        return
      }

      // Partial success — show warnings but proceed
      if (errorMessages.length > 0) {
        toast.warning(errorMessages.join(' | '))
      }

      setStage('done')
      toast.success('Data berhasil diekstrak! Silakan review di langkah berikutnya.')
      onExtractionComplete(extraction)
    } catch (err) {
      console.error('Extraction failed:', err)
      setStage('error')
      setError('Gagal mengekstrak data. Pastikan dokumen berisi data keuangan yang valid.')
    }
  }, [pnlFile, projectionFile, industryType, hasFiles, onExtractionComplete])

  const handleRetry = () => {
    setStage('idle')
    setError(null)
  }

  // Processing / done / error states
  if (stage !== 'idle') {
    const stageOrder = getStageOrder(!!pnlFile, !!projectionFile)
    const currentIdx = stage === 'done'
      ? stageOrder.length
      : stage === 'error'
        ? stageOrder.indexOf(stage) === -1 ? stageOrder.length - 1 : stageOrder.indexOf(stage)
        : stageOrder.indexOf(stage)

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {stage === 'done' ? 'Ekstraksi Selesai' : stage === 'error' ? 'Terjadi Kesalahan' : 'Memproses dokumen dengan AI...'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {stageOrder.map((s, i) => {
              let state: 'done' | 'active' | 'pending' = 'pending'
              if (stage === 'error' && i === currentIdx) state = 'active'
              else if (i < currentIdx) state = 'done'
              else if (i === currentIdx) state = 'active'

              return (
                <div key={s} className="flex items-center gap-3">
                  {stage === 'error' && i === currentIdx
                    ? <AlertCircle className="h-5 w-5 text-red-500" />
                    : <StageIcon state={state} />
                  }
                  <span className={
                    state === 'done' ? 'text-sm text-green-700' :
                    state === 'active' ? 'text-sm font-medium' :
                    'text-sm text-gray-400'
                  }>
                    {STAGE_LABELS[s] ?? s}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${stage === 'error' ? 'bg-red-500' : 'bg-green-600'}`}
                style={{ width: `${stage === 'done' ? 100 : (currentIdx / stageOrder.length) * 100}%` }}
              />
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {stage === 'done' ? stageOrder.length : Math.max(0, currentIdx)}/{stageOrder.length}
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {(stage === 'error' || stage === 'done') && (
              <Button variant="outline" onClick={handleRetry}>
                {stage === 'error' ? 'Coba Lagi' : 'Upload Ulang'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Upload state
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Dokumen Keuangan</CardTitle>
        <CardDescription>
          Upload file PnL dan/atau Proyeksi keuangan. AI akan mengekstrak data secara otomatis.
          {hasExtraction && (
            <span className="ml-1 font-medium text-green-600">
              Data sudah diekstrak — upload ulang untuk memperbarui.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FileDropZone
            label="Laporan Laba Rugi (PnL)"
            sublabel="Laporan aktual periode terakhir"
            file={pnlFile}
            onFile={setPnlFile}
            onRemove={() => setPnlFile(null)}
            disabled={isProcessing}
            icon={<FileText className="h-6 w-6 text-blue-500" />}
          />
          <FileDropZone
            label="Proyeksi Keuangan"
            sublabel="Forecasting / rencana keuangan"
            file={projectionFile}
            onFile={setProjectionFile}
            onRemove={() => setProjectionFile(null)}
            disabled={isProcessing}
            icon={<TrendingUp className="h-6 w-6 text-purple-500" />}
          />
        </div>

        <div className="flex justify-center">
          <Button
            onClick={handleProcess}
            disabled={!hasFiles || isProcessing}
            className="bg-green-600 hover:bg-green-700"
            size="lg"
          >
            <Bot className="mr-2 h-4 w-4" />
            Proses dengan AI
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
