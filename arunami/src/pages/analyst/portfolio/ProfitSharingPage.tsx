import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getPortfolioConfig, getEquityHistory, updatePortfolio,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, getNextReportingPeriod } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type {
  Portfolio, PortfolioConfig, EquityChangeEntry, ReturnModelType,
} from '@/types'
import HistorySection from './profit-sharing/HistorySection'
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
  config, portfolio, portfolioId, currentUser, nextPeriod, onChanged,
}: {
  config: PortfolioConfig
  portfolio: Portfolio | null
  portfolioId: string
  currentUser: { uid: string; displayName: string } | null
  nextPeriod: string
  onChanged: () => Promise<void>
}) {
  const shared = { config, portfolio, portfolioId, currentUser, nextPeriod, onChanged }
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
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!portfolioId) return
    setLoading(true)
    const [cfg, hist] = await Promise.all([
      getPortfolioConfig(portfolioId),
      getEquityHistory(portfolioId),
    ])
    setConfig(cfg)
    setHistory(hist)
    setLoading(false)
  }

  useEffect(() => { load() }, [portfolioId])

  const nextPeriod = useMemo(
    () => config ? getNextReportingPeriod(config.reportingFrequency) : null,
    [config],
  )

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

      <ModelSection
        config={config}
        portfolio={portfolio}
        portfolioId={portfolioId ?? ''}
        currentUser={currentUser}
        nextPeriod={nextPeriod ?? ''}
        onChanged={load}
      />

      <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-4">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700" />
        <div className="text-sm text-black font-bold">
          <p>
            Perubahan hanya berlaku untuk laporan mulai periode{' '}
            <span className="underline">{nextPeriod ? formatPeriod(nextPeriod) : '-'}</span>.
          </p>
          <p className="mt-1">
            Data historis dan laporan yang sudah dipublikasikan tidak akan diubah.
          </p>
        </div>
      </div>

      <HistorySection history={history} />
    </div>
  )
}
