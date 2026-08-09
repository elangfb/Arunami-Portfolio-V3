import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, PlusCircle, Trash2, Wand2 } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import { uploadReportMedia, deleteReportMedia, storageErrorMessage } from '@/lib/storage'
import MediaUploader from '@/components/MediaUploader'
import type { ManagementReport, Issue, ActionItem, IssueSeverity, ActionStatus, ActionCategory, ReportMedia } from '@/types'

export type ManagementFormData = Omit<ManagementReport, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

interface ReportEditorProps {
  mode: 'create' | 'edit'
  period: string // locked "YYYY-MM"
  portfolioId: string
  initial?: Pick<ManagementReport, 'businessSummary' | 'issues' | 'actionItems' | 'media'>
  saving: boolean
  /** Calls AI to refine the given draft, returns refined text or null on failure/empty. */
  onRefine: (draft: string) => Promise<string | null>
  onSubmit: (data: ManagementFormData) => void
  onCancel: () => void
}

const emptyIssue = (): Issue => ({ id: crypto.randomUUID(), title: '', severity: 'medium', description: '' })
const emptyAction = (): ActionItem => ({
  id: crypto.randomUUID(), title: '', status: 'pending', assignee: '', dueDate: '', category: 'business',
})

export function ReportEditor({ mode, period, portfolioId, initial, saving, onRefine, onSubmit, onCancel }: ReportEditorProps) {
  const [refining, setRefining] = useState(false)
  const [media, setMedia] = useState<ReportMedia[]>(initial?.media ?? [])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const { register, handleSubmit, control, setValue, watch, getValues } = useForm<ManagementFormData>({
    defaultValues: {
      period,
      businessSummary: initial?.businessSummary ?? '',
      issues: initial?.issues?.length ? initial.issues : [],
      actionItems: initial?.actionItems?.length ? initial.actionItems : [],
    },
  })

  const { fields: issueFields, append: appendIssue, remove: removeIssue } = useFieldArray({ control, name: 'issues' })
  const { fields: actionFields, append: appendAction, remove: removeAction } = useFieldArray({ control, name: 'actionItems' })

  const handleRefine = async () => {
    const draft = getValues('businessSummary')?.trim()
    if (!draft) return
    setRefining(true)
    try {
      const refined = await onRefine(draft)
      if (refined) setValue('businessSummary', refined)
    } finally {
      setRefining(false)
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    setProgress(0)
    try {
      const uploaded = await uploadReportMedia(portfolioId, file, setProgress)
      setMedia(prev => [...prev, uploaded])
    } catch (err) {
      console.error(err)
      toast.error(`${file.name}: ${storageErrorMessage(err)}`)
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  const handleRemoveMedia = async (id: string) => {
    const item = media.find(m => m.id === id)
    if (!item) return
    setMedia(prev => prev.filter(m => m.id !== id))
    try {
      await deleteReportMedia(item.storagePath)
    } catch (err) {
      console.error(err)
      toast.error('Gagal menghapus media')
      setMedia(prev => [...prev, item])
    }
  }

  const submit = (data: ManagementFormData) => onSubmit({ ...data, period, media })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">{mode === 'edit' ? 'Edit Report' : 'Buat Report'}</h2>
          <p className="text-sm text-muted-foreground">{formatPeriod(period)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        {/* Business Summary + inline refine */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Business Summary</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={handleRefine} disabled={refining}>
                <Wand2 className="mr-2 h-4 w-4" />
                {refining ? 'Merefine...' : 'Refine dengan AI'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tulis ringkasan kinerja bisnis. AI menyelaraskan nada bahasanya tanpa mengubah fakta & angka.
            </p>
          </CardHeader>
          <CardContent>
            <Textarea rows={5} placeholder="Ringkasan kinerja bisnis..." {...register('businessSummary')} />
          </CardContent>
        </Card>

        {/* Issues */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Isu ({issueFields.length})</CardTitle>
              <Button type="button" size="sm" variant="ghost" onClick={() => appendIssue(emptyIssue())}>
                <PlusCircle className="h-4 w-4 mr-1" />Tambah
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {issueFields.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada isu. Klik "Tambah" untuk menambahkan.</p>
            )}
            {issueFields.map((field, i) => (
              <div key={field.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Judul isu" {...register(`issues.${i}.title`)} className="flex-1 text-sm" />
                  <Select
                    value={watch(`issues.${i}.severity`) ?? 'medium'}
                    onValueChange={v => setValue(`issues.${i}.severity`, v as IssueSeverity)}
                  >
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
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Action Items ({actionFields.length})</CardTitle>
              <Button type="button" size="sm" variant="ghost" onClick={() => appendAction(emptyAction())}>
                <PlusCircle className="h-4 w-4 mr-1" />Tambah
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionFields.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada action item. Klik "Tambah" untuk menambahkan.</p>
            )}
            {actionFields.map((field, i) => (
              <div key={field.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Judul action" {...register(`actionItems.${i}.title`)} className="flex-1 text-sm" />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeAction(i)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={watch(`actionItems.${i}.status`) ?? 'pending'}
                    onValueChange={v => setValue(`actionItems.${i}.status`, v as ActionStatus)}
                  >
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={watch(`actionItems.${i}.category`) ?? 'business'}
                    onValueChange={v => setValue(`actionItems.${i}.category`, v as ActionCategory)}
                  >
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
          </CardContent>
        </Card>

        {/* Lampiran / Dokumentasi */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lampiran / Dokumentasi ({media.length})</CardTitle>
            <p className="text-xs text-muted-foreground">
              Lampirkan foto atau video pendukung. Akan tampil di laporan yang dibagikan ke investor.
            </p>
          </CardHeader>
          <CardContent>
            <MediaUploader
              media={media}
              onUpload={handleUpload}
              onRemove={handleRemoveMedia}
              uploading={uploading}
              progress={progress}
              disabled={saving}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? 'Menyimpan...' : mode === 'edit' ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </div>
      </form>
    </div>
  )
}
