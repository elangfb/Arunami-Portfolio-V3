import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getPortfolioConfig, getEquityHistory, updatePortfolio,
  getReports, getManagementReports,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import {
  formatPeriod, getNextReportingPeriod, normalizePeriod, isReportingPeriodKey,
} from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type {
  Portfolio, PortfolioConfig, EquityChangeEntry, ReturnModelType,
} from '@/types'
import HistorySection from './profit-sharing/HistorySection'
import BagiHasilResumeSection from './profit-sharing/BagiHasilResumeSection'
import NetProfitShareSection from './profit-sharing/NetProfitShareSection'
import FixedYieldSection from './profit-sharing/FixedYieldSection'
import RevenueShareSection from './profit-sharing/RevenueShareSection'
import FixedScheduleSection from './profit-sharing/FixedScheduleSection'
import AnnualDividendSection from './profit-sharing/AnnualDividendSection'
import CustomSection from './profit-sharing/CustomSection'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

const MODEL_LABEL: Record<ReturnModelType, string> = {
  percentage_based: 'Net Profit Share (legacy)',
  fixed_return: 'Fixed Return (legacy)',
  net_profit_share: 'Net Profit Share',
  fixed_yield: 'Fixed Yield',
  revenue_share: 'Revenue Share',
  fixed_schedule: 'Fixed Schedule',
  annual_dividend: 'Annual Dividend',
  custom: 'Custom Formula',
}

function ModelSection({
  config, portfolio, portfolioId, currentUser, nextPeriod, earliestPeriod, onChanged,
}: {
  config: PortfolioConfig
  portfolio: Portfolio | null
  portfolioId: string
  currentUser: { uid: string; displayName: string } | null
  nextPeriod: string
  earliestPeriod: string | null
  onChanged: () => Promise<void>
}) {
  const shared = {
    config, portfolio, portfolioId, currentUser, nextPeriod, earliestPeriod, onChanged,
  }
  const ic = config.investorConfig

  switch (ic.type) {
    case 'fixed_yield':
      return <FixedYieldSection {...shared} investorConfig={ic} />
    case 'revenue_share':
      return <RevenueShareSection {...shared} investorConfig={ic} />
    case 'fixed_schedule':
      return <FixedScheduleSection {...shared} investorConfig={ic} />
    case 'annual_dividend':
      return <AnnualDividendSection {...shared} investorConfig={ic} />
    case 'custom':
      return <CustomSection {...shared} investorConfig={ic} />
    case 'net_profit_share':
    case 'percentage_based':
    case 'fixed_return':
    default:
      return <NetProfitShareSection {...shared} investorConfig={ic} />
  }
}

function GracePeriodCard({ portfolio, portfolioId }: { portfolio: Portfolio; portfolioId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [ending, setEnding] = useState(false)
  const mode = portfolio.graceConfig?.returnMode ?? 'none'

  const endGrace = async () => {
    setEnding(true)
    try {
      await updatePortfolio(portfolioId, { isGracePeriod: false })
      toast.success('Grace period diakhiri. Portofolio kini aktif.')
      // Reload so the layout re-fetches the portfolio and unlocks the
      // PnL / analysis tabs that were hidden during grace.
      window.location.reload()
    } catch (e) {
      console.error('Failed to end grace period', e)
      toast.error('Gagal mengakhiri grace period.')
      setEnding(false)
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-amber-900">Portofolio dalam Grace Period</p>
            <p className="text-sm text-amber-700">
              Return selama grace:{' '}
              {mode === 'fixed_yield'
                ? `Fixed yield ${portfolio.graceConfig?.fixedYieldPercent ?? 0}% / bulan`
                : 'Tidak ada payout (laporan informatif)'}
              {portfolio.graceConfig?.expectedOperationalDate
                ? ` · Estimasi operasional: ${portfolio.graceConfig.expectedOperationalDate}`
                : ''}
            </p>
          </div>
          <Badge variant="warning">Grace</Badge>
        </div>
        {!confirming ? (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Akhiri Grace Period
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              Setelah diakhiri: tab PnL &amp; analisis terbuka, dan distribusi mengikuti model
              portofolio yang dikonfigurasi. Tindakan ini bisa diubah kembali oleh admin bila perlu.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" disabled={ending} onClick={endGrace}>
                {ending ? 'Memproses...' : 'Ya, akhiri grace period'}
              </Button>
              <Button variant="ghost" size="sm" disabled={ending} onClick={() => setConfirming(false)}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProfitSharingPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [history, setHistory] = useState<EquityChangeEntry[]>([])
  const [dataPeriods, setDataPeriods] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!portfolioId) return
    setLoading(true)
    const [cfg, hist, pnls, projs, mgmts] = await Promise.all([
      getPortfolioConfig(portfolioId),
      getEquityHistory(portfolioId),
      getReports(portfolioId, 'pnl'),
      getReports(portfolioId, 'projection'),
      getManagementReports(portfolioId),
    ])
    setConfig(cfg)
    setHistory(hist)
    // Every period the portfolio holds data for, in any form — during grace
    // there are no P&L uploads, so management reports are the only signal.
    setDataPeriods(
      [...pnls, ...projs, ...mgmts]
        .map(r => normalizePeriod(r.period ?? ''))
        .filter(isReportingPeriodKey),
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [portfolioId])

  const nextPeriod = useMemo(
    () => config ? getNextReportingPeriod(config.reportingFrequency) : null,
    [config],
  )

  /**
   * How far back a config change may be backdated: the portfolio's first month
   * with data, falling back to the month its config was created. Null when
   * neither is known, which leaves the picker showing upcoming periods only.
   */
  const earliestPeriod = useMemo(() => {
    const months = dataPeriods.filter(p => /^\d{4}-\d{2}$/.test(p)).sort()
    if (months.length > 0) return months[0]
    const created = config?.createdAt?.toDate?.()
    if (!created) return null
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
  }, [dataPeriods, config])

  // A saved change lands in the live config straight away but only governs
  // reports from its effective period on. Without this the card would read
  // "Saat Ini" for terms that aren't in force yet.
  const pendingChange = useMemo(() => {
    if (!nextPeriod) return null
    return history
      .filter(h => h.effectiveFromPeriod && h.effectiveFromPeriod >= nextPeriod)
      .sort((a, b) => a.effectiveFromPeriod.localeCompare(b.effectiveFromPeriod))[0] ?? null
  }, [history, nextPeriod])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>
  }
  if (!config) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Konfigurasi portfolio belum dibuat.
        </CardContent></Card>
      </div>
    )
  }

  const currentUser = user ? { uid: user.uid, displayName: user.displayName } : null

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto text-black">
      {portfolio?.isGracePeriod && portfolioId && (
        <GracePeriodCard portfolio={portfolio} portfolioId={portfolioId} />
      )}

      <div>
        <h2 className="text-xl font-bold text-black">Profit Sharing Management</h2>
        <p className="text-sm text-black mt-1">
          Kelola model distribusi untuk portfolio ini. Setiap perubahan dicatat untuk akuntabilitas.
        </p>
        <div className="mt-2">
          <Badge variant="outline">Model: {MODEL_LABEL[config.returnModel]}</Badge>
          <Badge variant="outline" className="ml-2">Frekuensi: {config.reportingFrequency}</Badge>
        </div>
      </div>

      {pendingChange && (
        <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm text-black">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-700" />
          <div>
            Angka di bawah adalah ketentuan baru
            {pendingChange.toValue ? ` (${pendingChange.toValue})` : ''}, yang mulai
            berlaku periode{' '}
            <span className="font-semibold underline">
              {formatPeriod(pendingChange.effectiveFromPeriod)}
            </span>
            . Laporan sampai periode sebelumnya masih memakai ketentuan lama
            {pendingChange.fromValue ? ` (${pendingChange.fromValue})` : ''}.
          </div>
        </div>
      )}

      <ModelSection
        config={config}
        portfolio={portfolio}
        portfolioId={portfolioId ?? ''}
        currentUser={currentUser}
        nextPeriod={nextPeriod ?? ''}
        earliestPeriod={earliestPeriod}
        onChanged={load}
      />

      <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-4">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700" />
        <div className="text-sm text-black font-bold">
          <p>
            Setiap perubahan berlaku mulai periode yang Anda pilih saat menyimpan.
            Standarnya{' '}
            <span className="underline">{nextPeriod ? formatPeriod(nextPeriod) : '-'}</span>,
            dan periode sebelumnya tetap memakai ketentuan yang berlaku saat itu.
          </p>
          <p className="mt-1">
            Bila ketentuan lama memang salah, Anda boleh memilih periode lampau —
            paling awal{' '}
            <span className="underline">
              {earliestPeriod ? formatPeriod(earliestPeriod) : 'periode data pertama'}
            </span>
            . Perhitungan sejak periode itu dihitung ulang, dan laporan investor
            yang sudah terbit ditandai perlu terbit ulang.
          </p>
        </div>
      </div>

      <BagiHasilResumeSection
        portfolio={portfolio}
        portfolioId={portfolioId ?? ''}
        config={config}
        currentUser={currentUser}
        onChanged={load}
      />

      <HistorySection history={history} />
    </div>
  )
}
