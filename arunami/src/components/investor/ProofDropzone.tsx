import { useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileImage, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

const ALLOWED_TYPES = {
  'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}
const MAX_BYTES = 5 * 1024 * 1024

/** Shared file picker for transfer/bagi-hasil proofs — images + PDF, image preview inline. */
export default function ProofDropzone({
  file, onFile, label = 'Bukti Transfer',
}: {
  file: File | null
  onFile: (f: File | null) => void
  label?: string
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const isPdf = file?.type === 'application/pdf'

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: ALLOWED_TYPES, maxSize: MAX_BYTES, maxFiles: 1,
    onDrop: (accepted) => {
      const f = accepted[0] ?? null
      onFile(f)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(f && f.type !== 'application/pdf' ? URL.createObjectURL(f) : null)
    },
  })

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
  }

  const rejectionMessage = useMemo(() => {
    if (fileRejections.length === 0) return null
    const code = fileRejections[0].errors[0]?.code
    if (code === 'file-too-large') return 'Ukuran file melebihi 5 MB.'
    if (code === 'file-invalid-type') return 'Tipe file tidak didukung. Gunakan PNG, JPG, WEBP, atau PDF.'
    return 'File tidak valid.'
  }, [fileRejections])

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
          isDragActive ? 'border-[#2563eb] bg-blue-50/40' : 'border-slate-300 hover:border-slate-400',
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="space-y-2 w-full">
            {isPdf ? (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-md bg-slate-100">
                <FileText className="h-10 w-10 text-[#2563eb]" />
              </div>
            ) : (
              preview && <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-md object-contain" />
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              {isPdf ? <FileText className="h-3.5 w-3.5" /> : <FileImage className="h-3.5 w-3.5" />}
              <span className="truncate max-w-[16rem]">{file.name}</span>
              <button type="button" onClick={clear} className="text-red-500 hover:text-red-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-slate-400 mb-1" />
            <p className="text-sm text-slate-600">Tarik & lepas atau klik untuk pilih file</p>
            <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP, PDF · maks 5 MB</p>
          </>
        )}
      </div>
      {rejectionMessage && <p className="text-xs text-red-600">{rejectionMessage}</p>}
    </div>
  )
}
