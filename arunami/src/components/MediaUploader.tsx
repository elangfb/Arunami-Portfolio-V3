import { useDropzone } from 'react-dropzone'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportMedia } from '@/types'

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

interface MediaUploaderProps {
  media: ReportMedia[]
  onUpload: (file: File) => void
  onRemove: (id: string) => void
  uploading: boolean
  /** 0–100 while a file is in flight; null when idle or progress is unknown. */
  progress?: number | null
  disabled?: boolean
}

export default function MediaUploader({
  media, onUpload, onRemove, uploading, progress, disabled,
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
                <img src={m.fileUrl} alt={m.fileName} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                // preload="metadata" so opening a report fetches the poster frame,
                // not the whole video — playback bytes are only pulled on play.
                <video
                  src={m.fileUrl}
                  title={m.fileName}
                  controls
                  preload="metadata"
                  className="h-full w-full bg-black object-contain"
                />
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
          {uploading
            ? `Mengunggah${progress != null ? ` ${progress}%` : '...'}`
            : isDragActive ? 'Lepaskan di sini...' : 'Tambah foto / video'}
        </p>
        {uploading ? (
          <div className="w-full max-w-xs space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-500 transition-[width] duration-200"
                // Indeterminate until the first progress event lands.
                style={{ width: progress != null ? `${progress}%` : '10%' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Video besar bisa makan beberapa menit — jangan tutup halaman ini.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Foto atau video — maks 50MB. Bisa pilih beberapa.</p>
        )}
      </div>
    </div>
  )
}
