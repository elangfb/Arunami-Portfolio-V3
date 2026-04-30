import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getFinancialData, getTransferProofs,
  getAllocationsForPortfolio, getPortfolioConfigOrDefault, getAllUsers,
} from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPeriod } from '@/lib/dateUtils'
import type {
  FinancialData, TransferProof, Portfolio, InvestorAllocation, PortfolioConfig, AppUser,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function InvestorsPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [proofs, setProofs] = useState<TransferProof[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    Promise.all([
      getFinancialData(portfolioId),
      getTransferProofs(portfolioId),
      getAllocationsForPortfolio(portfolioId),
      getPortfolioConfigOrDefault(portfolioId),
      getAllUsers(),
    ]).then(([d, p, allocs, cfg, u]) => {
      setData(d)
      setProofs(p)
      setAllocations(allocs)
      setConfig(cfg)
      setUsers(u)
      setLoading(false)
    })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data investor belum tersedia.</div>

  const latestActual = [...data.profitData].reverse().find(r => r.aktual > 0)
  const latestActualPeriod = latestActual?.month ?? data.profitData.at(-1)?.month
  const lastProfit = latestActual?.aktual ?? data.profitData.at(-1)?.aktual ?? 0
  const periodLabel = latestActualPeriod ? formatPeriod(latestActualPeriod) : 'Bulan Terakhir'

  // Portfolio-level summary: use a "whole portfolio" mock allocation for the summary cards
  const totalInvestment = portfolio?.investasiAwal ?? 0
  let netForInvestor = 0
  let monthlyROI = 0
  let annualROI = 0

  if (config?.investorConfig && portfolio) {
    const mockAlloc: InvestorAllocation = {
      id: '_summary', investorUid: '', investorName: '', investorEmail: '',
      portfolioId: portfolioId ?? '', portfolioName: portfolio.name, portfolioCode: portfolio.code,
      investedAmount: totalInvestment, ownershipPercent: 100,
      joinedAt: null as any, updatedAt: null as any,
    }
    const latestRev = [...data.revenueData].reverse().find(r => r.aktual > 0)
    const summaryResult = calculateDistribution({
      reportData: { period: latestActualPeriod ?? '', revenue: latestRev?.aktual ?? 0, netProfit: lastProfit, grossProfit: 0 },
      config: config.investorConfig,
      allocation: mockAlloc,
      portfolio,
    })
    netForInvestor = summaryResult.perInvestorAmount
    monthlyROI = summaryResult.roiPercent
    annualROI = summaryResult.annualRoiPercent
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Laporan Investor</h2>

      {/* Summary — 4 metrics per spec */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: `Net Profit (${periodLabel})`, value: formatCurrencyExact(lastProfit) },
          { label: 'Net untuk Investor', value: formatCurrencyExact(netForInvestor) },
          { label: 'Monthly ROI', value: formatPercent(monthlyROI, true) },
          { label: 'Annual ROI (×12 Forecast)', value: formatPercent(annualROI, true) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-investor breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Per Investor</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada alokasi investor. Tambahkan melalui halaman Manajemen Portofolio.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2.5 px-3 font-medium">Investor</th>
                  <th className="text-right py-2.5 px-3 font-medium">Investasi</th>
                  <th className="text-right py-2.5 px-3 font-medium">Net untuk Investor</th>
                  <th className="text-right py-2.5 px-3 font-medium">Monthly ROI</th>
                  <th className="text-right py-2.5 px-3 font-medium">Annual ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allocations.map(alloc => {
                  let investorNet = 0
                  let investorMonthly = 0
                  let investorAnnual = 0
                  if (config?.investorConfig && portfolio) {
                    const latestRev = [...data.revenueData].reverse().find(r => r.aktual > 0)
                    const investorUser = users.find(u => u.uid === alloc.investorUid)
                    const result = calculateDistribution({
                      reportData: { period: latestActualPeriod ?? '', revenue: latestRev?.aktual ?? 0, netProfit: lastProfit, grossProfit: 0 },
                      config: config.investorConfig,
                      allocation: alloc,
                      portfolio,
                      isArunamiTeam: investorUser?.isArunamiTeam,
                    })
                    investorNet = result.perInvestorAmount
                    investorMonthly = result.roiPercent
                    investorAnnual = result.annualRoiPercent
                  }
                  return (
                    <tr key={alloc.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{alloc.investorName}</p>
                          {users.find(u => u.uid === alloc.investorUid)?.isArunamiTeam && (
                            <Badge variant="outline" className="border-green-600 text-green-700 text-xs">Tim Arunami</Badge>
                          )}
                        </div>
                        {alloc.investorEmail && (
                          <p className="text-xs text-muted-foreground">{alloc.investorEmail}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatCurrencyCompact(alloc.investedAmount)}</td>
                      <td className="py-2.5 px-3 text-right">{formatCurrencyCompact(investorNet)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={investorMonthly >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatPercent(investorMonthly, true)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={investorAnnual >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatPercent(investorAnnual, true)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
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
