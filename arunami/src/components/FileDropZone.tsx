import { useDropzone } from 'react-dropzone'
import { FileText, FileSpreadsheet, X, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileDropZoneProps {
  label: string
  sublabel?: string
  file: File | null
  onFile: (file: File) => void
  onRemove: () => void
  disabled?: boolean
  icon?: React.ReactNode
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500" />
  return <FileSpreadsheet className="h-5 w-5 text-green-600" />
}

export default function FileDropZone({
  label,
  sublabel,
  file,
  onFile,
  onRemove,
  disabled,
  icon,
}: FileDropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled,
    onDrop: (accepted) => {
      if (accepted.length > 0) onFile(accepted[0])
    },
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0]
      if (err?.code === 'file-too-large') {
        alert('File maksimal 10MB')
      } else if (err?.code === 'file-invalid-type') {
        alert('Format file tidak didukung. Gunakan PDF, XLSX, atau CSV.')
      }
    },
  })

  if (file) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-green-300 bg-green-50 p-6">
        <div className="flex items-center gap-3 rounded-md bg-white px-4 py-2 shadow-sm">
          {getFileIcon(file.name)}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="ml-2 rounded-full p-1 hover:bg-gray-100"
            disabled={disabled}
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        isDragActive
          ? 'border-green-500 bg-green-50'
          : 'border-gray-300 hover:border-green-400 hover:bg-gray-50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        {icon ?? <Upload className="h-6 w-6 text-gray-400" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        {isDragActive ? 'Lepaskan file di sini...' : 'Drag & drop atau klik'}
      </p>
      <p className="text-xs text-muted-foreground">PDF, XLSX, CSV — maks 10MB</p>
    </div>
  )
}
