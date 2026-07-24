import { formatCurrencyExact, formatPercent } from './utils'
import { formatPeriod, comparePeriods, isQuarterPeriod, quarterToMonths, previousPeriod } from './dateUtils'
import { calculateDistribution } from './distributionStrategies'
import type { DistributionResult } from './distributionStrategies'
import { resolveConfigForPeriod, type ConfigVersion } from './configTimeline'
import type {
  Portfolio, PortfolioConfig, PnLExtractedData, ProjectionExtractedData,
  ManagementReport, Note, InvestorAllocation, InvestorConfigUnion,
  OpexItem, CustomSubItem, ReturnModelType,
} from '@/types'
import type { AllTimeReportSummary } from './allTimeReport'

interface BuildArgs {
  portfolio: Portfolio
  config?: PortfolioConfig
  /**
   * Return-config version history. When supplied, the distribution for `period`
   * is calculated with the terms that were in force for that period rather than
   * today's — so re-rendering an old month can't restate it.
   */
  configTimeline?: ConfigVersion[]
  allocation?: InvestorAllocation
  /** Global investor-pool share of Net Profit, in percent (e.g. 70 = 70%). */
  investorSharePercent: number
  isArunamiTeam?: boolean
  period: string
  pnlReports: PnLExtractedData[]
  projectionReports: ProjectionExtractedData[]
  managementReports: ManagementReport[]
  notes: Note[]
}

const baseStyles = `
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; max-width: 820px; margin: 0 auto; padding: 40px 24px; }
  h1 { color: #1e5f3f; font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #1e5f3f; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; }
  p, li { font-size: 13px; line-height: 1.55; }
  table.data { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.data td, table.data th { padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #eee; }
  table.data th { background: #f5f5f5; text-align: left; }
  .note { background: #f9fafb; border-left: 3px solid #38a169; padding: 10px 12px; margin: 8px 0; font-size: 13px; }
  .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
  .kpi { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
  .kpi div { flex: 1 1 170px; background: #f5faf7; border: 1px solid #d6ead9; border-radius: 6px; padding: 10px 12px; }
  .kpi span { display: block; font-size: 11px; color: #555; }
  .kpi strong { display: block; font-size: 15px; color: #1e5f3f; margin-top: 2px; }
  /* All-time report */
  .alltime-hero { background: linear-gradient(135deg, #1e5f3f, #38a169); color: #fff; border-radius: 10px; padding: 22px 24px; margin-top: 12px; }
  .alltime-hero h1 { color: #fff; font-size: 20px; margin: 0; }
  .alltime-hero .range { font-size: 12px; opacity: .9; margin-top: 2px; }
  .alltime-hero .kpi { margin-top: 16px; }
  .alltime-hero .kpi div { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); }
  .alltime-hero .kpi span { color: rgba(255,255,255,.85); }
  .alltime-hero .kpi strong { color: #fff; font-size: 17px; }
  table.data td.num, table.data th.num { text-align: right; }
  table.data tr.total { background: #f5faf7; font-weight: bold; }
  table.data tr.total td { color: #1e5f3f; }
`

function descRow(label: string, desc: string, val: string): string {
  return `<tr>
    <td><strong>${label}</strong><div style="font-size:11px;color:#666;margin-top:2px">${desc}</div></td>
    <td style="text-align:right">${val}</td>
  </tr>`
}

function highlightRow(label: string, desc: string, val: string): string {
  return `<tr style="background:#f5faf7">
    <td><strong style="color:#1e5f3f">${label}</strong><div style="font-size:11px;color:#666;margin-top:2px">${desc}</div></td>
    <td style="text-align:right"><strong style="color:#1e5f3f;font-size:15px">${val}</strong></td>
  </tr>`
}

// ─── Accumulated (all-projects) investor report ──────────────────────────────

export interface AccumulatedReportLine {
  portfolioName: string
  brandName?: string
  portfolioCode: string
  invested: number
  netProfit: number
  earnings: number
  monthlyROI: number
}

// The accumulated report is assembled from per-portfolio sections — see
// `assembleAccumulatedReportHtml` near the bottom of this file.

// ─── Three-column comparison row (current / previous / projection) ───────

export interface ThreeColRow {
  label: string
  current: number | null
  previous: number | null
  projection: number | null
}

/**
 * Build the four canonical comparison rows (Revenue, Gross Profit,
 * Operating Profit, Net Profit) from current PnL, previous PnL, and projection.
 * Operating Profit is derived (Gross Profit - Total Opex) for parity with
 * the legacy single-column section, since some uploads omit it directly.
 */
export function buildThreeColRows(
  currentPnl: PnLExtractedData | null,
  prevPnl: PnLExtractedData | null,
  projection: ProjectionExtractedData | null,
): ThreeColRow[] {
  const opOf = (p: PnLExtractedData | null): number | null =>
    p ? (p.grossProfit ?? 0) - (p.totalOpex ?? 0) : null
  return [
    {
      label: 'Revenue',
      current: currentPnl?.revenue ?? null,
      previous: prevPnl?.revenue ?? null,
      projection: projection?.projectedRevenue ?? null,
    },
    {
      label: 'Gross Profit',
      current: currentPnl?.grossProfit ?? null,
      previous: prevPnl?.grossProfit ?? null,
      projection: projection?.projectedGrossProfit ?? null,
    },
    {
      label: 'Operating Profit',
      current: opOf(currentPnl),
      previous: opOf(prevPnl),
      // Projections don't store operating profit explicitly; derive from net + interest + tax + D&A is unreliable, so leave null.
      projection: null,
    },
    {
      label: 'Net Profit',
      current: currentPnl?.netProfit ?? null,
      previous: prevPnl?.netProfit ?? null,
      projection: projection?.projectedNetProfit ?? null,
    },
  ]
}

function deltaBadge(cur: number | null, base: number | null): string {
  if (cur == null || base == null || base === 0) return ''
  const pct = ((cur - base) / Math.abs(base)) * 100
  const positive = pct >= 0
  const color = positive ? '#1e7d3a' : '#b91c1c'
  const sign = positive ? '+' : ''
  return `<div style="font-size:10px;color:${color};margin-top:2px">${sign}${pct.toFixed(1)}%</div>`
}

function threeColRow(r: ThreeColRow): string {
  const cell = (v: number | null, badge: string = '') => v == null
    ? `<td style="text-align:right;color:#9ca3af">—</td>`
    : `<td style="text-align:right">${formatCurrencyExact(v)}${badge}</td>`
  return `<tr>
    <td>${r.label}</td>
    ${cell(r.current)}
    ${cell(r.previous, deltaBadge(r.current, r.previous))}
    ${cell(r.projection, deltaBadge(r.current, r.projection))}
  </tr>`
}

// ─── Model-Specific Sections ──────────────────────────────────────────────

function feeLabel(result: DistributionResult): string {
  if (result.isFeeExempt) return 'Rp 0 (Tim Arunami — Bebas Fee)'
  return formatCurrencyExact(result.arunamiFeeAmount)
}

function buildDistributionSection(
  modelType: string,
  result: DistributionResult,
  config: InvestorConfigUnion,
  _allocation: InvestorAllocation,
  periodLabel: string,
): string {
  const b = result.breakdown
  const feeRow = config.arunamiFeePercent > 0
    ? descRow('- Arunami Fee', result.isFeeExempt ? 'Tim Arunami — Bebas Fee.' : 'Management fee Arunami.', feeLabel(result))
    : ''

  switch (modelType) {
    case 'net_profit_share':
    case 'percentage_based':
      return `
        <h2>Net Investor — ${periodLabel}</h2>
        <p style="font-size:12px;color:#555;margin-top:4px">
          Perhitungan bagian keuntungan Anda untuk periode ini, dari Net Profit proyek sampai Net Investor.
        </p>
        <table class="data">
          ${descRow('Net Profit', 'Laba bersih proyek setelah seluruh biaya, bunga, dan pajak.', formatCurrencyExact(b.netProfit ?? 0))}
          ${descRow('× Investor Share', 'Porsi Net Profit yang dialokasikan ke seluruh pool investor.', `${config.investorSharePercent}%`)}
          ${descRow('Bagian Pool Investor', 'Net Profit × Investor Share.', formatCurrencyExact(b.investorPool ?? 0))}
          ${descRow('× Kepemilikan Anda', 'Persentase modal Anda terhadap total pool investor.', formatPercent(b.ownership ?? 0))}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Net Investor', 'Bagian Anda untuk periode ini.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    case 'fixed_yield':
      return `
        <h2>Fixed Yield — ${periodLabel}</h2>
        <p style="font-size:12px;color:#555;margin-top:4px">
          Return tetap berdasarkan persentase modal investasi.
        </p>
        <table class="data">
          ${descRow('Modal Investasi', 'Basis perhitungan yield.', formatCurrencyExact(b.principal ?? 0))}
          ${descRow('× Fixed Yield', 'Persentase yield per bulan.', `${b.fixedYieldPercent ?? 0}%`)}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Pembayaran Bulan Ini', 'Yield Anda.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    case 'revenue_share':
      return `
        <h2>Revenue Share — ${periodLabel}</h2>
        <p style="font-size:12px;color:#555;margin-top:4px">
          Bagian Anda dari pendapatan bruto proyek.
        </p>
        <table class="data">
          ${descRow('Revenue', 'Pendapatan bruto proyek periode ini.', formatCurrencyExact(b.revenue ?? 0))}
          ${descRow('× Revenue Share', 'Persentase yang dialokasikan ke investor.', `${b.revenueSharePercent ?? 0}%`)}
          ${descRow('Total Share', 'Revenue × Share %.', formatCurrencyExact(b.totalShare ?? 0))}
          ${descRow('× Kepemilikan Anda', 'Porsi Anda.', formatPercent(b.ownership ?? 0))}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Bagian Anda', 'Revenue share Anda untuk periode ini.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    case 'fixed_schedule':
      return `
        <h2>Pembayaran Terjadwal — ${periodLabel}</h2>
        <table class="data">
          ${descRow('Jumlah Terjadwal', 'Pembayaran sesuai kontrak.', formatCurrencyExact(b.scheduledAmount ?? 0))}
          ${descRow('× Kepemilikan Anda', 'Porsi Anda.', formatPercent(b.ownership ?? 0))}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Pembayaran Anda', 'Bagian Anda periode ini.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    case 'annual_dividend':
      return `
        <h2>Dividen Tahunan — ${b.year ?? ''}</h2>
        <table class="data">
          ${descRow('Dividen Ditetapkan', 'Total dividen yang disetujui RUPS.', formatCurrencyExact(b.declaredDividend ?? 0))}
          ${descRow('× Kepemilikan Anda', 'Porsi Anda.', formatPercent(b.ownership ?? 0))}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Dividen Anda', 'Bagian dividen Anda.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    case 'custom':
      return `
        <h2>Distribusi Kustom — ${periodLabel}</h2>
        <table class="data">
          ${descRow('Hasil Formula', 'Kalkulasi berdasarkan formula kustom.', formatCurrencyExact(b.formulaResult ?? 0))}
          ${descRow('Gross Investor', 'Bagian kotor sebelum fee.', formatCurrencyExact(result.grossInvestorAmount))}
          ${feeRow}
          ${highlightRow('Bagian Anda', 'Distribusi Anda periode ini.', formatCurrencyExact(result.perInvestorAmount))}
        </table>`

    default:
      return ''
  }
}

function buildKpiBlock(
  result: DistributionResult,
  allocation: InvestorAllocation,
  modelType: string,
  monthsInPeriod: number = 1,
): string {
  const periodRoiLabel = monthsInPeriod === 3 ? 'Quarterly ROI' : 'Monthly ROI'
  const annualMultiplier = 12 / monthsInPeriod
  return `
    <h2>Ringkasan Saya</h2>
    <div class="kpi">
      <div><span>Total Investasi</span><strong>${formatCurrencyExact(allocation.investedAmount)}</strong></div>
      <div><span>Kepemilikan</span><strong>${formatPercent(allocation.ownershipPercent ?? 0)}</strong></div>
      <div><span>Distribusi Periode Ini</span><strong>${formatCurrencyExact(result.perInvestorAmount)}</strong></div>
      <div><span>${periodRoiLabel}</span><strong>${formatPercent(result.roiPercent, true)}</strong></div>
      ${modelType !== 'annual_dividend'
        ? `<div><span>Annual ROI (×${annualMultiplier})</span><strong>${formatPercent(result.annualRoiPercent, true)}</strong></div>`
        : `<div><span>Annual ROI</span><strong>${formatPercent(result.annualRoiPercent, true)}</strong></div>`
      }
    </div>
  `
}

// ─── Aggregation helpers (quarterly) ─────────────────────────────────────

function sumOpex(rows: OpexItem[][]): OpexItem[] {
  const map = new Map<string, number>()
  for (const list of rows) {
    for (const item of list ?? []) {
      map.set(item.name, (map.get(item.name) ?? 0) + (item.amount ?? 0))
    }
  }
  return [...map.entries()].map(([name, amount]) => ({ name, amount }))
}

function sumSubItems(rows: (CustomSubItem[] | undefined)[]): CustomSubItem[] | undefined {
  const map = new Map<string, number>()
  let any = false
  for (const list of rows) {
    if (!list) continue
    for (const item of list) {
      any = true
      map.set(item.name, (map.get(item.name) ?? 0) + (item.amount ?? 0))
    }
  }
  if (!any) return undefined
  return [...map.entries()].map(([name, amount], i) => ({ id: `agg-${i}`, name, amount }))
}

function aggregatePnls(items: PnLExtractedData[], periodLabel: string): PnLExtractedData | null {
  if (items.length === 0) return null
  return {
    period: periodLabel,
    revenue: items.reduce((s, r) => s + (r.revenue ?? 0), 0),
    cogs: items.reduce((s, r) => s + (r.cogs ?? 0), 0),
    grossProfit: items.reduce((s, r) => s + (r.grossProfit ?? 0), 0),
    opex: sumOpex(items.map(r => r.opex ?? [])),
    totalOpex: items.reduce((s, r) => s + (r.totalOpex ?? 0), 0),
    operatingProfit: items.reduce((s, r) => s + (r.operatingProfit ?? 0), 0),
    interest: items.reduce((s, r) => s + (r.interest ?? 0), 0),
    taxes: items.reduce((s, r) => s + (r.taxes ?? 0), 0),
    netProfit: items.reduce((s, r) => s + (r.netProfit ?? 0), 0),
    unitBreakdown: {},
    notes: '',
    cogsSubItems: sumSubItems(items.map(r => r.cogsSubItems)),
    revenueSubItems: sumSubItems(items.map(r => r.revenueSubItems)),
  }
}

function aggregateProjections(
  items: ProjectionExtractedData[],
  periodLabel: string,
): ProjectionExtractedData | null {
  if (items.length === 0) return null
  const projectedRevenue = items.reduce((s, r) => s + (r.projectedRevenue ?? 0), 0)
  const projectedCogs = items.reduce((s, r) => s + (r.projectedCogs ?? 0), 0)
  return {
    period: periodLabel,
    projectedRevenue,
    projectedCogsPercent: projectedRevenue > 0 ? (projectedCogs / projectedRevenue) * 100 : 0,
    projectedCogs,
    projectedGrossProfit: items.reduce((s, r) => s + (r.projectedGrossProfit ?? 0), 0),
    projectedOpex: sumOpex(items.map(r => r.projectedOpex ?? [])),
    projectedTotalOpex: items.reduce((s, r) => s + (r.projectedTotalOpex ?? 0), 0),
    projectedDepreciationAmortization: items.reduce(
      (s, r) => s + (r.projectedDepreciationAmortization ?? 0), 0,
    ),
    projectedTax: items.reduce((s, r) => s + (r.projectedTax ?? 0), 0),
    projectedNetProfit: items.reduce((s, r) => s + (r.projectedNetProfit ?? 0), 0),
    assumptions: '',
  }
}

// ─── Main Builder ─────────────────────────────────────────────────────────

export interface InvestorReportSectionResult {
  portfolioName: string
  portfolioCode: string
  brandName?: string
  periodLabel: string
  /** "Yth. {investor}" for an allocation-scoped report, else a generic title. */
  audience: string
  /** Inner HTML for this portfolio (KPIs + summary + P&L + distribution + issues/actions/media/notes). */
  content: string
  /** Summary line for the accumulated report; null when no distribution could be computed. */
  line: AccumulatedReportLine | null
}

/**
 * Compute the content sections for ONE portfolio for a period. Shared by the
 * standalone per-portfolio report ({@link buildInvestorReportHtml}) and the
 * accumulated multi-portfolio report ({@link assembleAccumulatedReportHtml}).
 */
export function buildInvestorReportSections(args: BuildArgs): InvestorReportSectionResult {
  const {
    portfolio, config, configTimeline, allocation, investorSharePercent, isArunamiTeam, period,
    pnlReports, projectionReports, managementReports, notes,
  } = args

  const isQuarterly = isQuarterPeriod(period)
  const monthsInPeriod = isQuarterly ? 3 : 1
  const constituentMonths = isQuarterly ? quarterToMonths(period) : [period]

  const latestPnl = isQuarterly
    ? aggregatePnls(
        pnlReports.filter(r => constituentMonths.includes(r.period)),
        period,
      )
    : pnlReports.find(r => r.period === period) ?? null
  const latestProj = isQuarterly
    ? aggregateProjections(
        projectionReports.filter(r => constituentMonths.includes(r.period)),
        period,
      )
    : projectionReports.find(r => r.period === period) ?? null

  // Previous period (for the 3-column comparison table)
  const prevPeriodKey = previousPeriod(period)
  const prevConstituentMonths = isQuarterly ? quarterToMonths(prevPeriodKey) : [prevPeriodKey]
  const prevPnl = isQuarterly
    ? aggregatePnls(
        pnlReports.filter(r => prevConstituentMonths.includes(r.period)),
        prevPeriodKey,
      )
    : pnlReports.find(r => r.period === prevPeriodKey) ?? null

  const mgmtCutoff = constituentMonths[constituentMonths.length - 1]
  const latestMgmt = [...managementReports]
    .sort((a, b) => comparePeriods(a.period, b.period))
    .filter(r => comparePeriods(r.period, mgmtCutoff) <= 0)
    .at(-1) ?? null

  // Resolve the config that applied to THIS period, so a later change to the
  // split (or to the model itself) never restates an earlier report.
  const periodConfig = config && configTimeline
    ? resolveConfigForPeriod(config, configTimeline, period)
    : config

  // Determine model type from config, falling back to percentage_based
  const modelType = periodConfig?.investorConfig?.type ?? 'percentage_based'
  const investorConfig = periodConfig?.investorConfig ?? {
    type: 'percentage_based' as const,
    investorSharePercent,
    arunamiFeePercent: 0,
  }

  // Grace period overrides the portfolio's post-grace model for this report:
  // the distribution (if any) is the grace return, and the model used to render
  // the KPI/distribution blocks is the grace return mode, not modelType.
  const isGrace = portfolio.isGracePeriod === true
  const graceMode = portfolio.graceConfig?.returnMode ?? 'none'
  const effectiveModel: ReturnModelType =
    isGrace && graceMode === 'fixed_yield' ? 'fixed_yield' : modelType

  // Calculate distribution using the strategy pattern
  let distributionResult: DistributionResult | null = null
  let investorKpiBlock = ''
  let distributionSection = ''

  if (allocation) {
    const reportData = latestPnl ? {
      period,
      revenue: latestPnl.revenue,
      netProfit: latestPnl.netProfit,
      grossProfit: latestPnl.grossProfit,
    } : null

    distributionResult = calculateDistribution({
      reportData,
      config: investorConfig,
      allocation,
      portfolio,
      isArunamiTeam,
      monthsInPeriod,
      scheduleMonths: constituentMonths,
    })

    const shouldShowDistribution = isGrace
      ? graceMode === 'fixed_yield'
      : !!latestPnl || ['fixed_yield', 'fixed_schedule', 'annual_dividend'].includes(modelType)

    if (shouldShowDistribution) {
      investorKpiBlock = buildKpiBlock(distributionResult, allocation, effectiveModel, monthsInPeriod)
      distributionSection = buildDistributionSection(
        effectiveModel, distributionResult, investorConfig, allocation, formatPeriod(period),
      )
    }
  }

  // Grace context banner (replaces the "no PnL" note, which is expected in grace).
  const graceNoticeSection = isGrace ? `
    <div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:8px;padding:12px 16px;margin:12px 0">
      <p style="margin:0;font-weight:600;color:#92400e">Proyek dalam Masa Grace Period</p>
      <p style="margin:4px 0 0;font-size:13px;color:#b45309">
        ${graceMode === 'fixed_yield'
          ? 'Selama masa grace period, investor menerima fixed yield dari modal sebagaimana dirinci di bawah. Laporan PnL penuh akan tersedia setelah proyek mulai beroperasi.'
          : 'Selama masa grace period belum ada distribusi bagi hasil. Laporan ini bersifat informatif mengenai perkembangan proyek.'}
        ${portfolio.graceConfig?.expectedOperationalDate
          ? ` Estimasi mulai operasional: ${portfolio.graceConfig.expectedOperationalDate}.`
          : ''}
      </p>
    </div>
  ` : ''

  // Three-column comparison table: current period / previous period / projection.
  // Replaces the legacy single-column "Laporan Keuangan" + "Struktur Biaya" sections.
  const periodNoun = isQuarterly ? 'Kuartal' : 'Bulan'
  const pnlSection = isGrace ? '' : latestPnl ? `
    <h2>Laporan Keuangan — ${formatPeriod(latestPnl.period)}</h2>
    <table class="data">
      <tr>
        <th></th>
        <th style="text-align:right">Aktual ${formatPeriod(period)}</th>
        <th style="text-align:right">Aktual ${periodNoun} Lalu</th>
        <th style="text-align:right">Proyeksi ${formatPeriod(period)}</th>
      </tr>
      ${buildThreeColRows(latestPnl, prevPnl, latestProj).map(threeColRow).join('')}
    </table>
  ` : '<p><em>Belum ada data P&amp;L untuk periode ini.</em></p>'

  // projSection and costSection removed per CEO feedback:
  // the 3-column pnlSection above already surfaces projection alongside actuals,
  // and cost-structure detail is intentionally hidden from the investor view.

  const summarySection = latestMgmt?.businessSummary
    ? `<h2>Business Summary</h2><p>${latestMgmt.businessSummary.replace(/\n/g, '<br/>')}</p>`
    : ''

  const issuesSection = latestMgmt && latestMgmt.issues?.length ? `
    <h2>Isu</h2>
    <ul>${latestMgmt.issues.map(i => `<li><strong>[${i.severity.toUpperCase()}]</strong> ${i.title}${i.description ? ` — ${i.description}` : ''}</li>`).join('')}</ul>
  ` : ''

  const actionsSection = latestMgmt && latestMgmt.actionItems?.length ? `
    <h2>Action Items</h2>
    <ul>${latestMgmt.actionItems.map(a => `<li><strong>[${a.status}]</strong> ${a.title}${a.assignee ? ` — ${a.assignee}` : ''}</li>`).join('')}</ul>
  ` : ''

  const mediaSection = latestMgmt && latestMgmt.media?.length ? `
    <h2>Dokumentasi</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
      ${latestMgmt.media.map(m => m.type === 'image'
        ? `<img src="${m.fileUrl}" alt="${m.fileName}" style="max-width:240px;max-height:180px;border-radius:6px;border:1px solid #e5e7eb;object-fit:cover" />`
        : `<a href="${m.fileUrl}" style="display:inline-block;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;text-decoration:none">▶ ${m.fileName}</a>`,
      ).join('')}
    </div>
  ` : ''

  const notesSection = notes.length ? `
    <h2>Arunami Notes</h2>
    ${[...notes]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .map(n => `<div class="note">${(n.content ?? '').replace(/\n/g, '<br/>')}</div>`)
      .join('')}
  ` : ''

  const content = `${graceNoticeSection}${investorKpiBlock}${summarySection}${pnlSection}${distributionSection}${issuesSection}${actionsSection}${mediaSection}${notesSection}`

  const line: AccumulatedReportLine | null = (allocation && distributionResult) ? {
    portfolioName: portfolio.name,
    brandName: portfolio.brandName,
    portfolioCode: allocation.portfolioCode,
    invested: allocation.investedAmount,
    netProfit: latestPnl?.netProfit ?? distributionResult.breakdown.netProfit ?? 0,
    earnings: distributionResult.perInvestorAmount,
    monthlyROI: distributionResult.roiPercent,
  } : null

  return {
    portfolioName: portfolio.name,
    portfolioCode: allocation?.portfolioCode ?? '',
    brandName: portfolio.brandName,
    periodLabel: formatPeriod(period),
    audience: allocation ? `Yth. ${allocation.investorName}` : 'Laporan Portofolio',
    content,
    line,
  }
}

/** Wrap report body HTML in the shared self-contained document shell + CSS. */
export function renderReportDoc(args: { title: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${args.title}</title>
<style>${baseStyles}</style>
</head>
<body>
${args.bodyHtml}
</body>
</html>`
}

/** Standalone per-portfolio investor report (one project, one period). */
export function buildInvestorReportHtml(args: BuildArgs): string {
  const s = buildInvestorReportSections(args)
  const brand = s.brandName?.trim() || s.portfolioName
  return renderReportDoc({
    title: `${brand} — ${s.periodLabel}`,
    bodyHtml: `
  <h1>${s.audience}</h1>
  <p><strong>${brand}</strong>${brand !== s.portfolioName ? ` · ${s.portfolioName}` : ''} — Periode ${s.periodLabel}</p>
  ${s.content}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${new Date().toLocaleString('id-ID')}</div>`,
  })
}

/**
 * Assemble an investor's accumulated report: one detailed page per portfolio
 * (the same content as the standalone per-portfolio report) followed by a
 * cross-project summary. Self-contained HTML for print-to-PDF or `<iframe srcDoc>`.
 */
export function assembleAccumulatedReportHtml(args: {
  investorName: string
  periodLabel: string
  sections: InvestorReportSectionResult[]
  generatedAt?: string
}): string {
  const { investorName, periodLabel, sections } = args
  const lines = sections.map(s => s.line).filter((l): l is AccumulatedReportLine => l != null)
  const totalEarnings = lines.reduce((s, l) => s + l.earnings, 0)
  const totalInvested = lines.reduce((s, l) => s + l.invested, 0)
  const generatedAt = args.generatedAt ?? new Date().toLocaleString('id-ID')

  const projectPages = sections.map((s, i) => {
    const brand = s.brandName?.trim() || s.portfolioName
    return `
    <div${i > 0 ? ' style="page-break-before:always"' : ''}>
      <h1 style="border-top:3px solid #1e5f3f;padding-top:16px${i > 0 ? '' : ';margin-top:24px'}">${brand}</h1>
      <p style="color:#666;font-size:12px;margin-top:2px">${brand !== s.portfolioName ? `${s.portfolioName} · ` : ''}Periode ${s.periodLabel}</p>
      ${s.content}
    </div>`
  }).join('')

  const summary = `
    <div style="page-break-before:always">
      <h1 style="border-top:3px solid #1e5f3f;padding-top:16px">Ringkasan Semua Proyek</h1>
      <div class="kpi">
        <div><span>Total Investasi</span><strong>${formatCurrencyExact(totalInvested)}</strong></div>
        <div><span>Total Earning</span><strong>${formatCurrencyExact(totalEarnings)}</strong></div>
        <div><span>Jumlah Proyek</span><strong>${lines.length}</strong></div>
      </div>
      <h2>Rincian per Proyek</h2>
      <table class="data">
        <thead>
          <tr>
            <th>Portofolio</th>
            <th style="text-align:right">Investasi</th>
            <th style="text-align:right">Net Profit</th>
            <th style="text-align:right">Earning</th>
            <th style="text-align:right">ROI</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(l => `
            <tr>
              <td>${l.brandName?.trim() || l.portfolioName}<div style="font-size:11px;color:#666">${l.portfolioCode}</div></td>
              <td style="text-align:right">${formatCurrencyExact(l.invested)}</td>
              <td style="text-align:right">${formatCurrencyExact(l.netProfit)}</td>
              <td style="text-align:right">${formatCurrencyExact(l.earnings)}</td>
              <td style="text-align:right">${formatPercent(l.monthlyROI)}</td>
            </tr>
          `).join('')}
          <tr style="background:#f5faf7;font-weight:bold">
            <td>Total</td>
            <td style="text-align:right">${formatCurrencyExact(totalInvested)}</td>
            <td></td>
            <td style="text-align:right;color:#1e5f3f">${formatCurrencyExact(totalEarnings)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`

  return renderReportDoc({
    title: `Laporan Investor — ${investorName} — ${periodLabel}`,
    bodyHtml: `
  <h1>Laporan Investor</h1>
  <p><strong>${investorName}</strong> — Ringkasan Semua Proyek · Periode ${periodLabel}</p>
  ${projectPages}
  ${summary}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${generatedAt}</div>`,
  })
}

/**
 * Assemble an investor's ALL-TIME report — a single-page lifetime summary across
 * all portfolios and all published periods. Deliberately distinct from the
 * per-period accumulated report: a hero KPI band, a cumulative per-portfolio
 * table, and a period-by-period earnings trend. Self-contained for print / iframe.
 */
export function assembleAllTimeReportHtml(
  summary: AllTimeReportSummary,
  generatedAt?: string,
): string {
  const { investorName, lines, totalInvested, totalCumulativeEarnings, overallROI, coverage } = summary
  const stamp = generatedAt ?? new Date().toLocaleString('id-ID')
  const rangeLabel = coverage.firstMonth && coverage.latestMonth
    ? `${formatPeriod(coverage.firstMonth)} – ${formatPeriod(coverage.latestMonth)}`
    : 'Belum ada periode terbit'

  const hero = `
    <div class="alltime-hero">
      <h1>Laporan Sepanjang Waktu</h1>
      <div class="range">${investorName} · ${rangeLabel}</div>
      <div class="kpi">
        <div><span>Total Investasi</span><strong>${formatCurrencyExact(totalInvested)}</strong></div>
        <div><span>Total Earning (All-Time)</span><strong>${formatCurrencyExact(totalCumulativeEarnings)}</strong></div>
        <div><span>ROI Keseluruhan</span><strong>${formatPercent(overallROI)}</strong></div>
        <div><span>Jumlah Proyek</span><strong>${lines.length}</strong></div>
        <div><span>Bulan Tercatat</span><strong>${coverage.monthsCounted}</strong></div>
      </div>
    </div>`

  const portfolioTable = `
    <h2>Kinerja per Proyek (Akumulatif)</h2>
    <table class="data">
      <thead>
        <tr>
          <th>Portofolio</th>
          <th class="num">Investasi</th>
          <th class="num">Earning Kumulatif</th>
          <th class="num">ROI All-Time</th>
          <th class="num">Bulan</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map(l => `
          <tr>
            <td>${l.brandName?.trim() || l.portfolioName}<div style="font-size:11px;color:#666">${l.portfolioCode}</div></td>
            <td class="num">${formatCurrencyExact(l.invested)}</td>
            <td class="num">${formatCurrencyExact(l.cumulativeEarnings)}</td>
            <td class="num">${formatPercent(l.allTimeROI)}</td>
            <td class="num">${l.monthsCounted}</td>
          </tr>
        `).join('')}
        <tr class="total">
          <td>Total</td>
          <td class="num">${formatCurrencyExact(totalInvested)}</td>
          <td class="num">${formatCurrencyExact(totalCumulativeEarnings)}</td>
          <td class="num">${formatPercent(overallROI)}</td>
          <td class="num"></td>
        </tr>
      </tbody>
    </table>`

  // Trend: total earnings per month across all portfolios.
  const monthTotals = new Map<string, number>()
  for (const l of lines) {
    for (const p of l.byPeriod) {
      monthTotals.set(p.period, (monthTotals.get(p.period) ?? 0) + p.earnings)
    }
  }
  const trendMonths = [...monthTotals.keys()].sort(comparePeriods)
  const trendTable = trendMonths.length ? `
    <h2>Tren Earning per Periode</h2>
    <table class="data">
      <thead>
        <tr><th>Periode</th><th class="num">Total Earning</th></tr>
      </thead>
      <tbody>
        ${trendMonths.map(m => `
          <tr>
            <td>${formatPeriod(m)}</td>
            <td class="num">${formatCurrencyExact(monthTotals.get(m) ?? 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : ''

  const emptyState = lines.length === 0
    ? '<p style="margin-top:16px"><em>Belum ada laporan periodik yang diterbitkan, sehingga belum ada data sepanjang waktu.</em></p>'
    : ''

  return renderReportDoc({
    title: `Laporan Sepanjang Waktu — ${investorName}`,
    bodyHtml: `
  ${hero}
  ${emptyState}
  ${lines.length ? portfolioTable : ''}
  ${trendTable}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${stamp}</div>`,
  })
}
