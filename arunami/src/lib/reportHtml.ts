import { formatCurrencyExact, formatPercent } from './utils'
import { formatPeriod, comparePeriods } from './dateUtils'
import type {
  Portfolio, PnLExtractedData, ProjectionExtractedData,
  ManagementReport, Note, InvestorAllocation,
} from '@/types'

interface BuildArgs {
  portfolio: Portfolio
  allocation?: InvestorAllocation
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

export function buildInvestorReportHtml(args: BuildArgs): string {
  const { portfolio, allocation, period, pnlReports, projectionReports, managementReports, notes } = args

  const latestPnl = pnlReports.find(r => r.period === period) ?? null
  const latestProj = projectionReports.find(r => r.period === period) ?? null
  const latestMgmt = [...managementReports]
    .sort((a, b) => comparePeriods(a.period, b.period))
    .filter(r => comparePeriods(r.period, period) <= 0)
    .at(-1) ?? null

  // Investor-specific numbers (if allocation passed)
  let investorKpiBlock = ''
  if (allocation && latestPnl) {
    const netProfit = latestPnl.netProfit
    const ownership = portfolio.investasiAwal > 0
      ? allocation.investedAmount / portfolio.investasiAwal
      : 0
    // Pull investor/arunami share from the same formula used elsewhere in-app.
    // We don't have direct access to config here, so derive via ownership of
    // the net profit (approximation: investor receives share proportional to
    // their invested amount). The publishing flow always persists this
    // snapshot, so it's fine to freeze this figure at publish time.
    const investorEarning = netProfit * ownership
    const monthlyROI = allocation.investedAmount > 0
      ? (investorEarning / allocation.investedAmount) * 100
      : 0
    const annualROI = monthlyROI * 12
    investorKpiBlock = `
      <h2>Ringkasan Saya</h2>
      <div class="kpi">
        <div><span>Total Investasi</span><strong>${formatCurrencyExact(allocation.investedAmount)}</strong></div>
        <div><span>Kepemilikan</span><strong>${formatPercent(ownership * 100)}</strong></div>
        <div><span>Net untuk Investor</span><strong>${formatCurrencyExact(investorEarning)}</strong></div>
        <div><span>Monthly ROI</span><strong>${formatPercent(monthlyROI, true)}</strong></div>
        <div><span>Annual ROI (×12)</span><strong>${formatPercent(annualROI, true)}</strong></div>
      </div>
    `
  }

  const pnlSection = latestPnl ? `
    <h2>Laporan Keuangan — ${formatPeriod(latestPnl.period)}</h2>
    <table class="data">
      ${row('Revenue', latestPnl.revenue)}
      ${row('COGS', latestPnl.cogs)}
      ${row('Gross Profit', latestPnl.grossProfit)}
      ${row('Total Opex', latestPnl.totalOpex)}
      ${row('Operating Profit', latestPnl.operatingProfit)}
      ${row('Net Profit', latestPnl.netProfit)}
    </table>
  ` : '<p><em>Belum ada data P&amp;L untuk periode ini.</em></p>'

  const projSection = latestProj ? `
    <h2>Proyeksi — ${formatPeriod(latestProj.period)}</h2>
    <table class="data">
      ${row('Projected Revenue', latestProj.projectedRevenue)}
      ${row('Projected COGS', latestProj.projectedCogs)}
      ${row('Projected Gross Profit', latestProj.projectedGrossProfit)}
      ${row('Projected Total Opex', latestProj.projectedTotalOpex)}
      ${row('Projected Net Profit', latestProj.projectedNetProfit)}
    </table>
  ` : ''

  const costSection = latestPnl && latestPnl.opex?.length ? `
    <h2>Struktur Biaya</h2>
    <table class="data">
      <tr><th>Item</th><th style="text-align:right">Jumlah</th></tr>
      ${latestPnl.opex.map(o => `<tr><td>${o.name}</td><td style="text-align:right">${formatCurrencyExact(o.amount)}</td></tr>`).join('')}
    </table>
  ` : ''

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
  ${projSection}
  ${costSection}
  ${issuesSection}
  ${actionsSection}
  ${notesSection}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${new Date().toLocaleString('id-ID')}</div>
</body>
</html>`
}
