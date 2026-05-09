import { formatCurrencyExact, formatPercent } from './utils'
import { formatPeriod, comparePeriods, isQuarterPeriod, quarterToMonths, previousPeriod } from './dateUtils'
import { calculateDistribution } from './distributionStrategies'
import type { DistributionResult } from './distributionStrategies'
import type {
  Portfolio, PortfolioConfig, PnLExtractedData, ProjectionExtractedData,
  ManagementReport, Note, InvestorAllocation, InvestorConfigUnion,
  OpexItem, CustomSubItem,
} from '@/types'

interface BuildArgs {
  portfolio: Portfolio
  config?: PortfolioConfig
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
`

function row(label: string, val: number): string {
  return `<tr><td>${label}</td><td style="text-align:right">${formatCurrencyExact(val)}</td></tr>`
}

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

export function buildInvestorReportHtml(args: BuildArgs): string {
  const {
    portfolio, config, allocation, investorSharePercent, isArunamiTeam, period,
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

  // Determine model type from config, falling back to percentage_based
  const modelType = config?.investorConfig?.type ?? 'percentage_based'
  const investorConfig = config?.investorConfig ?? {
    type: 'percentage_based' as const,
    investorSharePercent,
    arunamiFeePercent: 0,
  }

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

    if (latestPnl || ['fixed_yield', 'fixed_schedule', 'annual_dividend'].includes(modelType)) {
      investorKpiBlock = buildKpiBlock(distributionResult, allocation, modelType, monthsInPeriod)
      distributionSection = buildDistributionSection(
        modelType, distributionResult, investorConfig, allocation, formatPeriod(period),
      )
    }
  }

  // Three-column comparison table: current period / previous period / projection.
  // Replaces the legacy single-column "Laporan Keuangan" + "Struktur Biaya" sections.
  const periodNoun = isQuarterly ? 'Kuartal' : 'Bulan'
  const pnlSection = latestPnl ? `
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

  const notesSection = notes.length ? `
    <h2>Arunami Notes</h2>
    ${[...notes]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .map(n => `<div class="note">${(n.content ?? '').replace(/\n/g, '<br/>')}</div>`)
      .join('')}
  ` : ''

  const audience = allocation ? `Yth. ${allocation.investorName}` : 'Laporan Portofolio'

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${portfolio.name} — ${formatPeriod(period)}</title>
<style>${baseStyles}</style>
</head>
<body>
  <h1>${audience}</h1>
  <p><strong>${portfolio.name}</strong>${portfolio.brandName ? ` · ${portfolio.brandName}` : ''} — Periode ${formatPeriod(period)}</p>
  ${investorKpiBlock}
  ${summarySection}
  ${pnlSection}
  ${distributionSection}
  ${issuesSection}
  ${actionsSection}
  ${notesSection}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${new Date().toLocaleString('id-ID')}</div>
</body>
</html>`
}
