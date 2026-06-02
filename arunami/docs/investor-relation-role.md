# Investor Relation Role & Investor Personalized Report

## Overview

Adds a fourth user role, **Investor Relation (IR)**, plus a persisted
**accumulated (all-projects) investor report** that investors can read and
download from their landing page.

- **IR users** get a read-only view of *all* investors, the projects they
  invested in, and how each is performing — and can publish a monthly
  "Investor Personalized Report" to each investor.
- **Investors** see, on their dashboard *before* opening any project:
  - a **"Laporan Semua Proyek"** (accumulated) report with a period selector and
    print-to-PDF download, and
  - a **"Lihat Laporan Proyek"** link on each portfolio card that has a published
    per-project report.

## Roles

`UserRole` is `'admin' | 'analyst' | 'investor' | 'investor_relation'`
([src/types/index.ts](../src/types/index.ts)).

- Landing path and labels are centralized in [src/lib/roles.ts](../src/lib/roles.ts)
  (`roleHome()` → `/investor-relation`; `ROLE_LABELS`). `RootRedirect`
  ([src/App.tsx](../src/App.tsx)) and `AuthGuard`
  ([src/components/shared/AuthGuard.tsx](../src/components/shared/AuthGuard.tsx))
  both use `roleHome()` so the hyphenated URL stays clean.
- Admins assign the role from **Admin → Pengguna** (create/edit dialogs).

### Access (read-only)
IR can view all investors, allocations, portfolio config/financial data, and
communications; it can publish reports. It **cannot** edit users, allocations,
or financials. This is enforced both in routing and in Firestore rules
(`canViewInvestorDomain()` in [firestore.rules](../firestore.rules)).

## Routes & pages

| Path | Component | Guard |
|------|-----------|-------|
| `/investor-relation` | `InvestorRelationLayout` → `IRInvestors` (index) | `admin`, `investor_relation` |
| `/investor-relation/investors/:uid` | `IRInvestorDetail` | `admin`, `investor_relation` |

The IR pages reuse the admin views to avoid duplication:
- [IRInvestors.tsx](../src/pages/investor-relation/IRInvestors.tsx) renders
  `AdminInvestors` with `detailBase="/investor-relation/investors"`.
- [IRInvestorDetail.tsx](../src/pages/investor-relation/IRInvestorDetail.tsx)
  renders `AdminInvestorDetail` with `backPath="/investor-relation"`.

`AdminInvestors`/`AdminInvestorDetail` gained optional `detailBase`/`backPath`
props (defaulting to the admin area) so both areas share one implementation.

## Reports

### Per-project reports (unchanged)
Analysts publish per-(portfolio × investor × period) reports via the Publishing
page. Stored in `investorReports` (top-level) and mirrored under
`portfolios/{id}/investorReports`. Investors view them inside a portfolio
(`InvestorReportPage`).

### Accumulated report (new)
A single report per **(investor × period)** spanning *all* their portfolios.

- **HTML** is built by `buildAccumulatedReportHtml()` in
  [src/lib/reportHtml.ts](../src/lib/reportHtml.ts) — a self-contained document
  so it renders identically via `window.print()` and an `<iframe srcDoc>`.
- **Generated** from [InvestorReportGenerator.tsx](../src/pages/admin/components/InvestorReportGenerator.tsx)
  ("Buat Laporan" on an investor detail page). Two actions:
  - **Cetak / Unduh** — opens the HTML and triggers the print dialog (Save as PDF).
  - **Terbitkan ke Investor** — calls `publishAccumulatedReport()` and logs a
    communication entry (channel `publish`).
- **Stored** in the existing `investorReports` collection, keyed
  `accumulated_{investorUid}_{period}`, with `portfolioId = '__accumulated__'`
  (`ACCUMULATED_PORTFOLIO_ID`) and `scope = 'accumulated'`. Per-project docs omit
  `scope` and are treated as `'portfolio'`.
- **Consumed** by [InvestorDashboard.tsx](../src/pages/investor/InvestorDashboard.tsx):
  `getPublishedInvestorReports(uid)` returns all published docs; the dashboard
  splits them by `scope` (accumulated card vs per-project links).

Firestore helpers: `publishAccumulatedReport()` / `unpublishAccumulatedReport()`
in [src/lib/firestore.ts](../src/lib/firestore.ts). No new composite index is
required (the query is two equality filters: `investorUid` + `status`).

## Setup / deployment

1. Deploy updated Firestore rules: `firebase deploy --only firestore:rules`
   (the IR role has no access without this).
2. No new dependencies, env vars, or indexes.
3. Create an IR user via **Admin → Pengguna → Tambah Pengguna → role "Investor
   Relations"**.

## Manual test checklist

1. Log in as the IR user → lands on `/investor-relation`; `/admin` and
   `/analyst` redirect away; an `investor` cannot reach `/investor-relation`.
2. IR investor list + detail show correct totals/ROI (cross-check against the
   admin investor detail for the same investor).
3. IR detail → "Buat Laporan" → pick a month → "Terbitkan ke Investor": a doc
   appears in `investorReports` with `scope: 'accumulated'`, `status:
   'published'`, plus a `publish` communication row.
4. Log in as that investor → "Laporan Semua Proyek" card shows the period;
   "Unduh / Cetak" prints with correct figures; per-project cards link to the
   per-project report when one is published.
