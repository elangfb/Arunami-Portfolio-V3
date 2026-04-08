import { useEffect, useMemo, useState } from 'react'
import {
  getAllocationsForInvestor,
  getPortfolio,
  getFinancialData,
  getManagementReports,
  getReports,
} from '@/lib/firestore'
import { calculateInvestorROI } from '@/lib/roi'
import { formatCurrencyExact, formatPercent } from '@/lib/utils'
import {
  formatPeriod,
  normalizePeriod,
  comparePeriods,
  extractAvailablePeriods,
  getMonthsForPeriod,
  formatPeriodLabel,
} from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { useReportFilterStore, type PeriodType } from '@/store/reportFilterStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, TrendingUp, AlertTriangle } from 'lucide-react'
import type {
  InvestorAllocation,
  Portfolio,
  FinancialData,
  ManagementReport,
  PnLExtractedData,
  Issue,
} from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────

interface PortfolioReportData {
  allocation: InvestorAllocation
  portfolio: Portfolio
  financialData: FinancialData | null
  managementReports: ManagementReport[]
  pnlByPeriod: Map<string, PnLExtractedData>
}

interface PortfolioViewData extends PortfolioReportData {
  aggregatedPnL: PnLExtractedData | null
  roi: ReturnType<typeof calculateInvestorROI> | null
}

interface ReportSummary {
  portfolioCount: number
  totalInvested: number
  totalEarnings: number
  avgMonthlyROI: number
}

// ─── Aggregation ─────────────────────────────────────────────────────────

function aggregatePnLForPeriod(
  pnlByPeriod: Map<string, PnLExtractedData>,
  periodType: PeriodType,
  selectedPeriod: string,
  allAvailableMonths: string[],
): PnLExtractedData | null {
  const months = getMonthsForPeriod(periodType, selectedPeriod, allAvailableMonths)
  const entries = months
    .map((m) => pnlByPeriod.get(m))
    .filter((e): e is PnLExtractedData => e != null)

  if (entries.length === 0) return null
  if (entries.length === 1) return entries[0]

  // Sum numeric fields
  const summed: PnLExtractedData = {
    period: selectedPeriod,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    opex: [],
    totalOpex: 0,
    operatingProfit: 0,
    interest: 0,
    taxes: 0,
    netProfit: 0,
    transactionCount: 0,
    unitBreakdown: {},
    notes: '',
  }

  const opexMap = new Map<string, number>()

  for (const e of entries) {
    summed.revenue += e.revenue
    summed.cogs += e.cogs
    summed.grossProfit += e.grossProfit
    summed.totalOpex += e.totalOpex
    summed.operatingProfit += e.operatingProfit
    summed.interest += e.interest
    summed.taxes += e.taxes
    summed.netProfit += e.netProfit
    summed.transactionCount += e.transactionCount ?? 0
    if (e.unitBreakdown) {
      for (const [key, val] of Object.entries(e.unitBreakdown)) {
        summed.unitBreakdown[key] = (summed.unitBreakdown[key] ?? 0) + val
      }
    }
    if (e.notes) {
      summed.notes = summed.notes ? `${summed.notes}; ${e.notes}` : e.notes
    }
    for (const item of e.opex) {
      opexMap.set(item.name, (opexMap.get(item.name) ?? 0) + item.amount)
    }
  }

  summed.opex = [...opexMap.entries()].map(([name, amount]) => ({ name, amount }))

  return summed
}

function computeSummary(data: PortfolioViewData[]): ReportSummary {
  const totalInvested = data.reduce((s, d) => s + d.allocation.investedAmount, 0)
  const totalEarnings = data.reduce((s, d) => s + (d.roi?.earnings ?? 0), 0)
  const weightedROI =
    totalInvested > 0
      ? data.reduce((s, d) => s + ((d.roi?.monthlyROI ?? 0) * d.allocation.investedAmount), 0) / totalInvested
      : 0
  return { portfolioCount: data.length, totalInvested, totalEarnings, avgMonthlyROI: weightedROI }
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function InvestorReportPage() {
  const { user } = useAuthStore()
  const { periodType, selectedPeriod, setPeriodType, setSelectedPeriod } = useReportFilterStore()
  const [allData, setAllData] = useState<PortfolioReportData[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch all portfolio data once on mount
  useEffect(() => {
    if (!user) return

    async function loadReport() {
      const allocations = await getAllocationsForInvestor(user!.uid)
      if (allocations.length === 0) {
        setLoading(false)
        return
      }

      const results = await Promise.allSettled(
        allocations.map(async (alloc) => {
          const [portfolio, finData, mgmtReports, pnlReports] = await Promise.all([
            getPortfolio(alloc.portfolioId),
            getFinancialData(alloc.portfolioId),
            getManagementReports(alloc.portfolioId),
            getReports(alloc.portfolioId, 'pnl'),
          ])

          // Build map of all PnL reports keyed by normalized period
          const pnlByPeriod = new Map<string, PnLExtractedData>()
          for (const report of pnlReports) {
            const key = normalizePeriod(report.period)
            const extracted = report.extractedData as PnLExtractedData | null
            if (extracted) {
              pnlByPeriod.set(key, { ...extracted, period: key })
            }
          }

          return {
            allocation: alloc,
            portfolio: portfolio!,
            financialData: finData,
            managementReports: mgmtReports,
            pnlByPeriod,
          } satisfies PortfolioReportData
        }),
      )

      const fulfilled = results
        .filter((r): r is PromiseFulfilledResult<PortfolioReportData> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((d) => d.portfolio != null)

      setAllData(fulfilled)
      setLoading(false)
    }

    loadReport()
  }, [user])

  // Collect all available periods across all portfolios
  const allAvailableMonths = useMemo(() => {
    const set = new Set<string>()
    for (const d of allData) {
      for (const key of d.pnlByPeriod.keys()) set.add(key)
    }
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [allData])

  const availablePeriods = useMemo(
    () => extractAvailablePeriods(allAvailableMonths),
    [allAvailableMonths],
  )

  // Auto-select latest period when selectedPeriod is empty
  const effectivePeriod = useMemo(() => {
    if (periodType === 'all') return 'all'
    if (selectedPeriod) return selectedPeriod
    const options =
      periodType === 'monthly'
        ? availablePeriods.monthly
        : periodType === 'quarterly'
          ? availablePeriods.quarterly
          : availablePeriods.yearly
    return options[0]?.value ?? ''
  }, [periodType, selectedPeriod, availablePeriods])

  // Derive period-filtered view data
  const portfolioViewData = useMemo<PortfolioViewData[]>(() => {
    if (!effectivePeriod) return allData.map((d) => ({ ...d, aggregatedPnL: null, roi: null }))

    return allData.map((d) => {
      const aggregatedPnL = aggregatePnLForPeriod(
        d.pnlByPeriod,
        periodType,
        effectivePeriod,
        allAvailableMonths,
      )

      let roi: ReturnType<typeof calculateInvestorROI> | null = null
      if (d.financialData?.investorConfig && aggregatedPnL) {
        const cfg = d.financialData.investorConfig
        roi = calculateInvestorROI(
          aggregatedPnL.netProfit,
          d.allocation.slots,
          cfg.totalSlots,
          cfg.investorSharePercent,
          cfg.arunamiFeePercent,
          cfg.nominalPerSlot,
        )
      }

      return { ...d, aggregatedPnL, roi }
    })
  }, [allData, periodType, effectivePeriod, allAvailableMonths])

  const summary = useMemo(() => computeSummary(portfolioViewData), [portfolioViewData])

  const periodLabel = effectivePeriod ? formatPeriodLabel(periodType, effectivePeriod) : '-'

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (allData.length === 0) {
    return (
      <div className="p-8 text-muted-foreground">
        Belum ada portofolio yang dialokasikan untuk akun Anda.
      </div>
    )
  }

  const now = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Period options for the second dropdown
  const periodOptions =
    periodType === 'monthly'
      ? availablePeriods.monthly
      : periodType === 'quarterly'
        ? availablePeriods.quarterly
        : periodType === 'yearly'
          ? availablePeriods.yearly
          : []

  return (
    <div className="min-h-screen">
      {/* Toolbar — hidden when printing */}
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between print:hidden">
        <h2 className="text-lg font-bold">Laporan Investor</h2>
        <div className="flex items-center gap-3">
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="quarterly">Kuartalan</SelectItem>
              <SelectItem value="yearly">Tahunan</SelectItem>
              <SelectItem value="all">Semua Waktu</SelectItem>
            </SelectContent>
          </Select>
          {periodType !== 'all' && periodOptions.length > 0 && (
            <Select value={effectivePeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="h-9 w-52 text-xs">
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => window.print()} size="sm">
            <Printer className="mr-2 h-4 w-4" />
            Print / Simpan PDF
          </Button>
        </div>
      </div>

      {/* Report body */}
      <div key={effectivePeriod} className="max-w-4xl mx-auto p-8 space-y-8 print:max-w-none print:p-0">
        <ReportHeader investorName={user?.displayName ?? '-'} date={now} />

        <ReportSummarySection summary={summary} periodType={periodType} periodLabel={periodLabel} />

        {portfolioViewData.map((data, idx) => (
          <PortfolioSection
            key={data.allocation.id}
            data={data}
            isFirst={idx === 0}
            periodLabel={periodLabel}
            periodType={periodType}
          />
        ))}

        <ReportFooter date={now} />
      </div>
    </div>
  )
}

// ─── Report Header ───────────────────────────────────────────────────────

function ReportHeader({ investorName, date }: { investorName: string; date: string }) {
  return (
    <div className="report-no-break">
      <div className="report-brand-header bg-primary text-primary-foreground rounded-lg p-6 flex items-center gap-4 print:rounded-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
          <TrendingUp className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">LAPORAN PORTOFOLIO INVESTOR</h1>
          <p className="text-sm opacity-90">Platform ARUNAMI</p>
        </div>
      </div>
      <div className="mt-4 flex justify-between text-sm text-muted-foreground border-b pb-4">
        <span>Investor: <strong className="text-foreground">{investorName}</strong></span>
        <span>Tanggal: {date}</span>
      </div>
    </div>
  )
}

// ─── Report Summary ──────────────────────────────────────────────────────

function ReportSummarySection({
  summary,
  periodType,
  periodLabel,
}: {
  summary: ReportSummary
  periodType: PeriodType
  periodLabel: string
}) {
  const earningLabel =
    periodType === 'monthly'
      ? `Earning (${periodLabel})`
      : periodType === 'quarterly'
        ? `Earning (${periodLabel})`
        : periodType === 'yearly'
          ? `Earning (${periodLabel})`
          : 'Earning (Total)'

  const roiLabel =
    periodType === 'monthly'
      ? 'ROI Bulanan'
      : periodType === 'quarterly'
        ? 'ROI Kuartal'
        : periodType === 'yearly'
          ? 'ROI Tahunan'
          : 'ROI Total'

  const stats = [
    { label: 'Total Portofolio', value: String(summary.portfolioCount) },
    { label: 'Total Investasi', value: formatCurrencyExact(summary.totalInvested) },
    { label: earningLabel, value: formatCurrencyExact(summary.totalEarnings) },
    { label: roiLabel, value: formatPercent(summary.avgMonthlyROI, true) },
  ]

  return (
    <div className="report-no-break grid grid-cols-2 gap-4 print:grid-cols-4">
      {stats.map(({ label, value }) => (
        <Card key={label} className="print:border print:shadow-none">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold mt-1">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Portfolio Section ───────────────────────────────────────────────────

function PortfolioSection({
  data,
  isFirst,
  periodLabel,
  periodType,
}: {
  data: PortfolioViewData
  isFirst: boolean
  periodLabel: string
  periodType: PeriodType
}) {
  const { allocation, portfolio, financialData, managementReports, aggregatedPnL, roi } = data

  // Find management report within selected period range
  const sortedMgmt = [...managementReports].sort((a, b) =>
    comparePeriods(normalizePeriod(b.period), normalizePeriod(a.period)),
  )
  const latestMgmt = sortedMgmt[0] ?? null

  const roiPeriodLabel =
    periodType === 'monthly'
      ? 'ROI Bulanan'
      : periodType === 'quarterly'
        ? 'ROI Kuartal'
        : periodType === 'yearly'
          ? 'ROI Tahunan'
          : 'ROI Total'

  const showAnnualROI = periodType === 'monthly'

  return (
    <div className={isFirst ? '' : 'report-portfolio-section'}>
      <Card className="print:border print:shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {portfolio.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">({portfolio.code})</span>
            </CardTitle>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {portfolio.stage}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Portfolio Info */}
          <div className="report-no-break">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Informasi Portofolio
            </h4>
            <InfoTable
              rows={[
                ['Periode', portfolio.periode],
                ['Investasi Awal', formatCurrencyExact(portfolio.investasiAwal)],
                ['Slot Saya', `${allocation.slots} dari ${financialData?.investorConfig.totalSlots ?? '-'} slot`],
                ['Kepemilikan', roi ? formatPercent(roi.ownershipPct, false) : '-'],
                ['Total Investasi Saya', formatCurrencyExact(allocation.investedAmount)],
              ]}
            />
          </div>

          {/* Financial Performance */}
          {aggregatedPnL ? (
            <div className="report-no-break">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Kinerja Keuangan — {periodLabel}
              </h4>
              <InfoTable
                rows={[
                  ['Revenue', formatCurrencyExact(aggregatedPnL.revenue)],
                  ['COGS', formatCurrencyExact(aggregatedPnL.cogs)],
                  ['Gross Profit', formatCurrencyExact(aggregatedPnL.grossProfit)],
                  ['Total Opex', formatCurrencyExact(aggregatedPnL.totalOpex)],
                  ['Net Profit', formatCurrencyExact(aggregatedPnL.netProfit)],
                ]}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Data keuangan belum tersedia untuk periode ini.
            </p>
          )}

          {/* Return Calculation */}
          {roi && (
            <div className="report-no-break">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Perhitungan Return
              </h4>
              <InfoTable
                rows={[
                  ['Bagian Investor (Earning)', formatCurrencyExact(roi.earnings)],
                  [roiPeriodLabel, formatPercent(roi.monthlyROI, true)],
                  ...(showAnnualROI
                    ? [['Annual ROI (Est.)', formatPercent(roi.annualROI, true)] as [string, string]]
                    : []),
                ]}
              />
            </div>
          )}

          {/* Management Highlights */}
          {latestMgmt && (
            <div className="report-no-break">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Ringkasan Manajemen — {formatPeriod(normalizePeriod(latestMgmt.period))}
              </h4>

              {latestMgmt.businessSummary && (
                <p className="text-sm mb-3 leading-relaxed">{latestMgmt.businessSummary}</p>
              )}

              {latestMgmt.issues.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium mb-1.5">Isu Utama:</p>
                  <div className="space-y-1.5">
                    {latestMgmt.issues.slice(0, 3).map((issue) => (
                      <IssueRow key={issue.id} issue={issue} />
                    ))}
                  </div>
                </div>
              )}

              {latestMgmt.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">Action Items:</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {latestMgmt.actionItems.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        {item.title}
                        <span className="ml-1 text-xs">
                          ({item.status === 'done' ? 'Selesai' : item.status === 'in_progress' ? 'Berjalan' : 'Pending'})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm report-financial-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b last:border-b-0">
            <td className="py-2 text-muted-foreground w-[45%]">{label}</td>
            <td className="py-2 font-medium text-right">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IssueRow({ issue }: { issue: Issue }) {
  const severityStyles: Record<string, string> = {
    high: 'bg-red-100 text-red-800 report-severity-high',
    medium: 'bg-amber-100 text-amber-800 report-severity-medium',
    low: 'bg-blue-100 text-blue-800 report-severity-low',
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <span>{issue.title}</span>
        <span className={`ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${severityStyles[issue.severity] ?? ''}`}>
          {issue.severity}
        </span>
      </div>
    </div>
  )
}

// ─── Report Footer ───────────────────────────────────────────────────────

function ReportFooter({ date }: { date: string }) {
  return (
    <div className="report-no-break border-t pt-6 mt-8 text-xs text-muted-foreground text-center space-y-1">
      <p>Dokumen ini digenerate secara otomatis oleh Platform ARUNAMI.</p>
      <p>Tanggal cetak: {date}</p>
    </div>
  )
}
