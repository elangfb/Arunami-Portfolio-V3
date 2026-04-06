import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getFinancialData, getTransferProofs,
  getAllocationsForPortfolio, getPortfolioConfig,
} from '@/lib/firestore'
import { calculateROI, calculateInvestorROI } from '@/lib/roi'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type {
  FinancialData, TransferProof, Portfolio,
  InvestorAllocation, SlotBasedConfig,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [proofs, setProofs] = useState<TransferProof[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [slotConfig, setSlotConfig] = useState<{ totalSlots: number; nominalPerSlot: number; investorSharePercent: number; arunamiFeePercent: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    Promise.all([
      getFinancialData(portfolioId),
      getTransferProofs(portfolioId),
      getAllocationsForPortfolio(portfolioId),
      getPortfolioConfig(portfolioId),
    ]).then(([d, p, allocs, config]) => {
      setData(d)
      setProofs(p)
      setAllocations(allocs)

      if (config?.investorConfig?.type === 'slot_based') {
        const sc = config.investorConfig as SlotBasedConfig
        setSlotConfig({
          totalSlots: sc.totalSlots,
          nominalPerSlot: sc.nominalPerSlot,
          investorSharePercent: sc.investorSharePercent,
          arunamiFeePercent: sc.arunamiFeePercent,
        })
      }
      setLoading(false)
    })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data investor belum tersedia.</div>

  const lastProfit = data.profitData.at(-1)?.aktual ?? 0
  const roi = calculateROI(lastProfit, data.investorConfig)

  const allocatedSlots = allocations.reduce((sum, a) => sum + a.slots, 0)
  const totalInvested = allocations.reduce((sum, a) => sum + a.investedAmount, 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Cap Table & Return Investor</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Investor', value: allocations.length.toString() },
          { label: 'Slot Terisi', value: `${allocatedSlots} / ${slotConfig?.totalSlots ?? data.investorConfig.totalSlots}` },
          { label: 'Total Investasi', value: formatCurrencyCompact(totalInvested) },
          { label: 'Nominal / Slot', value: formatCurrencyCompact(slotConfig?.nominalPerSlot ?? data.investorConfig.nominalPerSlot) },
          { label: 'Net untuk Investor', value: formatCurrencyCompact(roi.netForInvestor) },
          { label: 'Return / Slot', value: formatCurrencyCompact(roi.returnPerSlot) },
          { label: 'Monthly ROI', value: formatPercent(roi.monthlyROI, true) },
          { label: 'Annual ROI', value: formatPercent(roi.annualROI, true) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cap Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cap Table — Distribusi Slot & Profit Sharing</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada alokasi investor. Tambahkan melalui halaman Manajemen Portofolio.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2.5 px-3 font-medium">Investor</th>
                  <th className="text-center py-2.5 px-3 font-medium">Slot</th>
                  <th className="text-center py-2.5 px-3 font-medium">Kepemilikan</th>
                  <th className="text-right py-2.5 px-3 font-medium">Investasi</th>
                  <th className="text-right py-2.5 px-3 font-medium">Earning (Bulan Ini)</th>
                  <th className="text-right py-2.5 px-3 font-medium">ROI Bulanan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allocations.map(alloc => {
                  const invRoi = slotConfig
                    ? calculateInvestorROI(
                        lastProfit,
                        alloc.slots,
                        slotConfig.totalSlots,
                        slotConfig.investorSharePercent,
                        slotConfig.arunamiFeePercent,
                        slotConfig.nominalPerSlot,
                      )
                    : null

                  return (
                    <tr key={alloc.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3">
                        <p className="font-medium">{alloc.investorName}</p>
                        <p className="text-xs text-muted-foreground">{alloc.investorEmail}</p>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="secondary">{alloc.slots}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {invRoi ? `${invRoi.ownershipPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatCurrencyCompact(alloc.investedAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {invRoi ? formatCurrencyCompact(invRoi.earnings) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {invRoi ? (
                          <span className={invRoi.monthlyROI >= 0 ? 'text-green-600' : 'text-red-500'}>
                            {formatPercent(invRoi.monthlyROI, true)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="py-2.5 px-3">Total</td>
                  <td className="py-2.5 px-3 text-center">{allocatedSlots}</td>
                  <td className="py-2.5 px-3 text-center">
                    {slotConfig ? `${((allocatedSlots / slotConfig.totalSlots) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyCompact(totalInvested)}</td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyCompact(roi.netForInvestor)}</td>
                  <td className="py-2.5 px-3 text-right">{formatPercent(roi.monthlyROI, true)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

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
