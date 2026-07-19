import { cn } from '@/lib/utils'
import markUrl from '@/assets/arunami-mark.jpg'

/**
 * Arunami logomark (the burst) rendered as a rounded tile.
 * The source image sits on a white background, so it reads cleanly on both the
 * dark sidebar rails and the light mobile top bars. Pair with the "ARUNAMI"
 * wordmark text for the full lockup.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt="Arunami"
      className={cn('rounded-lg object-cover', className)}
    />
  )
}
