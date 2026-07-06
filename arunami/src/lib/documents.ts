import type { DocumentCategory } from '@/types'

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  kontrak: 'Kontrak',
  laporan: 'Laporan',
  legal: 'Legal',
  lainnya: 'Lainnya',
}

export const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
