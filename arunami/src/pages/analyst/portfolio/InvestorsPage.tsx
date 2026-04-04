import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData, getTransferProofs } from '@/lib/firestore'
import { calculateROI } from '@/lib/roi'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { FinancialData, TransferProof, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [proofs, setProofs] = useState<TransferProof[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    Promise.all([getFinancialData(portfolioId), getTransferProofs(portfolioId)]).then(([d, p]) => {
      setData(d); setProofs(p); setLoading(false)
    })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data investor belum tersedia.</div>

  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  const roiCards = [
    { label: 'Total Slot', value: data.investorConfig.totalSlots.toString() },
    { label: 'Nominal / Slot', value: formatCurrencyCompact(data.investorConfig.nominalPerSlot) },
    { label: 'Investor Share', value: `${data.investorConfig.investorSharePercent}%` },
    { label: 'Arunami Fee', value: `${data.investorConfig.arunamiFeePercent}%` },
    { label: 'Net untuk Investor', value: formatCurrencyCompact(roi.netForInvestor) },
    { label: 'Return / Slot', value: formatCurrencyCompact(roi.returnPerSlot) },
    { label: 'Monthly ROI', value: formatPercent(roi.monthlyROI, true) },
    { label: 'Annual ROI', value: formatPercent(roi.annualROI, true) },
  ]

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Return Investor</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {roiCards.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ROI Calculation breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Rincian Perhitungan ROI</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {[
                ['Net Profit (Bulan Terakhir)', formatCurrencyExact(lastProfit)],
                [`Investor Share (${data.investorConfig.investorSharePercent}%)`, formatCurrencyExact(roi.investorShare)],
                [`Arunami Fee (${data.investorConfig.arunamiFeePercent}%)`, `(${formatCurrencyExact(roi.arunamiFee)})`],
                ['Net untuk Investor', formatCurrencyExact(roi.netForInvestor)],
                [`Return per Slot (÷${data.investorConfig.totalSlots})`, formatCurrencyExact(roi.returnPerSlot)],
                ['Monthly ROI', formatPercent(roi.monthlyROI, true)],
                ['Annual ROI (×12)', formatPercent(roi.annualROI, true)],
              ].map(([label, value]) => (
                <tr key={label} className="hover:bg-muted/30">
                  <td className="py-2.5 text-muted-foreground">{label}</td>
                  <td className="py-2.5 text-right font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Transfer Proofs */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Bukti Transfer ({proofs.length})</CardTitle></CardHeader>
        <CardContent>
          {proofs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada bukti transfer</p>
          ) : (
            <div className="divide-y">
              {proofs.map(p => (
                <div key={p.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.investorName}</p>
                    <p className="text-xs text-muted-foreground">{p.period} · {p.notes}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="success">{formatCurrencyCompact(p.amount)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
