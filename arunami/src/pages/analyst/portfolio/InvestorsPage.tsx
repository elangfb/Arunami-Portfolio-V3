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
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
  // Dana sosial (social fund) — ad-hoc deduction, off by default.
  const [socialEnabled, setSocialEnabled] = useState(false)
  const [socialPct, setSocialPct] = useState('2.5')

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

  const socialFundPercent = socialEnabled ? (Number(socialPct) || 0) : 0

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
      socialFundPercent,
    })
    netForInvestor = summaryResult.perInvestorAmount
    monthlyROI = summaryResult.roiPercent
    annualROI = summaryResult.annualRoiPercent
  }

  // Precompute per-investor results once so we can also total the social fund.
  const latestRevForRows = [...data.revenueData].reverse().find(r => r.aktual > 0)
  const rows = allocations.map(alloc => {
    const investorUser = users.find(u => u.uid === alloc.investorUid)
    const result = config?.investorConfig && portfolio
      ? calculateDistribution({
          reportData: { period: latestActualPeriod ?? '', revenue: latestRevForRows?.aktual ?? 0, netProfit: lastProfit, grossProfit: 0 },
          config: config.investorConfig,
          allocation: alloc,
          portfolio,
          isArunamiTeam: investorUser?.isArunamiTeam,
          socialFundPercent,
        })
      : null
    return { alloc, investorUser, result }
  })
  const socialTotal = rows.reduce((s, r) => s + (r.result?.socialFundAmount ?? 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-6">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">Per Investor</CardTitle>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={socialEnabled}
                  onChange={e => setSocialEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#1e5f3f]"
                />
                Dana Sosial
              </label>
              {socialEnabled && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={socialPct}
                    onChange={e => setSocialPct(e.target.value)}
                    className="h-8 w-20 text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
          </div>
          {socialEnabled && socialTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              Total dana sosial terkumpul: <span className="font-medium">{formatCurrencyExact(socialTotal)}</span> (dipotong dari bagi hasil investor)
            </p>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada alokasi investor. Tambahkan melalui halaman Manajemen Portofolio.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead className="text-right">Investasi</TableHead>
                  <TableHead className="text-right">Net untuk Investor</TableHead>
                  <TableHead className="text-right">Monthly ROI</TableHead>
                  <TableHead className="text-right">Annual ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ alloc, investorUser, result }) => {
                  // DF-08: resolve name/email live from users; fall back to the
                  // denormalized allocation copy only if the user is missing.
                  const displayName = investorUser?.displayName ?? alloc.investorName
                  const displayEmail = investorUser?.email ?? alloc.investorEmail
                  const investorNet = result?.perInvestorAmount ?? 0
                  const investorMonthly = result?.roiPercent ?? 0
                  const investorAnnual = result?.annualRoiPercent ?? 0
                  return (
                    <TableRow key={alloc.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{displayName}</p>
                          {investorUser?.isArunamiTeam && (
                            <Badge variant="outline" className="border-green-600 text-green-700 text-xs">Tim Arunami</Badge>
                          )}
                        </div>
                        {displayEmail && (
                          <p className="text-xs text-muted-foreground">{displayEmail}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrencyCompact(alloc.investedAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyCompact(investorNet)}</TableCell>
                      <TableCell className="text-right">
                        <span className={investorMonthly >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatPercent(investorMonthly, true)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={investorAnnual >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {formatPercent(investorAnnual, true)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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
