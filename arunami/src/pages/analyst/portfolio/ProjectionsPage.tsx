import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { extractProjection } from '@/lib/gemini'
import { getReports, saveReport } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyExact } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, Loader2 } from 'lucide-react'
import type { ProjectionExtractedData, PortfolioReport, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }
type Step = 'idle' | 'extracting' | 'review' | 'saving'

export default function ProjectionsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [reports, setReports] = useState<PortfolioReport[]>([])
  const { register, handleSubmit, reset, setValue } = useForm<ProjectionExtractedData>()

  const fetchReports = async () => {
    if (!portfolioId) return
    const data = await getReports(portfolioId, 'projection')
    setReports(data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds))
  }

  useEffect(() => { fetchReports() }, [portfolioId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File maksimal 10MB'); return }
    setStep('extracting')
    try {
      const data = await extractProjection(file)
      Object.entries(data).forEach(([k, v]) => setValue(k as keyof ProjectionExtractedData, v as never))
      setStep('review')
      toast.success('Data proyeksi berhasil diekstrak')
    } catch {
      toast.error('Gagal mengekstrak data')
      setStep('idle')
    }
  }

  const onSave = async (data: ProjectionExtractedData) => {
    if (!portfolioId || !user) return
    setIsSaving(true)
    try {
      await saveReport(portfolioId, {
        type: 'projection',
        fileName: fileRef.current?.files?.[0]?.name ?? 'proyeksi.pdf',
        fileUrl: '',
        period: data.period,
        extractedData: data,
        uploadedBy: user.uid,
        createdAt: null as never,
      })
      toast.success('Proyeksi berhasil disimpan')
      reset(); setStep('idle'); fetchReports()
    } catch {
      toast.error('Gagal menyimpan proyeksi')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Upload Proyeksi Plan</h2>

      <Card>
        <CardContent className="pt-6">
          {step === 'idle' ? (
            <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-10 cursor-pointer hover:border-[#38a169] hover:bg-[#38a169]/5 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Upload Dokumen Proyeksi</p>
                <p className="text-sm text-muted-foreground mt-1">PDF, Excel (.xlsx), atau CSV — maks. 10MB</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            </label>
          ) : step === 'extracting' ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-10 w-10 animate-spin text-[#38a169]" />
              <p className="font-medium">Menganalisis dokumen proyeksi...</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {step === 'review' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Review Data Proyeksi</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSave)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {([
                  ['period', 'Periode'],
                  ['projectedRevenue', 'Projected Revenue (IDR)'],
                  ['projectedCogs', 'Projected COGS (IDR)'],
                  ['projectedGrossProfit', 'Projected Gross Profit (IDR)'],
                  ['projectedTotalOpex', 'Projected Total Opex (IDR)'],
                  ['projectedNetProfit', 'Projected Net Profit (IDR)'],
                ] as [keyof ProjectionExtractedData, string][]).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input {...register(field)} className="text-sm" />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Asumsi</Label>
                <Input {...register('assumptions')} className="text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep('idle')}>Batal</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan...' : 'Simpan Proyeksi'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Proyeksi ({reports.length})</CardTitle></CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada dokumen proyeksi</p>
          ) : (
            <div className="divide-y">
              {reports.map(r => {
                const d = r.extractedData as ProjectionExtractedData
                return (
                  <div key={r.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{r.period}</p>
                      <p className="text-xs text-muted-foreground">{r.fileName}</p>
                    </div>
                    <Badge variant="outline">Proyeksi: {formatCurrencyExact(d.projectedNetProfit)}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
