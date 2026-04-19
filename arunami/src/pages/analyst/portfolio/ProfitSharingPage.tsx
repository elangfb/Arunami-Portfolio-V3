import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getPortfolioConfig, getEquityHistory,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, getNextReportingPeriod } from '@/lib/dateUtils'
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
    <div className="p-6 space-y-6 max-w-4xl mx-auto text-black">
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
