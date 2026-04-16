import { formatCurrencyExact, formatPercent } from './utils'
import { formatPeriod, comparePeriods } from './dateUtils'
import type {
  Portfolio, PnLExtractedData, ProjectionExtractedData,
  ManagementReport, Note, InvestorAllocation,
} from '@/types'

interface BuildArgs {
  portfolio: Portfolio
  allocation?: InvestorAllocation
  /** Global investor-pool share of Net Profit, in percent (e.g. 70 = 70%). */
  investorSharePercent: number
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
  const {
    portfolio, allocation, investorSharePercent, period,
    pnlReports, projectionReports, managementReports, notes,
  } = args

  const latestPnl = pnlReports.find(r => r.period === period) ?? null
  const latestProj = projectionReports.find(r => r.period === period) ?? null
  const latestMgmt = [...managementReports]
    .sort((a, b) => comparePeriods(a.period, b.period))
    .filter(r => comparePeriods(r.period, period) <= 0)
    .at(-1) ?? null

  // Derive Operating Profit defensively: some legacy reports stored 0 when
  // Gemini didn't populate the field. Always recompute from grossProfit and
  // totalOpex so the displayed table is internally consistent.
  const derivedOperatingProfit = latestPnl
    ? (latestPnl.grossProfit ?? 0) - (latestPnl.totalOpex ?? 0)
    : 0

  // Net Profit → × global investor pool share → × this investor's ownership
  // of that pool → Net Investor.
  const investorPoolShare = investorSharePercent / 100
  const investorOwnership = allocation?.ownershipPercent != null
    ? allocation.ownershipPercent / 100
    : (allocation && portfolio.investasiAwal > 0
        ? allocation.investedAmount / portfolio.investasiAwal
        : 0)
  const netProfit = latestPnl?.netProfit ?? 0
  const afterPoolShare = netProfit * investorPoolShare
  const netInvestor = afterPoolShare * investorOwnership

  // Investor-specific numbers (if allocation passed)
  let investorKpiBlock = ''
  if (allocation && latestPnl) {
    const monthlyROI = allocation.investedAmount > 0
      ? (netInvestor / allocation.investedAmount) * 100
      : 0
    const annualROI = monthlyROI * 12
    investorKpiBlock = `
      <h2>Ringkasan Saya</h2>
      <div class="kpi">
        <div><span>Total Investasi</span><strong>${formatCurrencyExact(allocation.investedAmount)}</strong></div>
        <div><span>Kepemilikan</span><strong>${formatPercent(investorOwnership * 100)}</strong></div>
        <div><span>Net untuk Investor</span><strong>${formatCurrencyExact(netInvestor)}</strong></div>
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
      ${row('Operating Profit', derivedOperatingProfit)}
      ${row('Net Profit', latestPnl.netProfit)}
    </table>
  ` : '<p><em>Belum ada data P&amp;L untuk periode ini.</em></p>'

  const netInvestorSection = (allocation && latestPnl) ? `
    <h2>Net Investor — ${formatPeriod(latestPnl.period)}</h2>
    <p style="font-size:12px;color:#555;margin-top:4px">
      Perhitungan bagian keuntungan Anda untuk periode ini, dari Net Profit proyek sampai Net Investor.
    </p>
    <table class="data">
      <tr>
        <td><strong>Net Profit</strong><div style="font-size:11px;color:#666;margin-top:2px">Laba bersih proyek setelah seluruh biaya, bunga, dan pajak.</div></td>
        <td style="text-align:right">${formatCurrencyExact(netProfit)}</td>
      </tr>
      <tr>
        <td><strong>× Investor Share</strong><div style="font-size:11px;color:#666;margin-top:2px">Porsi Net Profit yang dialokasikan ke seluruh pool investor proyek ini.</div></td>
        <td style="text-align:right">${investorSharePercent}%</td>
      </tr>
      <tr>
        <td><strong>Bagian Pool Investor</strong><div style="font-size:11px;color:#666;margin-top:2px">Net Profit × Investor Share. Total yang dibagikan ke seluruh investor.</div></td>
        <td style="text-align:right">${formatCurrencyExact(afterPoolShare)}</td>
      </tr>
      <tr>
        <td><strong>× Kepemilikan Anda</strong><div style="font-size:11px;color:#666;margin-top:2px">Persentase slot/modal Anda terhadap total pool investor.</div></td>
        <td style="text-align:right">${formatPercent(investorOwnership * 100)}</td>
      </tr>
      <tr style="background:#f5faf7">
        <td><strong style="color:#1e5f3f">Net Investor</strong><div style="font-size:11px;color:#666;margin-top:2px">Bagian Pool Investor × Kepemilikan Anda. Inilah bagian Anda untuk periode ini.</div></td>
        <td style="text-align:right"><strong style="color:#1e5f3f;font-size:15px">${formatCurrencyExact(netInvestor)}</strong></td>
      </tr>
    </table>
  ` : ''

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
  ${netInvestorSection}
  ${projSection}
  ${costSection}
  ${issuesSection}
  ${actionsSection}
  ${notesSection}
  <div class="footer">Diterbitkan oleh Tim Arunami — ${new Date().toLocaleString('id-ID')}</div>
</body>
</html>`
}
