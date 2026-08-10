import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getAllocationsForInvestor } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { contractStatus, daysRemainingLabel } from '@/lib/contracts'
import { DISTRIBUTION_MODEL_OPTIONS, displayOwnershipPercent } from '@/lib/distributionStrategies'
import { formatCurrencyExact, formatOwnershipPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContractDurationBar } from '@/components/shared/ContractStatus'
import { AlertTriangle } from 'lucide-react'
import type { InvestorAllocation } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

const FREQ_LABELS: Record<string, string> = {
  bulanan: 'Bulanan', kuartalan: 'Kuartalan', semesteran: 'Semesteran',
}

export default function InvestorContractPage() {
  const { portfolio, portfolioConfig, portfolioId } = useOutletContext<InvestorPortfolioOutletContext>()
  const { user } = useAuthStore()
  const [allocation, setAllocation] = useState<InvestorAllocation | null>(null)

  useEffect(() => {
    if (!user || !portfolioId) return
    getAllocationsForInvestor(user.uid).then(allocs =>
      setAllocation(allocs.find(a => a.portfolioId === portfolioId) ?? null),
    )
  }, [user, portfolioId])

  const status = useMemo(
    () => contractStatus(portfolio?.contractStart, portfolio?.contractEnd),
    [portfolio],
  )

  if (!portfolio) return <div className="p-8 text-muted-foreground">Memuat…</div>

  const schemeLabel = DISTRIBUTION_MODEL_OPTIONS.find(o => o.value === portfolioConfig?.returnModel)?.label
    ?? portfolioConfig?.returnModel ?? '—'
  const ownershipPct = allocation ? displayOwnershipPercent(allocation, portfolio) : 0
  const joinedLabel = allocation?.joinedAt?.seconds
    ? new Date(allocation.joinedAt.seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const facts: { label: string; value: string }[] = [
    { label: 'Mulai Kontrak', value: portfolio.contractStart || '—' },
    { label: 'Akhir Kontrak', value: portfolio.contractEnd || '—' },
    { label: 'Sisa Waktu', value: daysRemainingLabel(status.daysRemaining) },
    { label: 'Mulai Operasional', value: portfolio.operationalStart || '—' },
  ]

  const terms: { label: string; value: string }[] = [
    { label: 'Nominal Investasi', value: allocation ? formatCurrencyExact(allocation.investedAmount) : '—' },
    { label: 'Kepemilikan', value: allocation ? formatOwnershipPercent(ownershipPct) : '—' },
    { label: 'Tanggal Bergabung', value: joinedLabel },
    { label: 'Skema Bagi Hasil', value: schemeLabel },
    { label: 'Frekuensi Laporan', value: FREQ_LABELS[portfolioConfig?.reportingFrequency ?? ''] ?? '—' },
    { label: 'Pengembalian Pokok', value: portfolioConfig?.returnsPrincipal ? 'Ya' : 'Tidak' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl font-bold">Kontrak</h2>

      {status.severity === 'kritis' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Kontrak akan segera berakhir</p>
            <p className="text-sm text-red-700">{daysRemainingLabel(status.daysRemaining)}. Tim Arunami akan menghubungi Anda terkait perpanjangan.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Masa Berlaku Kontrak</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ContractDurationBar start={portfolio.contractStart} end={portfolio.contractEnd} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {facts.map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-sm font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Ketentuan Investasi Saya</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {terms.map(t => (
              <div key={t.label}>
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="text-sm font-medium">{t.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
