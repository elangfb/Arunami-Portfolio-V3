# Arunami — Feature List

A multi-role investment-portfolio management platform: analysts upload and AI-extract financials, configure investor return models, and publish reports; investor-relations distributes reports and payout proofs; investors view their returns.

**Stack:** React + Vite + TypeScript · Firebase (Auth / Firestore / Cloud Storage) · Vercel serverless relay → Anthropic Claude (AI extraction) · Zustand · React Hook Form + Zod · Radix UI + Tailwind · Recharts
**Roles:** Admin · Analyst · Investor Relations · Investor

---

## Quick comparison checklist

Tick what your other apps also have.

### Platform & Access
- [ ] Email/password authentication (Firebase)
- [ ] Four distinct user roles with separate workspaces
- [ ] Role-based route guards & access control
- [ ] Role-specific landing pages / dashboards
- [ ] Responsive sidebar layout (desktop + mobile)
- [ ] Indonesian-language UI

### Admin
- [ ] Admin dashboard with platform-wide stats
- [ ] User management (create users, assign roles)
- [ ] Portfolio list & management
- [ ] Guided multi-step portfolio setup wizard
- [ ] AI-assisted setup (extract financials from uploaded docs)
- [ ] Investor allocation management (link investors ↔ portfolios)
- [ ] Full database export / backup (JSON)

### Financial Analysis (Analyst)
- [ ] P&L upload (PDF / Excel / CSV) with AI extraction
- [ ] Monthly P&L breakdown & period history
- [ ] Projection planning upload + AI extraction
- [ ] Revenue breakdown & trend views
- [ ] Cost-structure breakdown
- [ ] Custom income/expense categories
- [ ] Reorderable / hideable line items
- [ ] KPI tracking & portfolio overview
- [ ] Auto-calculated gross/operating/net profit
- [ ] Charts / visualizations (Recharts)
- [ ] Projection-vs-actual variance analysis

### Investor Return Models
- [ ] Net profit share (investor % + platform fee %)
- [ ] Fixed yield (% of invested amount)
- [ ] Revenue share (% of revenue)
- [ ] Fixed payment schedule (dated payouts)
- [ ] Annual dividend
- [ ] Custom formula-based model
- [ ] Change-model workflow with audit trail
- [ ] Equity/share change history

### Reporting & Distribution
- [ ] AI-generated management/business summaries
- [ ] Business issues tracking (with severity)
- [ ] Action items (with status)
- [ ] Media attachments on reports (images/video)
- [ ] Free-form portfolio notes with attachments
- [ ] Review & publish workflow (draft → published)
- [ ] HTML report generation (print-to-PDF friendly)
- [ ] Monthly / quarterly periodic reports
- [ ] Accumulated (cross-portfolio) reports
- [ ] All-time / lifetime investor report
- [ ] Personalized per-investor reports
- [ ] Report version history

### Investor Relations
- [ ] Investor directory / CRM (search by name/email)
- [ ] Per-investor detail (allocations, totals)
- [ ] Communication log (audit trail)
- [ ] Payout transfer-proof upload (image)
- [ ] Send proof → triggers investor notification

### Investor Portal
- [ ] Investor dashboard (holdings, totals)
- [ ] Central reports page (all-time + periodic)
- [ ] Per-portfolio financial views (revenue, costs, returns)
- [ ] Management notes view
- [ ] Download / print reports as PDF
- [ ] In-app transfer-proof notification banner
- [ ] Transfer-proof history with amounts & dates

### AI & Automation
- [ ] Document → structured data extraction (Claude)
- [ ] Server-side AI relay (key never exposed to browser)
- [ ] AI category/variable classification on setup
- [ ] AI KPI suggestions
- [ ] AI draft refinement (tone/grammar)

---

## Detailed feature catalog

### 1. Authentication & Access Control
| Feature | Description |
|---|---|
| Login | Email/password via Firebase Auth; Zod-validated form; password visibility toggle. |
| Role-based routing | `AuthGuard` enforces allowed roles per route; redirects to role home on mismatch. |
| Roles | `admin`, `analyst`, `investor`, `investor_relation` — each with its own workspace. |
| Session persistence | Firebase `onAuthStateChanged` rehydrates session on reload. |
| Logout | Available from sidebar footer in every layout. |

### 2. Admin Panel
| Feature | Description |
|---|---|
| Dashboard | Platform-wide counts (users, portfolios, analysts, investors). |
| User management | Create app users, assign roles, manage team members. |
| Portfolio management | List/organize all portfolios. |
| Portfolio Setup Wizard | Multi-step: basic info → upload docs (AI extract) → review financials → choose investor return model. |
| Investor allocations | View investor profiles, invested amounts, ownership %, portfolio links. |
| Data export | Full Firestore snapshot exported as JSON (backup/migration). |

### 3. Analyst Workspace
| Feature | Description |
|---|---|
| Analyst dashboard | Lists assigned portfolios with quick access. |
| Portfolio overview | Metadata, KPI metrics, performance summary. |
| P&L management | Upload PDF/Excel/CSV → Claude extracts revenue/COGS/opex/profit; inline edit; custom categories; row reordering; period history. |
| Projections | Upload projection docs → AI extracts projected figures & assumptions; per-month tracking. |
| Revenue & costs | Detailed revenue sources and cost-structure views with trends. |
| Profit-sharing config | Configure return model (net profit share / fixed yield / revenue share / fixed schedule / annual dividend / custom); equity-change audit trail. |
| Management reports | AI-generated business summary; issues (severity); action items (status); media attachments. |
| Portfolio notes | Free-form notes with optional file attachments. |
| Investor list | Investors in the portfolio with allocations & payout structures. |
| Review & publish | Generate and publish investor reports (periodic / all-time) as styled HTML. |

### 4. Investor Relations
| Feature | Description |
|---|---|
| Investor directory / CRM | Browse/search investors; view allocations, totals, communications. |
| Report review & publishing | Create per-portfolio, accumulated, or all-time investor reports; publish; maintain version history. |
| Transfer-proof management | Upload payout proof image + amount + notes; send to investor; auto-creates in-app notification; per-report proof history. |

### 5. Investor Portal
| Feature | Description |
|---|---|
| Investor dashboard | Total investments, holdings, active allocations, quick nav. |
| Reports page | All-time lifetime report or periodic (monthly/quarterly) reports; printable/downloadable PDF. |
| Portfolio views | Overview, revenue, costs, returns, management notes (scoped to their investment). |
| Per-portfolio report | Period-specific financial report. |
| Transfer-proof notifications | In-app banner when IR sends a payout proof; dismissible; history tab with amounts & dates. |

### 6. Cross-Cutting Capabilities
| Feature | Description |
|---|---|
| AI extraction relay | Anthropic Claude calls proxied through a Firebase-authenticated Vercel serverless function; API key stays server-side. |
| File uploads | Financial docs (PDF/XLSX/CSV, ≤10MB) for AI; proof images (PNG/JPG/WEBP, ≤5MB) to Cloud Storage. |
| Custom categories | Add/manage custom income & expense categories within P&L and projections. |
| Row ordering | Reorder/hide line items per portfolio; persisted. |
| Financial calculations | Auto profit calc and investor/platform share allocation; real-time sync across views. |
| HTML report generation | Self-contained, print-to-PDF-friendly report HTML. |
| Date/period utilities | Period normalization, month/year picker, monthly/quarterly/semester frequencies. |
| Fixed-return rules | Dynamic navigation filtering for fixed-return portfolios. |

---

*Generated from a codebase exploration on 2026-06-19. See `flow-audit.md` for the in-depth user-flow audit.*
