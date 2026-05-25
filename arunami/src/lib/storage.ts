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
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type })

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

/** Deletes a previously uploaded media file from Firebase Storage. */
export async function deleteReportMedia(storagePath: string): Promise<void> {
  await deleteObject(ref(storage, storagePath))
}
