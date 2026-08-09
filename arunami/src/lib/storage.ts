import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'
import type { ReportMedia } from '@/types'

/**
 * Uploads a photo/video for a management report to Firebase Storage and returns
 * the resulting ReportMedia metadata (persisted on the report doc in Firestore).
 */
export function uploadReportMedia(
  portfolioId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ReportMedia> {
  const id = crypto.randomUUID()
  const storagePath = `managementReports/${portfolioId}/${id}-${file.name}`
  const storageRef = ref(storage, storagePath)
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    // The path is UUID-prefixed, so a given URL's bytes never change: let the
    // browser keep them for a year instead of re-downloading a 50MB video on
    // every report view. `private` (not `public`) because these are investor-
    // confidential — browser cache only, no shared proxy.
    cacheControl: 'private, max-age=31536000, immutable',
  })

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      snapshot => {
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
        }
      },
      reject,
      async () => {
        try {
          const fileUrl = await getDownloadURL(task.snapshot.ref)
          resolve({
            id,
            type: file.type.startsWith('video') ? 'video' : 'image',
            fileName: file.name,
            fileUrl,
            fileSize: file.size,
            storagePath,
          })
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/**
 * Turns a Firebase Storage error into something an analyst can act on. The raw
 * codes are the only signal that separates "you lack permission" from "your
 * connection died", so the fallback keeps the code rather than swallowing it.
 */
export function storageErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : ''
  switch (code) {
    case 'storage/unauthorized':
      return 'Tidak punya izin mengunggah ke portofolio ini. Hubungi admin.'
    case 'storage/unauthenticated':
      return 'Sesi login berakhir. Muat ulang halaman lalu coba lagi.'
    case 'storage/retry-limit-exceeded':
      return 'Koneksi terputus saat mengunggah. Coba lagi dengan jaringan yang lebih stabil, atau pakai file yang lebih kecil.'
    case 'storage/canceled':
      return 'Unggahan dibatalkan.'
    case 'storage/quota-exceeded':
      return 'Kuota penyimpanan penuh. Hubungi admin.'
    case 'storage/invalid-checksum':
      return 'File rusak saat diunggah. Coba ulangi.'
    default:
      return code ? `Gagal mengunggah (${code}).` : 'Gagal mengunggah.'
  }
}

/** Deletes a previously uploaded media file from Firebase Storage. */
export async function deleteReportMedia(storagePath: string): Promise<void> {
  await deleteObject(ref(storage, storagePath))
}
