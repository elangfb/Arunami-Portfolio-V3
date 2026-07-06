import { cn } from '@/lib/utils'
import { KYC_STATUS_LABELS, KYC_STATUS_CLASSES, kycStatusOf } from '@/lib/kyc'
import type { KycStatus } from '@/types'

/** Small KYC status pill. Absent status renders as "Belum Verifikasi". */
export function KycBadge({ status, className }: { status?: KycStatus; className?: string }) {
  const s = kycStatusOf(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        KYC_STATUS_CLASSES[s],
        className,
      )}
    >
      {KYC_STATUS_LABELS[s]}
    </span>
  )
}
