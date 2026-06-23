# Arunami — Feature Review & User Flow Audit

> **Audit type:** Feature inventory + user-journey mapping + state/edge-case + UX consistency
> **App:** Arunami investment-portfolio management platform
> **Stack:** React + Vite + TypeScript · Firebase (Auth / Firestore / Cloud Storage) · Vercel serverless relay → Anthropic Claude (AI extraction) · Zustand · React Hook Form + Zod · Radix UI + Tailwind · Recharts
> **Roles:** `admin` · `analyst` · `investor` · `investor_relation`

---

## How this document is used

For each feature/journey we:
1. **Deconstruct the journey** — entry point → final outcome, step by step, with data flow.
2. **State & edge-case analysis** — loading / empty / error / unauth states; where DB & AI calls happen and what failure looks like.
3. **UX consistency check** — clicks, cognitive load, professional/minimal standard.
4. **Validate** — confirm with the product owner before proposing fixes.
5. **Document** — log confirmed flow + actionable bug/gap list.

Status legend: 🔲 Not mapped · 🔍 Mapping in progress · ⏳ Awaiting validation · ✅ Confirmed

---

## Feature Inventory

### Domain 0 — Authentication & Access Control
| # | Feature | Key files | Status |
|---|---------|-----------|--------|
| 0.1 | Login (email/password, Firebase) | `src/pages/LoginPage.tsx`, `src/components/shared/AuthProvider.tsx`, `src/store/authStore.ts` | 🔲 |
| 0.2 | Role-based routing & guards | `src/App.tsx`, `src/components/shared/AuthGuard.tsx`, `src/lib/roles.ts` | 🔲 |
| 0.3 | Logout & session persistence | `AuthProvider.tsx`, layout footers | 🔲 |

### Domain 1 — Admin Panel
| # | Feature | Key files | Status |
|---|---------|-----------|--------|
| 1.1 | Admin dashboard + data export | `src/pages/admin/AdminDashboard.tsx`, `src/lib/exportData.ts` | 🔲 |
| 1.2 | User management (CRUD, roles) | `src/pages/admin/AdminUsers.tsx` | 🔲 |
| 1.3 | Portfolio list/management | `src/pages/admin/AdminPortfolios.tsx` | 🔲 |
| 1.4 | Portfolio Setup Wizard (multi-step + AI) | `src/pages/admin/setup/PortfolioSetupWizard.tsx` (+ Step* files) | 🔲 |
| 1.5 | Investor allocation management | `src/pages/admin/AdminInvestors.tsx`, `AdminInvestorDetail.tsx` | 🔲 |

### Domain 2 — Analyst Workspace
| # | Feature | Key files | Status |
|---|---------|-----------|--------|
| 2.1 | Analyst dashboard (portfolio list) | `src/pages/analyst/AnalystDashboard.tsx` | 🔲 |
| 2.2 | Portfolio overview / KPIs | `src/pages/analyst/portfolio/OverviewPage.tsx` | 🔲 |
| 2.3 | P&L upload + AI extraction + edit | `src/pages/analyst/portfolio/PnLPage.tsx`, `src/components/PnLReviewTable.tsx` | 🔲 |
| 2.4 | Projections upload + AI extraction | `src/pages/analyst/portfolio/ProjectionsPage.tsx`, `src/components/ProjectionReviewTable.tsx` | 🔲 |
| 2.5 | Revenue & cost breakdown | `RevenuePage.tsx`, `CostsPage.tsx` | 🔲 |
| 2.6 | Profit-sharing / return-model config | `ProfitSharingPage.tsx` (+ `profit-sharing/*`), `src/lib/distributionStrategies.ts` | 🔲 |
| 2.7 | Management reports (AI summary, issues, action items) | `ManagementPage.tsx` (+ `management/*`) | 🔲 |
| 2.8 | Portfolio notes | `NotesPage.tsx` | 🔲 |
| 2.9 | Investor list (analyst view) | `InvestorsPage.tsx` | 🔲 |
| 2.10 | Review & publish reports | `PublishingPage.tsx`, `src/lib/reportHtml.ts` | 🔲 |

### Domain 3 — Investor Relations
| # | Feature | Key files | Status |
|---|---------|-----------|--------|
| 3.1 | Investor directory / CRM | `src/pages/investor-relation/IRInvestors.tsx`, `IRInvestorDetail.tsx` | 🔲 |
| 3.2 | Report review & publishing | `IRReporting.tsx`, `src/pages/admin/components/InvestorReport*` | 🔲 |
| 3.3 | Transfer-proof upload + investor alerts | `IRTransferProofs.tsx`, `src/components/investor/TransferProof*` | 🔲 |

### Domain 4 — Investor Portal
| # | Feature | Key files | Status |
|---|---------|-----------|--------|
| 4.1 | Investor dashboard | `src/pages/investor/InvestorDashboard.tsx` | 🔲 |
| 4.2 | Reports page (all-time + periodic, print/PDF) | `InvestorReportsPage.tsx`, `src/lib/allTimeReport.ts` | 🔲 |
| 4.3 | Portfolio overview (investor view) | `InvestorOverviewPage.tsx` | 🔲 |
| 4.4 | Returns / management / notes views | `InvestorReturnsPage.tsx`, `InvestorManagementPage.tsx`, `InvestorNotesPage.tsx` | 🔲 |
| 4.5 | Per-portfolio report viewing | `InvestorReportPage.tsx` | 🔲 |
| 4.6 | Transfer-proof notification banner + history | `TransferProofNotificationBanner.tsx`, `useTransferProofNotifications.ts` | 🔲 |

### Cross-cutting
| # | Concern | Key files |
|---|---------|-----------|
| X.1 | AI extraction relay (Claude via Vercel) | `src/lib/gemini.ts`, `api/anthropic/v1/messages.ts` |
| X.2 | File upload (docs / proof images) | `src/components/FileDropZone.tsx`, `MediaUploader.tsx` |
| X.3 | Firestore data layer | `src/lib/firestore.ts`, `firestore.rules`, `storage.rules` |
| X.4 | Custom categories / row ordering | `src/lib/customCategories.ts`, `rowOrder.ts` |
| X.5 | Date/period utilities, fixed-return rules | `src/lib/dateUtils.ts`, `projectTypeRules.ts` |

---

## Confirmed Journeys

_(none yet — populated as we validate each flow)_

---

## Open Action Items / Bugs

_(populated during the audit)_
