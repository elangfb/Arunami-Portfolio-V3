# Arunami Portfolio System — Feature Analysis (V2 Prototypes)

> **Systems-analyst documentation.** Every feature below is extracted from the three **V2 design prototypes** — the source of truth for the intended product:
> - `arunami-admin-final.html` — **Admin Console** (identity: *Andi Pratama, Super Admin*)
> - `arunami-bapm-final.html` — **BA-PM Platform** (identity: *Reza Wijaya, BA-PM*)
> - `arunami-investor-final.html` — **Investor Portal** (identity: *Budi Santoso*)
>
> **Platform:** Multi-role investment-portfolio management platform for the Indonesian market. Admin runs platform operations, onboarding, KYC, cap tables, and money distribution; BA-PM (Business Analyst / Portfolio Manager) handles financials, profit-share calculation, reporting, governance, and investor engagement; Investors view holdings, verified payouts, performance, and reports.
>
> **Roles:** Admin · BA-PM · Investor
>
> **Architecture of the prototypes:** JavaScript single-file SPAs with an Indonesian-language UI. Admin and Investor are wired to a shared reactive store (`arunami-store.js`) — Admin is the **producer**, Investor is the **consumer** (reactive re-render via `Store.onChange`). BA-PM is **standalone with hardcoded in-memory data** (no store, no persistence). See *Integration & Stub Notes* at the end.
>
> _Generated 2026-07-06 from a full read of all three prototype files._

---

## Table of Contents

- [A. Cross-Platform Data Flow](#a-cross-platform-data-flow)
- [B. Admin Console](#b-admin-console)
- [C. BA-PM Platform — Global](#c-ba-pm-platform--global)
- [D. BA-PM Platform — Per-Portfolio](#d-ba-pm-platform--per-portfolio)
- [E. BA-PM Platform — Meeting Mode](#e-ba-pm-platform--meeting-mode)
- [F. Investor Portal — Global](#f-investor-portal--global)
- [G. Investor Portal — Per-Portfolio](#g-investor-portal--per-portfolio)
- [Integration & Stub Notes](#integration--stub-notes)

---

## A. Cross-Platform Data Flow

### Feature Name: Shared Reactive Store (`arunami-store.js`)
**Roles:** All (infrastructure)
**Function:** One cross-platform data store so an action in one role's app appears live in the others.
**Process:**
- **Input:** Any producer write (`Store.commit`, `Store.newPortfolio`, `Store.newInvestor`); any remote change event.
- **Process:** Admin creates all entities (portfolios, users, investors, cap tables, distribution batches, documents, health rules) into `Store.db`, which starts **empty**. `Store.onChange((db, remote) => …)` re-renders each subscribed app on a remote change; Investor's `syncLocals()` derives its local collections from `Store.db`, and `ensureMyProfile()` auto-registers the logged-in investor so Admin can allocate them.
- **Output:** Real-time Admin↔Investor synchronization. **BA-PM is not connected** to this store in the prototype (its data is hardcoded), which breaks the intended Admin→BA-PM→Investor chain until migrated.

### Feature Name: Distribution Money-Flow Chain
**Roles:** Admin → BA-PM → Investor
**Function:** The end-to-end path a profit-share payout follows.
**Process:**
- **Input:** A distribution batch for a portfolio + period.
- **Process:** **Admin** computes each investor's share, uploads a transfer-proof file per investor, and reports the batch to BA-PM. **BA-PM** forwards the proof to each investor. **Investor** sees the payout flip from *Diproses* → *Dibayar* with a viewable proof.
- **Output:** Status transitions `Perlu diproses → Dilaporkan ke BA-PM → Diteruskan ke Investor` (or `Ditahan` if held). Investor-side status: *Diproses / Dibayar / Ditahan*.

---

## B. Admin Console

### Feature Name: Sidebar Navigation & Task Badges
**Roles:** Admin
**Function:** Navigate 13 grouped pages with live attention badges.
**Process:**
- **Input:** Nav-item click (`nav(id)`).
- **Process:** Sets page state, re-renders, and commits page state to the store. Two live badges: *Investor & KYC* shows the pending-KYC count; *Bagi hasil & transfer* shows the count of batches needing processing/forwarding. A topbar bell aggregates total tasks = pending approvals + pending KYC + companies in onboarding.
- **Output:** Active page highlighted; badge counts update live; bell routes to the distribution page.

### Feature Name: Admin Dashboard
**Roles:** Admin
**Function:** Platform-wide operational snapshot and task queue.
**Process:**
- **Input:** Live reads of portfolios, investors, users, distribution batches, and the audit log.
- **Process:** Computes four KPIs — total active AUM (Σ active-portfolio investment), company count (+ onboarding count), total investors (+ pending KYC), and active BA-PM count. Builds a consolidated **approval/task queue** (batches to process → "Proses", pending-KYC investors → "Periksa", onboarding portfolios → "Kelola"), a portfolio-health distribution strip (Siaga 3/2/1/Sehat), and a 5-item cross-platform activity feed.
- **Output:** KPI cards, deep-linked task rows, health breakdown, recent-activity feed. *(Health bars use a fixed denominator of 4.)*

### Feature Name: User & Access Management
**Roles:** Admin
**Function:** Create/edit/delete platform accounts and toggle their status.
**Process:**
- **Input:** Search + role filter; add/edit modal (name, role, email, optional password, "Tim Arunami — bebas fee" checkbox); status-toggle and delete actions.
- **Process:** Derives initials and a role-based avatar color. Create adds a `Pending` user with an activation invite; edit mutates in place (password only if provided); toggle flips Aktif↔Nonaktif; delete requires a red confirmation modal. Most actions write an audit entry. "Tim Arunami" flags fee-exempt internal staff.
- **Output:** Filtered user table (role, scope, status, last login); toast confirmations; writes to the shared store. *(No email/password format validation.)*

### Feature Name: Company Onboarding
**Roles:** Admin
**Function:** Register a portfolio company and configure its initial profit-sharing scheme.
**Process:**
- **Input:** Modal — optional logo upload (base64), brand name, legal name (PT), industry (18 options), target investment (IDR billions), stage, platform fee % (default 2.0), contract start/end, and an initial bagi-hasil block (scheme, frequency, basis, cap, minimum, principal-return flag), plus BA-PM assignment.
- **Process:** Generates a code (`INIT-###`) and brand palette; if stage = Aktif → status Aktif & health Sehat, else Onboarding. Builds the portfolio via `Store.newPortfolio`, initializes its `bhConfig` and an empty cap table, and writes an audit entry.
- **Output:** Company appears platform-wide once active; toast; writes to store.

### Feature Name: Company Edit / Delete
**Roles:** Admin
**Function:** Amend company details or remove a company.
**Process:**
- **Input:** Edit modal (logo, name, PT, industry, stage, target, fee %); delete action.
- **Process:** Edit syncs investment strings consumed by BA-PM/Investor and can auto-promote to Aktif. **Delete is guarded** by `companyHasReports()` — blocked (button disabled) if the company has monthly reports or distribution batches; otherwise a red modal confirms, then removes the portfolio plus its `bhConfig`, cap table, documents, and monthly reports.
- **Output:** Audit entry, toast, re-render; writes to store.

### Feature Name: Assign BA-PM & Lifecycle Status
**Roles:** Admin
**Function:** Set a company's PIC, grant multi-BA-PM access, and set lifecycle status.
**Process:**
- **Input:** PIC dropdown, checkbox list of BA-PMs with access, status dropdown (Aktif / Onboarding / Review legal / Closed).
- **Process:** Ensures the PIC is always in the access list; writes PIC, status, and access list; audit entry.
- **Output:** Company reflects new PIC/status; toast; writes to store.

### Feature Name: Investor Registry & Add Investor
**Roles:** Admin
**Function:** Maintain the investor directory and register new investors.
**Process:**
- **Input:** KYC-status filter; add-investor form (name, type Individu/Institusi, email, optional NPWP).
- **Process:** Amber banner when any KYC is pending. Two stat cards (total investors + verified/pending; total recorded investment across cap tables). New investors are created via `Store.newInvestor` with `kyc: Pending` and today's join date; audit entry.
- **Output:** Registry table (holding count, total nominal, KYC pill); toast; writes to store.

### Feature Name: Investor Investment Detail
**Roles:** Admin
**Function:** Read-only per-investor earnings analytics across portfolios.
**Process:**
- **Input:** "Investasi" action on a registry row.
- **Process:** `investorSummary()` computes per-portfolio ownership (nominal ÷ cap-table sum), last-period earning, total earning, and monthly ROI, aggregating four headline tiles.
- **Output:** A wide read-only modal (no writes). *(Earnings depend on `earnHistory`, which starts empty.)*

### Feature Name: KYC Verification
**Roles:** Admin
**Function:** Verify or reject investor identity before they can be allocated or paid.
**Process:**
- **Input:** KYC modal with three optional document upload slots (KTP, NPWP card, bank account); Approve or Reject.
- **Process:** Uploads store the **filename only** (no file bytes). Approve sets `kyc: Terverifikasi` and activates any matching user account (audit entry); Reject sets `kyc: Ditolak`. Verification is allowed regardless of documents. **A verified investor becomes selectable in the cap-table editor.**
- **Output:** KYC pill changes; sidebar badge updates; writes to store.

### Feature Name: Cap-Table Editor
**Roles:** Admin
**Function:** Assign verified investors + nominal amounts to a company and auto-compute ownership %.
**Process:**
- **Input:** Editable target investment; add-investor dropdown (only verified & not-yet-added investors); per-row nominal editing; remove buttons.
- **Process:** Works on a draft copy; live-recalculates each row's % (nominal ÷ target), the total, and a filled-vs-target banner (colored bar; red if over 100% — **oversubscription is surfaced**). Save writes the cap table, updates target/investor count, and audits.
- **Output:** Persisted cap table with ownership %; toast; writes to store.

### Feature Name: Distribution Processing & Transfer-Proof Upload
**Roles:** Admin
**Function:** Compute each investor's payout, attach transfer proof, and report to BA-PM.
**Process:**
- **Input:** Status filter; create-batch modal (portfolio, month, year, note); process modal with a per-investor payout table + proof-filename inputs; "Report to BA-PM", "Hold", "Release" actions.
- **Process:** Flow banner + four stat cards (perlu diproses / dilaporkan / diteruskan / ditahan). Per-investor payout `distFor()` = `nominalJt × yield% ÷ 12`. **Reporting requires at least one proof** (else it aborts); on success it stores proofs, sets status `Dilaporkan ke BA-PM`, and writes handoff fields BA-PM consumes. "Hold" sets `Ditahan` (covenant violation); "Release" returns it to processing.
- **Output:** Batch advances state, becomes visible to BA-PM; audit entry; toast; writes to store. *(Note: the realized-yield map is not populated in this file, so payouts compute to Rp 0 until BA-PM report data supplies yields.)*

### Feature Name: Platform Fees Dashboard
**Roles:** Admin
**Function:** Read-only management-fee projection per portfolio.
**Process:**
- **Input:** Live reads of active portfolios' AUM and fee %.
- **Process:** Annual fee = AUM × fee %; derives total annual fee, average fee %, and AUM basis; monthly = annual ÷ 12.
- **Output:** Stat cards + per-portfolio table with totals. No writes.

### Feature Name: Bagi-Hasil Settings & Scheme Config
**Roles:** Admin
**Function:** View/edit each portfolio's profit-sharing scheme alongside its cap table.
**Process:**
- **Input:** Per-portfolio card actions "Kelola investor" (cap table) and "Edit skema"; scheme modal (scheme, frequency, basis, cap, minimum, principal-return).
- **Process:** Shows target-fill %, principal-return indicator (explains BA-PM annualized yield is adjusted −20% when no principal return), and the scheme grid + cap-table summary. Save writes `bhConfig` and the principal flag; audit entry.
- **Output:** Updated scheme; toast; writes to store.

### Feature Name: Health Rules / Wanprestasi Thresholds (SOP Siaga 1/2/3)
**Roles:** Admin
**Function:** Configure the global thresholds the health engine uses and preview live status.
**Process:**
- **Input:** Numeric inputs for Siaga 1/2/3 across payment/report lateness (days), communication silence (days), and consecutive under-target months; "Simpan".
- **Process:** A static SOP escalation reference (Early Warning / Serious Concern / Enforcement with prescribed legal actions). Save writes to `healthRules`; a live preview table derives each active portfolio's lateness, silence days, and under-performance streak (net profit < 80% of projection target) and shows triggered SOP steps.
- **Output:** Rules apply platform-wide; audit entry; toast; writes to store.

### Feature Name: Audit Log
**Roles:** Admin (view), all (write)
**Function:** Combined cross-platform activity trail.
**Process:**
- **Input:** Entries written by nearly every mutating action.
- **Process:** Renders each entry (icon, action, actor, role, date), read-only.
- **Output:** Chronological log. *(A few actions — reject KYC, toggle user, hold/release, announcement create — skip audit logging.)*

### Feature Name: Announcements
**Roles:** Admin
**Function:** Broadcast a role-targeted announcement.
**Process:**
- **Input:** Create modal (title, target Semua/BA-PM/Investor, body).
- **Process:** Prepends an announcement with status Terkirim; toast "terkirim ke {target}".
- **Output:** Announcement list; writes to store. *(The per-row "⋯" detail button is a demo stub.)*

### Feature Name: Contracts & Documents Library
**Roles:** Admin
**Function:** Manage legal/financial documents visible to BA-PM/Investor.
**Process:**
- **Input:** Portfolio + type filters; upload/edit modal (name, portfolio, type, version, date, file); delete.
- **Process:** The file picker is **simulated** — it stores a fake filename + size string, not real bytes. Create/edit writes the document record; delete uses a native confirm. Audit entries throughout.
- **Output:** Filterable document table; toast; writes to store.

### Feature Name: System Settings (Roles / Branding / Security)
**Roles:** Admin
**Function:** Reference role matrix, branding info, and security toggles.
**Process:**
- **Input:** Security toggle switches.
- **Process:** The role/access matrix (11 capabilities × 3 platforms) and branding (name, domain, currency, timezone) are **static/read-only**. Security toggles (mandatory 2FA, auto-logout, dual-admin distribution approval, export logging) flip visual state only.
- **Output:** Display only. **Security toggles are non-persistent stubs.**

---

## C. BA-PM Platform — Global

> BA-PM runs on **hardcoded in-memory data** (four fixed portfolios: Nexavar, Solaris, Kirana, Biru). Mutations persist only for the session.

### Feature Name: Sidebar Navigation & Health Recompute Shell
**Roles:** BA-PM
**Function:** Two-tier navigation (global ↔ per-portfolio) with live badges, recomputing health on every render.
**Process:**
- **Input:** Nav clicks (`navG`, `navL2`, `openP`, `goGlobal`).
- **Process:** Each render first recomputes every portfolio's health, then rebuilds the sidebar with badges: distributions to forward (red), open notes (amber), overdue action items (red), and at portfolio level — unread engagement, overdue actions, delayed milestones, failed covenants, and a contract-expiry "!".
- **Output:** Rebuilt shell; page label in the topbar.

### Feature Name: Global Overview Dashboard
**Roles:** BA-PM
**Function:** Executive dashboard of earnings, yield, health distribution, and alerts.
**Process:**
- **Input:** Month selector; alert/portfolio clicks.
- **Process:** Reads monthly aggregate data for three stat cards (total earning, average yield, total active investment), a health-distribution strip, and an alert feed (hardcoded critical/watch/overdue items). A callout flags portfolios that haven't submitted this month's data.
- **Output:** Clickable alerts/cards navigate into a portfolio.

### Feature Name: Portfolio Summary (Ringkasan)
**Roles:** BA-PM
**Function:** Filterable card grid of all managed portfolios.
**Process:**
- **Input:** Text search + industry/stage/status filters; reset.
- **Process:** Each card shows a health badge with a **hover tooltip of health reasons**, issue text, investor/investment meta, a contract-duration progress bar (red if within 3 months of end), and a revenue/yield/net-profit mini-panel with change indicators.
- **Output:** Filtered grid; card click opens the portfolio. *(Known bug: status-filter values don't match the health strings, so critical/watch filtering fails.)*

### Feature Name: Monthly Data Table (Data bulanan)
**Roles:** BA-PM
**Function:** Cross-portfolio flat table of monthly financials.
**Process:**
- **Input:** Portfolio, month, and search filters.
- **Process:** Filters monthly rows; columns include revenue, bagi hasil, monthly & annualized yield, net profit, and **adjusted annualized yield** (only when principal isn't returned).
- **Output:** Table; row click opens the portfolio.

### Feature Name: Benchmarking
**Roles:** BA-PM
**Function:** Rank and compare portfolios on one metric for one period.
**Process:**
- **Input:** Period dropdown + metric tabs (annualized yield / monthly yield / revenue / net profit / bagi hasil).
- **Process:** Sorts portfolios descending by the selected metric; portfolios lacking data for the period are pushed to the bottom and flagged. Renders a medalled ranking bar chart (bars colored by health) and a full comparison table.
- **Output:** Chart + table; row/bar click opens the portfolio.

### Feature Name: Engagement (Global)
**Roles:** BA-PM
**Function:** Cross-portfolio investor report read/unread/unsent tracking with reminders.
**Process:**
- **Input:** Portfolio filter; bulk and per-investor reminder buttons.
- **Process:** Flattens all investors into read/unread/unsent tiles, grouped per portfolio with status pills.
- **Output:** Opens the reminder modal. *(Top filters here are cosmetic; reminder "send" only clears selection.)*

### Feature Name: Renewal Pipeline (Global)
**Roles:** BA-PM
**Function:** All contracts across portfolios by time-to-expiry.
**Process:**
- **Input:** Static filters; action buttons.
- **Process:** Uses a hardcoded contract list; KPI cards (Kritis <3mo / Segera 3–6mo / Aman >6mo); a critical panel; a full table sorted by days remaining.
- **Output:** Row/panel click opens the portfolio. **Perpanjang / Restrukturisasi / Detail buttons are stubs.**

### Feature Name: Distribution from Admin (Forwarding)
**Roles:** BA-PM (reads Admin's batches)
**Function:** Forward Admin-processed transfer proofs to each investor — BA-PM's stage of the money chain.
**Process:**
- **Input:** "Teruskan semua" (whole batch) and per-investor "Teruskan".
- **Process:** Flow banner + three stat cards (received / pending / done). Each batch card lists per-investor proof filenames and forwarded status. Forwarding marks the investor forwarded; when all are done the batch becomes "Selesai diteruskan".
- **Output:** Updates the batch in memory; green toast; badge updates. *(In the prototype it reads its own hardcoded batches, so forwarding does not reach the Investor's store — an integration gap.)*

### Feature Name: Notes & Issues (Global, Internal)
**Roles:** BA-PM
**Function:** Cross-portfolio internal notes.
**Process:**
- **Input:** Portfolio filter; add/edit modal (title, category, body); status toggle.
- **Process:** Flattens internal notes across portfolios with status pills (Open/In Progress/Closed) and category; add/edit and status-toggle mutate the in-memory list.
- **Output:** Re-rendered note list.

### Feature Name: Action Items (Global)
**Roles:** BA-PM
**Function:** Cross-portfolio task list.
**Process:**
- **Input:** Portfolio filter; add/edit modal (title, assignee from team, due date, status); complete/reopen.
- **Process:** Flattens action items with overdue count and status pills (Overdue/In Progress/Selesai/Pending).
- **Output:** Re-rendered task list.

### Feature Name: Audit Log (Global)
**Roles:** BA-PM
**Function:** Read-only activity log across portfolios.
**Process:**
- **Input:** Static (unwired) filters.
- **Process:** Flattens the hardcoded audit log with portfolio labels.
- **Output:** Static timeline. **Filters are cosmetic stubs.**

### Feature Name: Settings (Team & Health Config)
**Roles:** BA-PM
**Function:** Manage team members and the health-scoring thresholds.
**Process:**
- **Input:** Add/edit/delete team members; nine numeric threshold inputs; "Simpan konfigurasi".
- **Process:** Team members feed assignee dropdowns. Saving health config writes Siaga 1/2/3 thresholds (lateness days, communication-vacuum days, under-performance months) and triggers a full health recompute.
- **Output:** In-memory updates; re-render. *(Copy references a 100-point weighting model that isn't implemented — only thresholds are.)*

### Feature Name: Health / Wanprestasi Derivation Engine
**Roles:** BA-PM (core logic)
**Function:** Auto-computes each portfolio's Siaga status from three signals.
**Process:**
- **Input:** Manual lateness days + last-contact date; monthly net-profit vs projection targets.
- **Process:** Combines (1) payment/report lateness, (2) communication-vacuum days (last contact → "today"), and (3) consecutive months where net profit < 80% of target, escalating to Siaga 3/2/1 by threshold, else Sehat.
- **Output:** Health level written back to the portfolio, cascading to badges everywhere.

---

## D. BA-PM Platform — Per-Portfolio

### Feature Name: Portfolio Overview
**Roles:** BA-PM
**Function:** Single-portfolio landing: status, contract info, revenue chart, period comparison, SOP monitor.
**Process:**
- **Input:** Chart range selectors; period A-vs-B dropdowns; wanprestasi "Update" button.
- **Process:** Health banner + info card (investment, investors, contract & operational durations, principal flag). A revenue **actual-vs-projection** line chart (actuals synthesized from plan × health tier), a period-comparison table with variance-vs-projection columns, and a **Wanprestasi SOP monitor** showing computed health, trigger reasons, and a net-profit-vs-target table.
- **Output:** "Update" opens the wanprestasi modal.

### Feature Name: Revenue & Profit Analysis
**Roles:** BA-PM
**Function:** Deep revenue/profit/yield analysis versus plan.
**Process:**
- **Input:** Month + chart-range + yield-range selectors.
- **Process:** Four summary tiles (revenue actual vs plan %, revenue plan, profit actual vs plan %, profit margin); actual-vs-projection line charts; a variance table; and a yield section computing monthly, annualized, and **adjusted-annualized** yield (×0.8 when no principal return).
- **Output:** Charts + tables (read-only analysis).

### Feature Name: P&L Actuals (PnL aktual)
**Roles:** BA-PM
**Function:** Enter and review actual monthly P&L.
**Process:**
- **Input:** Tabs (Input / Riwayat / Struktur); Excel/CSV upload area; manual P&L form (revenue, 4× COGS, 4× OpEx); month accordion; period/compare selectors.
- **Process:** History shows a 10-month accordion with derived gross/net; Struktur shows a full breakdown with optional period comparison and per-line deltas.
- **Output:** Displays derived P&L. **Excel/CSV upload and the Simpan/Reset/Edit buttons are stubs — nothing persists.**

### Feature Name: Projection Plan (Proyeksi plan)
**Roles:** BA-PM
**Function:** View monthly & annual P&L projection targets.
**Process:**
- **Input:** Month dropdown.
- **Process:** Builds a projected P&L per month (COGS ratio + OpEx structure); KPI cards (target revenue, gross margin, net profit/margin, target yield); annual rollup; monthly target table. Past months are locked.
- **Output:** Projection views. **Edit / "+ Tambah periode" are stubs.**

### Feature Name: Bagi Hasil Calculator
**Roles:** BA-PM
**Function:** Compute the distribution pool and per-investor split for a period.
**Process:**
- **Input:** Frequency (monthly/quarterly/by-agreement), period, optional social-fund checkbox + %, per-investor "Upload bukti".
- **Process:** Pool = the period's bagi-hasil value (summed for quarterly). **Fee = pool × 12% (Arunami)**, deducted automatically; optional **social fund** = pool × % (default 2.5%); **net = pool − fee − social**, split by ownership %. Derives period/monthly/annual ROI. A scheme info bar shows the four contract schemes: **Revenue sharing** (Nexavar 7% gross), **Profit sharing** (Solaris 60/40 net), **Blended** (Kirana 10% p.a. + 2% profit bonus), **Fixed return** (Biru 10.5% p.a.).
- **Output:** KPI cards + per-investor split table. **"Upload bukti" is a stub; nothing persists** (this is a calculator/insight view — actual distribution is created by Admin).

### Feature Name: Engagement (Per Portfolio)
**Roles:** BA-PM
**Function:** Report read-status for this portfolio's investors, with reminders.
**Process:**
- **Input:** Per-investor checkboxes; "select all unread"; "Kirim reminder (N)".
- **Process:** Read/unread/unsent tiles; selection tracked in state; reminder button appears when ≥1 selected.
- **Output:** Opens the reminder modal. *(Sent status isn't persisted.)*

### Feature Name: Investor Report Workflow (Laporan investor)
**Roles:** BA-PM
**Function:** View sent reports and author new ones via a draft → review → publish flow.
**Process:**
- **Input:** Tabs (Lihat / Buat); period selector; report kind (monthly/quarterly); Generate-with-AI vs Write-manual; AI source (from platform data / from uploaded brand doc); per-investor edit; publish-to-one / publish-to-all.
- **Process:** A 3-step stepper (**Pilih periode → Edit → Review & Publish**). The **Report Editor Modal** is the one genuinely functional authoring path — a split pane with an editable draft and an "insert" action that injects portfolio notes/action-items into the body, saving to in-memory drafts and flipping affected investors to "revised/unread".
- **Output:** Drafts saved in memory. **AI generation is fully stubbed** (brand-doc upload captures only a filename); **Publish only advances the stepper — no report is actually sent or persisted.**

### Feature Name: Milestones
**Roles:** BA-PM
**Function:** CRUD milestone tracking per portfolio.
**Process:**
- **Input:** Add/edit/delete modal (title, success criteria, target date, status, updated-by).
- **Process:** Table with status badges (on-track/achieved/delayed/missed/pending); delayed count feeds the sidebar badge.
- **Output:** In-memory CRUD; re-render.

### Feature Name: Covenants
**Roles:** BA-PM
**Function:** CRUD covenant-compliance tracking per portfolio.
**Process:**
- **Input:** Add/edit/delete modal (name, required threshold, actual, period, result Pass/Gagal, updated-by).
- **Process:** Table with pass/fail; failed rows raise a red alert and feed the sidebar badge (and the health narrative).
- **Output:** In-memory CRUD; re-render.

### Feature Name: Notes & Issues (Investor-Facing)
**Roles:** BA-PM
**Function:** CRUD notes shown to investors, with document attachments.
**Process:**
- **Input:** Add/edit modal (title, category Update/Informasi/Pencapaian/Risiko, body, multi-file attachments); delete.
- **Process:** Info bar clarifies these are investor-visible; attachments are staged as chips.
- **Output:** In-memory CRUD; re-render. **Attachments capture filenames only (stub).**

### Feature Name: Internal Notes (Catatan internal)
**Roles:** BA-PM
**Function:** CRUD internal (non-investor) notes for one portfolio.
**Process:**
- **Input:** Add/edit modal; open/closed toggle.
- **Process:** Same note engine as the global view, scoped to the portfolio.
- **Output:** In-memory CRUD; re-render.

### Feature Name: Action Items (Per Portfolio)
**Roles:** BA-PM
**Function:** Per-portfolio task list.
**Process:**
- **Input:** Add/edit modal; complete/reopen.
- **Process:** Overdue count feeds the sidebar badge; status pills as in the global view.
- **Output:** In-memory CRUD; re-render.

### Feature Name: Audit Log (Per Portfolio)
**Roles:** BA-PM
**Function:** Read-only activity log for one portfolio.
**Process:**
- **Input:** Portfolio context.
- **Process:** Renders the hardcoded per-portfolio log.
- **Output:** Static timeline (unwired filters).

### Feature Name: Renewal Pipeline (Per Portfolio)
**Roles:** BA-PM
**Function:** One portfolio's contracts and expiry timeline.
**Process:**
- **Input:** Contract context.
- **Process:** Critical alert if <90 days; colored timeline bar; a hardcoded 3-contract table (main, addendum, side letter) with status pills.
- **Output:** Displays timeline. **Perpanjang / Restrukturisasi / Exit buttons are stubs.**

### Feature Name: Wanprestasi Update Modal
**Roles:** BA-PM
**Function:** Edit the two manual health inputs.
**Process:**
- **Input:** Lateness (days) + last-contact date.
- **Process:** Writes the values and recomputes the portfolio's health; a note clarifies net-profit performance is auto-derived.
- **Output:** Health badge updates everywhere it appears.

---

## E. BA-PM Platform — Meeting Mode

### Feature Name: Meeting Mode Shell
**Roles:** BA-PM
**Function:** A dark full-screen meeting workspace overlay, separate from the main app, for live portfolio review.
**Process:**
- **Input:** "Meeting mode" sidebar button to start; "Tutup" to end.
- **Process:** Resets fresh per-session meeting state (notes, actions, periods, comparison periods, weekly updates — all empty per portfolio) and shows the overlay with a topbar (title + today's date).
- **Output:** Full-screen overlay displayed.

### Feature Name: Meeting Agenda Sidebar
**Roles:** BA-PM
**Function:** Portfolio navigator for the meeting.
**Process:**
- **Input:** Click a portfolio in the agenda.
- **Process:** Lists all portfolios with brand logo, health dot, and a live count of notes/actions added this session (or the health label if none); active item highlighted.
- **Output:** Selects the portfolio for the content panel.

### Feature Name: Meeting Content — Period Comparison & Vs-Projection
**Roles:** BA-PM
**Function:** The per-portfolio working panel with metric comparison.
**Process:**
- **Input:** Period dropdown, "Bandingkan vs" period dropdown, "Bandingkan vs Proyeksi" checkbox.
- **Process:** A KPI grid of five metrics (monthly yield, annualized yield, revenue, net profit, bagi hasil). Each KPI shows the value plus, when a comparison period is chosen, a **delta vs that period** (colored ↑/↓, percentage-points or money), and when the vs-projection toggle is on, a **▲/▼ delta vs projection targets**. Yield is red for Siaga 2/3; a warning shows if the period's data is missing.
- **Output:** Live comparative KPI panel.

### Feature Name: Meeting Weekly Update Entry
**Roles:** BA-PM
**Function:** Capture mid-month weekly progress during the meeting.
**Process:**
- **Input:** Week (1–4), revenue, net profit, short note.
- **Process:** Appends a weekly row and compares weekly revenue against the projection ÷ 4, showing ▲/▼ vs-plan indicators.
- **Output:** Weekly-update rows (session-only).

### Feature Name: Meeting Notes & Action Items
**Roles:** BA-PM
**Function:** Add notes and action items live during the meeting.
**Process:**
- **Input:** Note textarea; action-item input.
- **Process:** Shows existing portfolio notes/actions (read-only) plus in-session additions marked "✦ Baru ditambahkan"; new action items default the assignee to the first team member.
- **Output:** Session-only entries **not merged back** into the main notes/action-item stores.

### Feature Name: End-of-Meeting Summary
**Roles:** BA-PM
**Function:** Recap what was captured on exit.
**Process:**
- **Input:** "Tutup" (close meeting).
- **Process:** Hides the overlay and opens a modal summarizing, per portfolio, how many new notes and action items were added (or "no activity"), dated today.
- **Output:** Summary modal. **Nothing persisted — meeting state is discarded on next start.**

---

## F. Investor Portal — Global

> Investor is a **store consumer**: `Store.onChange` re-syncs and re-renders on any Admin/BA-PM change; `ensureMyProfile()` auto-registers the investor. Financial collections (P&L, covenants, milestones, monthly rows, distributions) **start empty** and depend on the producer apps.

### Feature Name: Sidebar Navigation & Badges
**Roles:** Investor
**Function:** Navigate global pages, swapping to a per-portfolio menu inside a holding.
**Process:**
- **Input:** Nav clicks; back arrow.
- **Process:** Sections for Menu / Returns / Reports & Documents / Contracts. Two live badges: **unread-report count** (orange) and **renewal-soon count** (holdings with <90 contract days, red).
- **Output:** Re-rendered sidebar with active highlight and live badges.

### Feature Name: Investor Dashboard
**Roles:** Investor
**Function:** Portfolio-wide snapshot: KPIs, attention alerts, allocation donut, distribution trend.
**Process:**
- **Input:** Landing page; allocation view toggle (by portfolio / by industry); alert/allocation clicks.
- **Process:** Four stat cards — total invested, total distribution received, latest-period distribution (with MoM %), and **blended annualized yield** (nominal-weighted). An alert panel builds attention items from any Siaga-health portfolio. An allocation **donut** (by portfolio or industry) and a **distribution trend** line chart.
- **Output:** Stat grid, clickable alert list, toggleable donut + legend, trend chart.

### Feature Name: My Portfolio (Portofolio Saya)
**Roles:** Investor
**Function:** Card grid of all holdings with per-holding financial summary.
**Process:**
- **Input:** Text search; health-status filter; card click opens the holding.
- **Process:** Each card shows a health border/badge with a **hover tooltip of reasons**, ownership %, principal, a duration bar (warns near contract end), and a finance mini-grid (latest distribution + MoM %, yield p.a. with trend arrow, total ROI).
- **Output:** Filtered card grid with row count; empty-state when no match.

### Feature Name: Distributions (Global Ledger)
**Roles:** Investor
**Function:** Ledger of all profit-share distributions across portfolios with a proof viewer.
**Process:**
- **Input:** Portfolio, period-range, and status filters; row → holding; "Bukti" → proof modal.
- **Process:** Records come from store batches reported to this investor; per-investor amount = batch total × ownership %. Status derived: *Dibayar* (forwarded), *Diproses* (reported not forwarded), *Ditahan* (held). Three status-total stat cards; a contextual banner when processing/held amounts exist.
- **Output:** Status cards + filtered table (held shows "—"); per-row proof button.

### Feature Name: Transfer-Proof Modal
**Roles:** Investor
**Function:** Show the transfer receipt for a paid distribution.
**Process:**
- **Input:** "Bukti" on a paid row.
- **Process:** Renders portfolio, period, amount, forwarded date, the investor's bank account, a "Berhasil" pill, and the proof filename.
- **Output:** Modal. **"Unduh bukti" is a toast stub.**

### Feature Name: Performance (Global)
**Roles:** Investor
**Function:** Cross-portfolio comparison of yield and monthly distribution contribution.
**Process:**
- **Input:** Period-range filters; portfolio name → holding.
- **Process:** A per-portfolio yield bar chart plus a distribution matrix (periods × portfolios) with trend arrows and a totals row.
- **Output:** Yield bars + monthly-distribution matrix; empty-state when no periods.

### Feature Name: Reports (Global) with Read/Unread & Mark-All-Read
**Roles:** Investor
**Function:** Inbox of monthly reports per portfolio × period with read tracking.
**Process:**
- **Input:** Portfolio filter; row → report modal; "P&L" → P&L modal; "Tandai semua dibaca".
- **Process:** Rows are holdings × periods with a sent report; read-state tracked (in memory); unread count shown; opening a report marks it read and updates the sidebar badge.
- **Output:** Report list with read/unread pills; mark-all-read re-renders. *(Read-state is in-memory only, lost on reload.)*

### Feature Name: Report-Detail Modal
**Roles:** Investor
**Function:** Full monthly report letter for one portfolio × period.
**Process:**
- **Input:** Report row click.
- **Process:** Renders revenue/yield/your-distribution KPIs plus a personalized letter whose transfer wording varies by status (Dibayar/Diproses/Ditahan) and a manager note when the portfolio isn't Sehat; viewing marks it read.
- **Output:** Modal with the report body + an embedded "View P&L" button. **"Unduh PDF" is a toast stub.**

### Feature Name: P&L Comparison Modal
**Roles:** Investor
**Function:** Detailed income-statement viewer with optional period-vs-period comparison.
**Process:**
- **Input:** Period selector + "compare with" selector.
- **Process:** When data exists, computes gross profit, EBITDA, EBIT, pre-tax, and margins, builds COGS/OpEx line items, and (when comparing) adds side-by-side columns with a colored **delta** column. In this build `PNL_DATA` is empty, so it shows "data not yet available".
- **Output:** Income-statement table (or empty message). **"Unduh" is a toast stub.**

### Feature Name: Documents (Global)
**Roles:** Investor
**Function:** Filterable document repository across portfolios.
**Process:**
- **Input:** Portfolio + type filters; "Unduh" per row.
- **Process:** Filters store-sourced documents (including shared `all` docs) by portfolio and type, with per-type icons.
- **Output:** Document rows with row count. **"Unduh" is a toast stub.**

### Feature Name: Contracts & Renewal (Global)
**Roles:** Investor
**Function:** Contract-expiry overview flagging portfolios needing a renewal decision.
**Process:**
- **Input:** Row / "Detail kontrak" → holding.
- **Process:** Sorts holdings by days remaining; severity Kritis(<90)/Segera(<180)/Aman; a red alert bar when any holding is critical.
- **Output:** Info bar, conditional alert, sorted contract table.

### Feature Name: Profile & Settings
**Roles:** Investor
**Function:** View/edit personal profile, distribution bank account, and notification preferences.
**Process:**
- **Input:** Editable profile/bank fields (some read-only); "Simpan perubahan".
- **Process:** Fields prefilled from the profile; a bank-change security notice; a static notification preference list.
- **Output:** Forms rendered. **Save is a toast stub (no persistence); notification toggles are display-only.**

---

## G. Investor Portal — Per-Portfolio

### Feature Name: Holding Overview
**Roles:** Investor
**Function:** Single-portfolio position summary plus company/contract facts.
**Process:**
- **Input:** Opened from a holding card (default page).
- **Process:** Health banner + four KPIs (my nominal + ownership %, total received + ROI, latest distribution/held + status, yield p.a.), a company-info card (code, total value, my investment, contract start/end/remaining, operational duration, principal flag), and a "last 4 months return" line chart.
- **Output:** Banners + KPI grid + fact card + distribution chart. *(Several values render 0 because some holding fields are unsourced in this build.)*

### Feature Name: My Return (Return Saya)
**Roles:** Investor
**Function:** Distribution scheme terms + this investor's distribution history for one portfolio.
**Process:**
- **Input:** "Bukti" per paid row.
- **Process:** A scheme info bar (scheme, basis, frequency, minimum, cap, notes, reference) and four KPIs (total received, avg/month, annualized ROI, ownership %); a per-period history table with yield, ownership, amount (held → "—"), transfer date, and status pill.
- **Output:** Scheme bar + KPI grid + history table with proof buttons.

### Feature Name: Company Performance — Actual vs Projection
**Roles:** Investor
**Function:** Company revenue/net-profit actual-vs-projection charts plus a monthly table.
**Process:**
- **Input:** Month-range selectors (clamped start ≤ end); "P&L" per row.
- **Process:** Projection is fixed; actuals are synthesized from health tier. Dual-line charts (solid actual / dashed projection); a monthly table with revenue, net profit, yield, and "my return".
- **Output:** Info bar, two actual-vs-projection charts, monthly table with per-row P&L buttons.

### Feature Name: Covenants & Milestones (Read-Only)
**Roles:** Investor
**Function:** Read-only view of covenant compliance and milestone status.
**Process:**
- **Input:** Opened from the holding menu.
- **Process:** Renders covenant rows (required/actual/Pass|Gagal) and milestone rows (status → colored label); a red alert appears if any covenant failed.
- **Output:** Read-only tables. *(Empty in this build until BA-PM produces the data.)*

### Feature Name: Holding Reports
**Roles:** Investor
**Function:** Per-portfolio report viewer with a period selector.
**Process:**
- **Input:** Period dropdown; "Lihat P&L".
- **Process:** Lists periods with a sent report; renders the report letter inline (marking it read), or a "no reports yet" placeholder.
- **Output:** Report body or placeholder + P&L button. **"Unduh PDF" is a toast stub.**

### Feature Name: Holding Contract
**Roles:** Investor
**Function:** Per-portfolio contract timeline, documents, and my investment terms.
**Process:**
- **Input:** "Lihat" per contract document.
- **Process:** Critical alert if <90 days; a renewal timeline bar; a contract table (main agreement + addendum); a read-only "my investment terms" form (nominal, ownership, join date, scheme, frequency, principal flag).
- **Output:** Alert, timeline, contract table, read-only terms. **"Lihat" is a toast stub.**

### Feature Name: Holding Documents
**Roles:** Investor
**Function:** Documents scoped to one portfolio (plus shared docs).
**Process:**
- **Input:** "Unduh" per row.
- **Process:** Filters documents to the current portfolio or shared `all`, with per-type icons.
- **Output:** Document rows or empty message. **"Unduh" is a toast stub.**

---

## Integration & Stub Notes

**Store wiring (the headline integration finding):**
- **Admin** = store **producer** (creates all entities); **Investor** = store **consumer** (reactive read). Both reference `arunami-store.js`.
- **BA-PM is disconnected** — it runs on hardcoded in-memory data with no store, so: companies Admin onboards don't reach BA-PM; BA-PM's P&L/covenants/milestones/monthly data never reach the Investor (whose financial views therefore render empty); and BA-PM's "forward to investor" doesn't reach the Investor's store record (distributions can't truly flip to *Dibayar*).
- The realized-**yield** map on the Admin side is unpopulated, so Admin-computed payouts resolve to Rp 0 until BA-PM report data supplies yields.

**Stubbed / non-persistent capabilities (UI present, no real effect):**
- **AI report drafting** (from platform data and from an uploaded brand document) — BA-PM. No logic; upload captures a filename only.
- **Excel/CSV P&L upload** and P&L Save/Reset/Edit — BA-PM.
- **Proof upload** (BA-PM bagi hasil) and **document attachments** — filenames only, no bytes.
- **PDF / report export** and **Publish** — Investor "Unduh PDF" is a toast; BA-PM Publish only advances the stepper.
- **Renewal action buttons** (Perpanjang / Restrukturisasi / Exit / Detail) — BA-PM.
- **Reminder "send"** (clears selection only) and **audit-log / engagement / renewal filters** — BA-PM (cosmetic).
- **Admin security toggles**, **announcement detail**, and **document/KYC file bytes** — Admin (metadata/visual only).
- **Investor profile save**, **notification toggles**, and **all download buttons** — Investor (toast stubs).
- **Investor read-state** is in-memory only (lost on reload).

**Known issues observed in the prototype code:**
- BA-PM Ringkasan status filter values don't match the health strings, so critical/watch filtering doesn't work.
- BA-PM "actual" revenue/profit lines are synthesized (plan × health tier), not real data.
- Admin dashboard health bars use a fixed denominator of 4.

---

*Source of truth: the three V2 prototypes (`arunami-admin-final.html`, `arunami-bapm-final.html`, `arunami-investor-final.html`). Companion documents: `flow-audit.md` (user-flow audit), `consolidated-features.md` (phased build plan), `Arunami Portfolio V1 - FEATURES.md` (original 4-role spec). A working React + Firebase build of this system exists under `arunami-app/`.*
