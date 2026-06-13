# All-Time Investor Report

## Overview

Adds a **lifetime ("all-time") report** that aggregates an investor's
performance across *all* their portfolios and *all* published periods — total
invested, total earnings, and ROI from their first investment up to the latest
published report.

- **Investor Relations (IR)** generates and publishes it, exactly like the
  existing per-period accumulated report (a stored, view-only HTML artifact).
- **Investors** read it on a new dedicated **"Laporan Saya"** page
  (`/investor/reports`) that toggles between an **All-Time** view and the
  existing **Bulanan / Kuartalan** (periodic) view.

It deliberately reuses the per-period distribution engine, so the all-time
totals reconcile with the per-period reports, `AdminInvestorDetail`, and
`InvestorReturnsPage`.

## How it works

### 1. Calculation — [src/lib/allTimeReport.ts](../src/lib/allTimeReport.ts)

`computeAllTimeReport({ investorName, sources, publishedReports, isArunamiTeam })`
returns an `AllTimeReportSummary`: per-portfolio cumulative lines
(`invested`, `cumulativeEarnings`, `allTimeROI`, `monthsCounted`, `byPeriod[]`),
grand totals, overall ROI, and a coverage range (first → latest counted month).

Key rules:

- **Only published periods count.** For each portfolio the relevant months are
  the union of the periods covered by published **accumulated** reports (apply to
  every portfolio) and that portfolio's own published **portfolio-scoped**
  reports — then restricted to months that actually have a P&L (mirrors how the
  per-period accumulated report only includes a portfolio when it has data).
- **No double counting.** Published periods may be monthly (`YYYY-MM`) and/or
  quarterly (`YYYY-Qn`). They're collapsed to a deduped `Set<YYYY-MM>` (quarters
  expanded via `quarterToMonths`) before summing — a month covered by both is
  counted once.
- **Per-model handling** (via `calculateDistribution`,
  [src/lib/distributionStrategies.ts](../src/lib/distributionStrategies.ts)):
  - `net_profit_share` / `fixed_return` / `fixed_yield` / `revenue_share` /
    `custom` → summed per month (`monthsInPeriod: 1`).
  - `annual_dividend` → the declared dividend is per-year, so it's summed once
    per distinct year (not per month, which would multiply it).
  - `fixed_schedule` → one call over the whole month range (`scheduleMonths`),
    so only `paid` scheduled payments in range count once.

### 2. HTML — [src/lib/reportHtml.ts](../src/lib/reportHtml.ts)

- A shared document shell `renderReportDoc({ title, bodyHtml })` was extracted
  (the per-portfolio and accumulated builders were refactored onto it; no
  behavior change).
- `assembleAllTimeReportHtml(summary)` produces a visually distinct single page:
  a green hero KPI band (Total Investasi, Total Earning All-Time, ROI
  Keseluruhan, Jumlah Proyek, Bulan Tercatat), a cumulative per-portfolio table,
  and a per-period earnings trend table. Self-contained HTML — renders
  identically via `window.print()` and `<iframe srcDoc>`.

### 3. Storage — [src/lib/firestore.ts](../src/lib/firestore.ts) & [src/types/index.ts](../src/types/index.ts)

- `InvestorReportScope` gained `'all_time'`; `InvestorReportDoc` gained optional
  `coverageFirst` / `coverageLatest`; `ALL_TIME_PERIOD = 'ALL_TIME'` sentinel.
- `publishAllTimeReport()` writes a **single doc per investor**, id
  `alltime_{investorUid}`, in the existing `investorReports` collection with
  `portfolioId = '__accumulated__'`, `scope = 'all_time'`, `period = 'ALL_TIME'`.
  Regenerating overwrites it (`setDoc` merge). `unpublishAllTimeReport()` flips it
  back to draft.
- Callers must filter the `ALL_TIME` sentinel out (by `scope`) before sorting
  reports by period, since it isn't a real `YYYY-MM`.

No new dependencies, env vars, or composite indexes (the query is still the
two-equality `investorUid` + `status` filter in `getPublishedInvestorReports`).

### 4. IR generation — [InvestorReportForm.tsx](../src/pages/admin/components/InvestorReportForm.tsx)

The "Tipe Laporan" selector gained a third option, **"Sepanjang Waktu
(All-Time)"**. When selected it hides the period/portfolio pickers, computes the
summary from the investor's published reports, previews the all-time HTML, and
`Terbitkan ke Investor` calls `publishAllTimeReport()` (logging a `publish`
communication). Copy/Print also work off the all-time HTML.

`publishedReports` is passed in from [IRReporting.tsx](../src/pages/investor-relation/IRReporting.tsx)
(and [InvestorReportGenerator.tsx](../src/pages/admin/components/InvestorReportGenerator.tsx)),
which already fetch them. [InvestorReportHistory.tsx](../src/pages/admin/components/InvestorReportHistory.tsx)
labels all-time rows with their coverage range and an "All-Time" type.

### 5. Investor view — [InvestorReportsPage.tsx](../src/pages/investor/InvestorReportsPage.tsx)

A standalone page at `/investor/reports` (route in [src/App.tsx](../src/App.tsx),
guarded `investor`). It fetches `getPublishedInvestorReports(uid)` and derives
the all-time report (`scope === 'all_time'`) and accumulated reports
(`scope === 'accumulated'`). A two-button toggle switches between the All-Time
view (single iframe + print) and the periodic view (period selector + iframe +
print), each with an empty state. It defaults to All-Time when one exists.

The all-projects report viewer was **moved off** the investor dashboard
([InvestorDashboard.tsx](../src/pages/investor/InvestorDashboard.tsx)); the
dashboard now shows a **"Laporan Saya"** CTA card linking to the new page when
the investor has any accumulated or all-time report. Per-portfolio cards and
their "Lihat Laporan Proyek" links are unchanged.

## Known limitation

All-time ROI uses the investor's **current** `investedAmount` against historical
earnings. There are no historical principal snapshots, so for an investor who
topped up mid-history the ROI is approximate. Cumulative earnings are exact.

## Setup / deployment

No new dependencies, env vars, or Firestore indexes. Existing Firestore rules
for `investorReports` already cover the new `all_time` docs (same collection,
same access model). Just deploy the app.

## Manual test checklist

1. **Reconciliation** — pick an investor with mixed monthly + quarterly
   published reports across ≥2 portfolios. The all-time **Total Earning** must
   equal the sum of per-period earnings in `InvestorReturnsPage` /
   `AdminInvestorDetail` (validates the month dedupe).
2. **IR flow** — IR Reporting → select investor → Tipe Laporan "All-Time" →
   preview shows the distinct hero layout → "Terbitkan ke Investor". A
   `alltime_{uid}` doc appears in `investorReports` (`scope: 'all_time'`,
   `status: 'published'`) and the Riwayat row reads "All-Time".
3. **Investor flow** — log in as that investor → dashboard shows the "Laporan
   Saya" CTA → page opens on the All-Time view → toggle to "Bulanan / Kuartalan"
   shows the period reports → both print buttons open the print dialog.
4. **Edge cases** — investor with no published reports (empty states, Publish
   disabled); a portfolio on `annual_dividend` and one on `fixed_schedule` (no
   overcount); regenerate the all-time report (overwrites the single doc).
