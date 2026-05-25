import { useDropzone } from 'react-dropzone'
import { Upload, X, Film, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportMedia } from '@/types'

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

interface MediaUploaderProps {
  media: ReportMedia[]
  onUpload: (file: File) => void
  onRemove: (id: string) => void
  uploading: boolean
  disabled?: boolean
}

export default function MediaUploader({
  media, onUpload, onRemove, uploading, disabled,
}: MediaUploaderProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [], 'video/*': [] },
    maxSize: MAX_SIZE,
    disabled: disabled || uploading,
    onDrop: accepted => accepted.forEach(onUpload),
    onDropRejected: rejections => {
      const err = rejections[0]?.errors[0]
      if (err?.code === 'file-too-large') {
        alert('File maksimal 50MB')
      } else if (err?.code === 'file-invalid-type') {
        alert('Hanya foto atau video yang didukung.')
      }
    },
  })

  return (
    <div className="space-y-3">
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map(m => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {m.type === 'image' ? (
                <img src={m.fileUrl} alt={m.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <Film className="h-6 w-6 text-muted-foreground" />
                  <span className="line-clamp-2 text-[10px] text-muted-foreground">{m.fileName}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                disabled={disabled}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50',
          (disabled || uploading) && 'cursor-not-allowed opacity-50',
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            : <Upload className="h-6 w-6 text-gray-400" />}
        </div>
        <p className="text-sm font-medium">
          {uploading ? 'Mengunggah...' : isDragActive ? 'Lepaskan di sini...' : 'Tambah foto / video'}
        </p>
        <p className="text-xs text-muted-foreground">Foto atau video — maks 50MB. Bisa pilih beberapa.</p>
      </div>
    </div>
  )
}
