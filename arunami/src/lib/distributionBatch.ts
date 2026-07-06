import type { BatchLineStatus, BatchStatus } from '@/types'

// Presentation + transition rules for the Phase-6 distribution batch state
// machine, mirroring the prototype flow:
//   Perlu diproses (pending) → Dilaporkan (reported) → Diteruskan (forwarded)
// with Ditahan (held) as a hold state reachable from any active line.

export const LINE_STATUS_LABELS: Record<BatchLineStatus, string> = {
  pending: 'Perlu diproses',
  reported: 'Dilaporkan',
  forwarded: 'Diteruskan',
  held: 'Ditahan',
}

export const LINE_STATUS_CLASSES: Record<BatchLineStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reported: 'bg-sky-100 text-sky-700',
  forwarded: 'bg-emerald-100 text-emerald-700',
  held: 'bg-red-100 text-red-700',
}

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: 'Draft',
  processing: 'Diproses',
  completed: 'Selesai',
}

/** The next forward status for a line, or null if it's already terminal/held. */
export function nextLineStatus(status: BatchLineStatus): BatchLineStatus | null {
  if (status === 'pending') return 'reported'
  if (status === 'reported') return 'forwarded'
  return null
}
