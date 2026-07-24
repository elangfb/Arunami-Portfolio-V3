import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getUser, getAllocationsForInvestor, getPortfolioConfigOrDefault, getConfigTimeline,
  getFinancialData, getCommunicationsForInvestor, getPortfolio, getPublishedInvestorReports,
} from '@/lib/firestore'
import { calculateDistribution, ownershipFraction } from '@/lib/distributionStrategies'
import { resolveInvestorConfigForPeriod } from '@/lib/configTimeline'
import { formatCurrencyExact, formatPercent, MONTH_NAMES_ID } from '@/lib/utils'
import { brandOf, makeBrandResolver } from '@/lib/portfolioName'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { ArrowLeft, Wallet, TrendingUp, Briefcase, BarChart3, FileText, Search, Wrench } from 'lucide-react'
import InvestorReportGenerator from './components/InvestorReportGenerator'
import InvestorReportHistory from './components/InvestorReportHistory'
import type {
  AppUser, InvestorAllocation, FinancialData as FinancialDataType,
  PortfolioConfig, InvestorCommunication, Portfolio, InvestorReportDoc,
} from '@/types'

interface PortfolioEnriched {
  allocation: InvestorAllocation
  financial: FinancialDataType | null
  config: PortfolioConfig | null
  portfolio: Portfolio | null
  earnings: number        // latest published period
  totalEarnings: number   // cumulative across all published periods
  monthlyROI: number
  netProfit: number
  periodLabel: string
}

interface AdminInvestorDetailProps {
  /** Where the back button and not-found redirect go. Defaults to the admin area. */
  backPath?: string
  /** Show the report generator + report history on this page. Off where reporting lives in a dedicated menu. */
  showReporting?: boolean
  /** Show the admin "Override Data" button. Admin-only; off in the IR view. */
  showOverride?: boolean
}

export default function AdminInvestorDetail({ backPath = '/admin/investors', showReporting = true, showOverride = true }: AdminInvestorDetailProps = {}) {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()

  const [investor, setInvestor] = useState<AppUser | null>(null)
  const [portfolios, setPortfolios] = useState<PortfolioEnriched[]>([])
  const [communications, setCommunications] = useState<InvestorCommunication[]>([])
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [loading, setLoading] = useState(true)

  // Report dialog
  const [reportOpen, setReportOpen] = useState(false)

  // Communication filters
  const [commsSearch, setCommsSearch] = useState('')
  const [commsTypeFilter, setCommsTypeFilter] = useState<'all' | 'report' | 'message'>('all')

  const loadData = async () => {
    if (!uid) return

    const [user, allocations, comms, publishedReports] = await Promise.all([
      getUser(uid),
      getAllocationsForInvestor(uid),
      getCommunicationsForInvestor(uid),
      getPublishedInvestorReports(uid),
    ])

    if (!user) {
      toast.error('Investor tidak ditemukan')
      navigate(backPath)
      return
    }

    setInvestor(user)
    setCommunications(comms)
    setReports([...publishedReports].sort((a, b) => comparePeriods(b.period, a.period)))

    // Published per-project report periods, keyed by portfolio. Earnings are
    // summed only over these so the totals match what the investor actually
    // sees on their own returns page (accumulated reports are excluded).
    const publishedByPortfolio = new Map<string, Set<string>>()
    for (const r of publishedReports) {
      if (r.scope === 'accumulated') continue
      const set = publishedByPortfolio.get(r.portfolioId) ?? new Set<string>()
      set.add(r.period)
      publishedByPortfolio.set(r.portfolioId, set)
    }

    // Enrich each allocation with financial data
    const enriched = await Promise.all(
      allocations.map(async (allocation) => {
        const [config, configTimeline, financial, ptf] = await Promise.all([
          getPortfolioConfigOrDefault(allocation.portfolioId),
          getConfigTimeline(allocation.portfolioId),
          getFinancialData(allocation.portfolioId),
          getPortfolio(allocation.portfolioId),
        ])

        let earnings = 0
        let totalEarnings = 0
        let monthlyROI = 0
        let netProfit = 0
        let periodLabel = '—'

        const publishedSet = publishedByPortfolio.get(allocation.portfolioId) ?? new Set<string>()

        if (ptf?.isGracePeriod && config?.investorConfig && publishedSet.size > 0) {
          // Grace: earnings are the grace return (fixed yield or none) per
          // published month — no PnL exists. calculateDistribution is grace-aware.
          // The grace return per month is constant (fixed yield on principal, or
          // nothing) — so cumulative = per-month × published months.
          const result = calculateDistribution({
            reportData: null,
            config: config.investorConfig!,
            allocation,
            portfolio: ptf,
            isArunamiTeam: user?.isArunamiTeam,
          })
          totalEarnings += result.perInvestorAmount * publishedSet.size
          const latestPeriod = [...publishedSet].sort(comparePeriods).at(-1)
          if (latestPeriod) {
            earnings = result.perInvestorAmount
            monthlyROI = result.roiPercent
            periodLabel = formatPeriod(latestPeriod)
          }
        } else if (financial && config?.investorConfig && ptf && publishedSet.size > 0) {
          const earningFor = (period: string, revenue: number, profit: number) =>
            calculateDistribution({
              reportData: { period, revenue, netProfit: profit, grossProfit: 0 },
              // Each published month earns on the terms in force back then.
              config: resolveInvestorConfigForPeriod(config, configTimeline, period),
              allocation,
              portfolio: ptf,
              isArunamiTeam: user?.isArunamiTeam,
            })

          // Cumulative earnings across every published period.
          for (const pt of financial.profitData) {
            if (!publishedSet.has(pt.month)) continue
            const rev = financial.revenueData.find(r => r.month === pt.month)?.aktual ?? 0
            totalEarnings += earningFor(pt.month, rev, pt.aktual).perInvestorAmount
          }

          // Latest published period → "Earning Terakhir" + monthly ROI.
          const latestPeriod = [...publishedSet].sort(comparePeriods).at(-1)
          if (latestPeriod) {
            const latestProfit = financial.profitData.find(p => p.month === latestPeriod)
            const latestRevenue = financial.revenueData.find(r => r.month === latestPeriod)
            netProfit = latestProfit?.aktual ?? 0
            periodLabel = formatPeriod(latestPeriod)
            const result = earningFor(latestPeriod, latestRevenue?.aktual ?? 0, netProfit)
            earnings = result.perInvestorAmount
            monthlyROI = result.roiPercent
          }
        }

        return { allocation, financial, config, portfolio: ptf, earnings, totalEarnings, monthlyROI, netProfit, periodLabel }
      }),
    )

    setPortfolios(enriched)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [uid])

  const resolveBrand = useMemo(
    () => makeBrandResolver(portfolios.map(p => p.portfolio).filter((x): x is Portfolio => !!x)),
    [portfolios],
  )

  const totalInvested = portfolios.reduce((s, p) => s + p.allocation.investedAmount, 0)
  const totalEarnings = portfolios.reduce((s, p) => s + p.totalEarnings, 0)      // cumulative, all published periods
  const totalLatestEarnings = portfolios.reduce((s, p) => s + p.earnings, 0)     // latest published period only
  const portfolioCount = portfolios.length
  const avgROI = portfolios.length > 0
    ? portfolios.reduce((s, p) => s + p.monthlyROI, 0) / portfolios.length
    : 0

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!investor) return null

  const formatCommsDate = (comm: InvestorCommunication) => {
    if (!comm.createdAt?.toDate) return '—'
    const d = comm.createdAt.toDate()
    return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`
  }

  const channelLabel: Record<string, string> = {
    clipboard: 'Clipboard',
    download: 'Cetak/Unduh',
    email: 'Email',
    publish: 'Terbit ke Investor',
  }

  const filteredComms = communications.filter(comm => {
    if (commsTypeFilter !== 'all' && comm.type !== commsTypeFilter) return false
    if (commsSearch && !comm.subject.toLowerCase().includes(commsSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{investor.displayName}</h1>
            <Badge variant="outline">Investor</Badge>
            {investor.isArunamiTeam && (
              <Badge variant="outline" className="border-green-600 text-green-700">Tim Arunami</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{investor.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {showOverride && (
            <Button
              variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-50"
              onClick={() => navigate(`/admin/investors/${investor.uid}/override`)}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Override Data
            </Button>
          )}
          {showReporting && (
            <Button onClick={() => setReportOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Buat Laporan
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <Wallet className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Investasi</p>
                <p className="text-lg font-bold">{formatCurrencyExact(totalInvested)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <TrendingUp className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Earning</p>
                <p className="text-lg font-bold">{formatCurrencyExact(Math.round(totalEarnings))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <Briefcase className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jumlah Portofolio</p>
                <p className="text-lg font-bold">{portfolioCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <BarChart3 className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rata-rata ROI</p>
                <p className="text-lg font-bold">{formatPercent(avgROI)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Allocations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alokasi Portofolio</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada alokasi portofolio
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table className="text-sm">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Portofolio</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">Kepemilikan</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">Investasi</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">Earning Terakhir</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">Total Earning</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">ROI Bulanan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {portfolios.map(p => {
                    const ownershipPct = p.portfolio
                      ? ownershipFraction(p.allocation, p.portfolio) * 100
                      : (p.allocation.ownershipPercent ?? 0)

                    return (
                      <TableRow key={p.allocation.id} className="hover:bg-muted/30">
                        <TableCell className="py-2.5 px-3">
                          <p className="font-medium">{p.portfolio ? brandOf(p.portfolio) : p.allocation.portfolioName}</p>
                          <p className="text-xs text-muted-foreground">{p.allocation.portfolioCode}</p>
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right">
                          {formatPercent(ownershipPct)}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right">
                          {formatCurrencyExact(p.allocation.investedAmount)}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right">
                          {formatCurrencyExact(p.earnings)}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right font-medium">
                          {formatCurrencyExact(Math.round(p.totalEarnings))}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right">
                          {formatPercent(p.monthlyROI)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell className="py-2.5 px-3">Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="py-2.5 px-3 text-right">{formatCurrencyExact(totalInvested)}</TableCell>
                    <TableCell className="py-2.5 px-3 text-right">{formatCurrencyExact(totalLatestEarnings)}</TableCell>
                    <TableCell className="py-2.5 px-3 text-right">{formatCurrencyExact(Math.round(totalEarnings))}</TableCell>
                    <TableCell className="py-2.5 px-3 text-right">{formatPercent(avgROI)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report History */}
      {showReporting && <InvestorReportHistory reports={reports} resolveBrand={resolveBrand} onChanged={loadData} />}

      {/* Communication History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">Riwayat Komunikasi ({filteredComms.length})</CardTitle>
            {communications.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border">
                  {([['all', 'Semua'], ['report', 'Laporan'], ['message', 'Pesan']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setCommsTypeFilter(value)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        commsTypeFilter === value
                          ? 'bg-[#1e5f3f] text-white'
                          : 'hover:bg-muted/50'
                      } ${value === 'all' ? 'rounded-l-md' : value === 'message' ? 'rounded-r-md' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari subjek..."
                    value={commsSearch}
                    onChange={e => setCommsSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {communications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada riwayat komunikasi
            </p>
          ) : filteredComms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada komunikasi yang cocok
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table className="text-sm">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Tanggal</TableHead>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Tipe</TableHead>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Subjek</TableHead>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Channel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {filteredComms.map(comm => (
                    <TableRow key={comm.id} className="hover:bg-muted/30">
                      <TableCell className="py-2.5 px-3">{formatCommsDate(comm)}</TableCell>
                      <TableCell className="py-2.5 px-3">
                        <Badge variant="outline" className="capitalize">{comm.type === 'report' ? 'Laporan' : 'Pesan'}</Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-3">{comm.subject}</TableCell>
                      <TableCell className="py-2.5 px-3">
                        <Badge variant="secondary">{channelLabel[comm.channel] ?? comm.channel}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Generator Dialog */}
      {showReporting && (
        <InvestorReportGenerator
          open={reportOpen}
          onOpenChange={setReportOpen}
          investor={investor}
        />
      )}
    </div>
  )
}
