import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import { backdateImpact } from '@/lib/reportStaleness'
import type { InvestorReportDoc } from '@/types'

interface Props {
  /** The chosen effective period. */
  effectiveFrom: string
  /** Earliest period that is *not* a backdate — usually `getNextReportingPeriod`. */
  nextPeriod: string
  /** Every investor report for the portfolio, drafts included. */
  reports: InvestorReportDoc[]
  /** True while `reports` is still being fetched. */
  loading: boolean
  acknowledged: boolean
  onAcknowledgedChange: (v: boolean) => void
}

/**
 * Shown only when the analyst picks a period in the past. Backdating is allowed
 * — correcting terms that were wrong from the portfolio's first month is the
 * whole point — but it silently changes numbers investors have already been
 * sent, so the affected reports are named and the analyst has to tick to accept.
 *
 * The reports themselves are never rewritten; saving flags them for re-issue.
 */
export default function BackdateNotice({
  effectiveFrom, nextPeriod, reports, loading, acknowledged, onAcknowledgedChange,
}: Props) {
  const { reportCount, periods } = useMemo(
    () => backdateImpact(reports, effectiveFrom),
    [reports, effectiveFrom],
  )

  if (!effectiveFrom || !nextPeriod || effectiveFrom >= nextPeriod) return null

  return (
    <div className="space-y-2 rounded-lg border border-red-500/50 bg-red-50 p-3 text-xs">
      <div className="flex gap-3">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-700" />
        <div className="space-y-1 text-black">
          <p className="font-bold">
            Anda memilih periode lampau. Perhitungan bagi hasil mulai{' '}
            <span className="underline">{formatPeriod(effectiveFrom)}</span> akan
            dihitung ulang dengan ketentuan baru.
          </p>
          {loading ? (
            <p className="text-muted-foreground">Memeriksa laporan investor...</p>
          ) : reportCount === 0 ? (
            <p>Belum ada laporan investor terbit untuk periode tersebut.</p>
          ) : (
            <p>
              <span className="font-semibold">{reportCount} laporan investor</span>{' '}
              yang sudah terbit jadi tidak sesuai lagi ({periods.map(formatPeriod).join(', ')}).
              Isi laporan lama tidak diubah — investor tetap melihat angka yang
              dikirim dulu — tetapi laporan ditandai perlu terbit ulang di halaman
              Publishing.
            </p>
          )}
          <p>
            Laporan gabungan dan all-time investor terkait juga ikut ditandai di
            sisi Investor Relations.
          </p>
        </div>
      </div>
      <label className="flex items-center gap-2 pl-7 font-medium text-black">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => onAcknowledgedChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Saya mengerti dan tetap ingin memberlakukan mundur
      </label>
    </div>
  )
}
