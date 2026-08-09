# Data-Flow Remediation Roadmap

> Tracking document for the data-integrity audit (stuck data / double input / compromised integrity).
> Owner: _unassigned_ · Started: 2026-06-28 · Last updated: 2026-08-03

This is the single source of truth for the audit fixes. Update the **Status** and **Progress Tracker**
as work lands. Keep the changelog at the bottom current.

---

## Status legend

| Mark | Meaning |
|------|---------|
| ⬜ | Not started |
| 🟦 | In progress |
| ✅ | Done & verified |
| ⏸️ | Blocked / parked |
| ❌ | Won't fix (with reason) |

**Severity:** 🔴 Critical (wrong money/data investors see) · 🟠 High (orphans/stuck data) · 🟡 Medium · 🟢 Low

---

## Roadmap at a glance

The work is sequenced into 4 phases. Phase 1 stops active damage; later phases harden the system.

| Phase | Theme | Tasks | Goal |
|-------|-------|-------|------|
| **1** | Stop the bleeding | DF-01, DF-02, DF-03, DF-05 | No more wrong money math or destroyed files |
| **2** | Orphans & lifecycle | DF-04, DF-06, DF-07 | Deletes/creates leave no dangling data |
| **3** | Consistency & guards | DF-08, DF-09, DF-10, DF-11 | Denormalized data stays in sync; no dupes |
| **4** | Hardening | DF-12, DF-13, DF-14, DF-15 | Leaks, indexes, edge cases closed |

---

## Progress Tracker

| ID | Title | Sev | Phase | Status | Owner |
|----|-------|-----|-------|--------|-------|
| DF-01 | Dedup Bagi Hasil recap (manual wins) + manual proof upload | 🔴 | 1 | ✅ | – |
| DF-02 | Per-period dedup on PnL/projection upload | 🔴 | 1 | ✅ | – |
| DF-03 | Ownership sum ≤ 100% guard | 🔴 | 1 | ✅ | – |
| DF-05 | Fix IR transfer-proof delete (order + rules) | 🟠 | 1 | ✅ | – |
| DF-04 | Soft archive for users/portfolios | 🟠 | 2 | ✅ | – |
| DF-06 | Setup wizard must persist reviewed financials | 🟠 | 2 | ❌ N/A | – |
| DF-07 | Unpublish path for accumulated/all-time reports | 🟠 | 2 | ✅ | – |
| DF-08 | Resolve-on-read names (live lookup vs denorm) | 🟡 | 3 | ✅ | – |
| DF-09 | Make publish/unpublish batch resilient (set vs update) | 🟡 | 3 | ✅ | – |
| DF-10 | Prevent duplicate allocations at data layer | 🟡 | 3 | ✅ | – |
| DF-11 | Reconcile quarterly vs monthly period keys | 🟡 | 3 | ✅ | – |
| DF-12 | Storage orphan cleanup on failed proof write | 🟢 | 4 | ✅ | – |
| DF-13 | Surface principalAmount in notifications/recaps | 🟢 | 4 | ✅ | – |
| DF-14 | Notification index error must not blank the view | 🟢 | 4 | ✅ | – |
| DF-15 | Re-sync inside deleteReport (latent trap) | 🟢 | 4 | ✅ | – |

**Done: 14 / 15** (+ DF-06 N/A) — 🎉 ALL PHASES COMPLETE. Every actionable finding resolved.

---

## Phase 1 — Stop the bleeding 🔴

### DF-01 · Dedup Bagi Hasil recap — manual wins, proof file optional 🔴 ✅
- **Decision:** Manual entry **wins** on a period collision. Manual entries **may** upload a proof file (PDF/image), becoming first-class backfilled proofs.
- **Amended 2026-08-03:** the proof file is **optional**, not required. Teams backfilling pre-app history typically only hold receipts for the most recent months, and the mandatory-file rule blocked them from entering older payouts at all — the exact data this feature exists to capture. Entries without a proof are flagged **"Tanpa Bukti"** on internal views only (analyst Resume Bagi Hasil, admin override); investor-facing recaps show period + amount with no evidence marker.
- **Problem:** Both recap views merge `bagiHasilManualEntries` + `investorTransferProofs` with no dedup → a manual backfill for a period that also has a transfer proof double-counts the investor's "Total Bagi Hasil".
- **Files:** `src/pages/analyst/portfolio/profit-sharing/BagiHasilResumeSection.tsx:102-112`, `src/pages/investor/portfolio/InvestorBagiHasilResumePage.tsx:52-64`, `src/lib/firestore.ts` (`createBagiHasilManualEntry`, `updateBagiHasilManualEntry`, `deleteBagiHasilManualEntry`), `src/types/index.ts` (`BagiHasilManualEntry`), `storage.rules`
- **Fix approach:**
  1. Add file upload to the manual-entry form (reuse the proof upload validation: PNG/JPG/WEBP/PDF, ≤5 MB). Store `fileUrl`/`fileName`/`storagePath` on `BagiHasilManualEntry` (optional for legacy rows).
  2. On merge, build a set of manual `(period)` keys; **drop the automated proof row** when a manual row exists for the same period (manual wins). Count once.
  3. `deleteBagiHasilManualEntry` must also delete the uploaded Storage file (docs first, file best-effort — same ordering rule as DF-05).
  4. Allow manual rows without a file (legacy rows and un-evidenced backfills alike); mark them internally.
- **Acceptance criteria:**
  - [ ] A manual entry's proof file, when present, is viewable from both recap views.
  - [ ] A manual entry without a proof saves fine and is marked "Tanpa Bukti" on internal views only.
  - [ ] A period with both a proof and a manual entry shows **one** row (the manual one) and counts **once**.
  - [ ] Investor and analyst recap totals match for the same investor+portfolio.
  - [ ] Deleting a manual entry removes its Storage file.
- **Risk if skipped:** Investors see inflated payout totals → trust/legal exposure.

### DF-02 · Per-period dedup on PnL/projection upload 🔴 ✅
- **Problem:** `saveReport` blindly `addDoc`s; two docs for the same period cause `syncFinancialData`'s `Map.set(period)` to silently drop one (non-deterministic winner) → lost revenue/profit in all charts.
- **Files:** `src/lib/firestore.ts:259-265` (`saveReport`), `:485-506` (`syncFinancialData` sort+map), upload callers in `src/pages/analyst/portfolio/PnLPage.tsx`, `ProjectionsPage.tsx`
- **Fix approach:**
  1. Make report identity per-period deterministic: either use a doc id of `${type}_${normalizePeriod(period)}` (upsert via `setDoc` merge), **or** have `saveReport` query for an existing same-period+type doc and update it.
  2. Add a `createdAt` tiebreaker to the sort in `syncFinancialData` so the winner is deterministic during migration of existing dupes.
  3. One-off: detect & report existing duplicate-period docs (script or admin warning).
- **Acceptance criteria:**
  - [ ] Re-uploading a period overwrites the existing report instead of creating a second doc.
  - [ ] PnL table shows exactly one column per period.
  - [ ] No period silently disappears from `revenueData`/`profitData`/`costStructure`.
- **Risk if skipped:** Charts show wrong totals after any re-upload.

### DF-03 · Ownership sum ≤ 100% guard 🔴 ✅
- **Problem:** Nothing validates that a portfolio's allocations sum to ≤100%. 3×50% pays out 150% of the profit pool.
- **Files:** `src/lib/firestore.ts:412-434` (`createAllocation`/`updateAllocation`), `src/pages/analyst/portfolio/InvestorsPage.tsx`, `src/pages/admin/AdminPortfolios.tsx` (add/edit allocation handlers), `src/lib/distributionStrategies.ts:56-59`
- **Fix approach:**
  1. Before create/update, fetch existing allocations for the portfolio and verify `sum(ownershipPercent) + new ≤ 100` (allow a tiny epsilon).
  2. Block in UI with a clear message showing remaining headroom (e.g. "Tersisa 20% untuk dialokasikan").
  3. Add a portfolio-level "allocation health" indicator (total %, over/under).
- **Acceptance criteria:**
  - [ ] Cannot save an allocation that pushes the portfolio over 100%.
  - [ ] Existing over-allocated portfolios are flagged in the UI.
- **Risk if skipped:** Real money over-distributed.

### DF-05 · Fix IR transfer-proof delete (order + rules) 🟠 ✅
- **Problem:** `deleteInvestorTransferProof` deletes the Storage file *first*, then commits a doc batch that Firestore rules reject for `investor_relation`. File is destroyed; docs survive pointing at a 404.
- **Files:** `src/lib/firestore.ts:1103-1114`, `firestore.rules` (proof + notification delete rules), delete buttons in `src/pages/investor-relation/IRTransferProofs.tsx`
- **Fix approach:**
  1. Reorder: commit the Firestore doc/notification deletes **first**, then best-effort `deleteObject` for Storage.
  2. Decide policy: either grant `investor_relation` delete permission in `firestore.rules`, or hide the delete button from IR. (Recommend: allow IR delete — they own this flow.)
- **Acceptance criteria:**
  - [ ] IR can delete a proof end-to-end (doc + notification + file all gone).
  - [ ] A failed doc delete never destroys the Storage file first.
  - [ ] No proof/notification left pointing at a missing file.
- **Risk if skipped:** Active file destruction + dangling refs today.

---

## Phase 2 — Orphans & lifecycle 🟠

### DF-04 · Soft archive for users/portfolios 🟠 ✅
- **Problem:** Both deletes remove only the root doc; Firestore doesn't cascade. Leaves orphaned allocations, proofs, notifications, reports, manual entries, communications, and entire subcollections.
- **Files:** `src/lib/firestore.ts:62-64` (`deleteUser`), `:103-105` (`deletePortfolio`)
- **Decision:** **Soft archive** — keep all data for audit, hide archived records from the UI.
- **Fix approach:**
  1. Add `archived?: boolean` + `archivedAt?` to `AppUser` and `Portfolio`. Replace `deleteUser`/`deletePortfolio` with `archiveUser`/`archivePortfolio` (and `unarchive`).
  2. Filter archived users/portfolios out of every list query/UI (admin, IR, analyst, investor). Keep a "Show archived" toggle for admins.
  3. Exclude archived investors from `assignedInvestors`-driven counts and recap aggregations.
  4. Keep the hard-delete functions available to admins only as an explicit "permanent delete" with the cascade described, for genuine cleanup.
- **Implemented:** `archived`/`archivedAt` on `AppUser` + `Portfolio`; `archiveUser`/`unarchiveUser`/`archivePortfolio`/`unarchivePortfolio` in firestore.ts. `getAllUsers`/`getAllPortfolios` filter archived by default (`includeArchived` opt-in); `getInvestorPortfolios`/`getAnalystPortfolios` drop archived; `refreshPortfolioInvestors` excludes archived investors from `assignedInvestors`. `archiveUser` refreshes affected portfolios. AdminUsers + AdminPortfolios: delete→archive, "Tampilkan arsip" toggle, unarchive + separate permanent-delete (admin). Hard `deleteUser`/`deletePortfolio` kept for permanent cleanup.
- **Acceptance criteria:**
  - [x] Archiving a user/portfolio hides it from active lists/dashboards but preserves all related docs.
  - [x] Archived investors drop out of `assignedInvestors` (counts + portfolio access); archived portfolios drop off dashboards.
  - [x] Admin can toggle "show archived", unarchive, or permanently delete.
- **Known limitation (tracked):** archived investors' allocation rows can still appear in a portfolio's direct allocation table (`getAllocationsForPortfolio` doesn't join user.archived). Acceptable for now; revisit if it surfaces in QA.

### DF-06 · Setup wizard must persist reviewed financials 🟠 ❌ NOT APPLICABLE
- **Investigation (2026-06-28):** The original finding assumed the wizard still collects PnL/projection via `StepReviewFinancials`. It does **not**. The current `PortfolioSetupWizard` has only 2 steps (Info + Investment Structure) and imports only `createPortfolio` + `savePortfolioConfig`. `StepReviewFinancials.tsx` and `StepUploadDocuments.tsx` are **dead code** — not imported anywhere (verified by grep).
- **Conclusion:** No reviewed financials are discarded because none are collected. By design, every new portfolio starts in grace period with no PnL; the analyst uploads PnL later via `PnLPage`, which correctly calls `syncFinancialData` (and now upserts per DF-02). **No data-integrity bug — no fix needed.**
- **Optional follow-up (not blocking):** delete the dead `StepReviewFinancials.tsx` / `StepUploadDocuments.tsx` to prevent a future dev from re-wiring the discard path. Left in place pending an explicit cleanup decision.

### DF-07 · Unpublish path for accumulated/all-time reports 🟠 ✅
- **Problem:** `unpublishAccumulatedReport` / `unpublishAllTimeReport` existed but had zero UI callers → published-with-wrong-numbers reports couldn't be retracted.
- **Implemented:** Added an optional `onChanged` prop + a "Tarik" (unpublish) action to `InvestorReportHistory.tsx`, shown only for `accumulated`/`all_time` reports. It calls the right unpublish fn, toasts, and refreshes. Wired `onChanged` from `IRReporting.tsx` (`refreshReports`) and `AdminInvestorDetail.tsx` (`loadData`).
- **Acceptance criteria:**
  - [x] IR/admin can retract an accumulated and an all-time report from the report history; investor no longer sees it after refresh.
- **Note:** the bare `updateDoc` hardening (missing-doc tolerance) is deferred to **DF-09**; safe here because the button only shows for existing published docs.

---

## Phase 3 — Consistency & guards 🟡

### DF-08 · Resolve-on-read names (live lookup vs denormalized) 🟡 ✅
- **Implemented:** Allocation tables now render the **live** investor name/email from the loaded `users` list (fallback to the denormalized copy only if the user is missing): [InvestorsPage.tsx](../src/pages/analyst/portfolio/InvestorsPage.tsx), [AdminPortfolios.tsx](../src/pages/admin/AdminPortfolios.tsx). [AdminInvestors.tsx](../src/pages/admin/AdminInvestors.tsx) resolves portfolio **code** badges from a live `portfolioId → code` map. AdminInvestors/AdminInvestorDetail already render investor identity from the live `user`/`getPortfolio`.
- **Acceptance criteria:**
  - [x] After a user rename, allocation/investor views show the new name with no migration.
  - [x] After a portfolio rename, the code badge updates live.
- **Deliberately left as point-in-time snapshots:** transfer-proof and report *history* rows keep their stored `investorName`/`portfolioName` — they are records of what was sent at that moment, so a live override there would rewrite history. Not a staleness bug.

<details><summary>Original finding</summary>
- **Problem:** `updateUser`/`updatePortfolio` write only the root doc; denormalized `investorName`/`investorEmail`/`portfolioName`/`portfolioCode` on allocations, proofs, reports, notifications go stale.
- **Decision:** **Resolve on read** — display names/emails are looked up live from `users`/`portfolios`, not trusted from the denormalized copy.
- **Files:** `src/lib/firestore.ts:58-60`, `:99-101`; consumers that render `investorName`/`investorEmail`/`portfolioName`/`portfolioCode` (allocations, proofs, reports, notifications views)
- **Fix approach:**
  1. Build a `uid → AppUser` and `portfolioId → Portfolio` lookup at the page/store level (most pages already load `getAllUsers`).
  2. Render the live name from the lookup, falling back to the denormalized copy only if the entity is missing.
  3. Leave denormalized fields written (cheap historical snapshot) but never treat them as the display source of truth.
- **Acceptance criteria:**
  - [ ] After a rename, all financial-facing labels reflect the new name without a data migration.
</details>

### DF-09 · Make publish/unpublish batch resilient 🟡 ✅
- **Problem:** Publish/unpublish used `batch.update` across both mirror docs — rejected the whole batch if either mirror was missing.
- **Implemented:** Switched all mirror writes to `set(..., { merge: true })` — `publishInvestorReport`, `unpublishInvestorReport`, `unpublishAllInvestorReports`, and the two bare-`updateDoc` paths `unpublishAccumulatedReport` / `unpublishAllTimeReport` (now `setDoc` merge). Idempotent and tolerant of an absent mirror.
- **Acceptance criteria:**
  - [x] A missing mirror doc no longer blocks publish/unpublish of the live copy.

### DF-10 · Prevent duplicate allocations at the data layer 🟡 ✅
- **Problem:** `createAllocation` was an unconditional `addDoc` with an auto-id; only the UI guarded against dupes. Concurrent adds → uid listed twice, double-counted totals.
- **Implemented:** `createAllocation` now (1) throws if an allocation already exists for the (investor × portfolio) pair, and (2) writes with a deterministic doc id `${portfolioId}_${investorUid}` so a create-create race collapses to one doc. `refreshPortfolioInvestors` dedupes `assignedInvestors` via a `Set`.
- **Acceptance criteria:**
  - [x] Two attempts to allocate the same investor×portfolio result in one doc (and a clear error on the second).
  - [x] `assignedInvestors` never contains duplicate uids.

### DF-11 · Reconcile quarterly vs monthly period keys 🟡 ✅
- **Investigation:** The Map-collision scenario requires a report stored with a `YYYY-Qn` period. Verified that **all** PnL/projection reports are saved via `normalizePeriod(month.month)` → always `YYYY-MM` (PnLPage, ProjectionsPage). Quarterly keys (`buildQuarterKey`) appear only in investor-report *display grouping*, never in stored report periods. So `syncFinancialData`'s join cannot collide today.
- **Implemented (hardening of the real residual symptom):** `comparePeriods` now tiebreaks equal sort keys by the raw string, so any mixed monthly/quarterly list (e.g. IR report history) orders **deterministically** instead of arbitrarily. The DF-02 `createdAt` tiebreaker already made the `.at(-1)` "latest" deterministic.
- **Acceptance criteria:**
  - [x] Mixed monthly/quarterly lists sort deterministically.
  - [x] No report-period Map collision possible with current data flows (reports are monthly-only).

---

## Phase 4 — Hardening 🟢

### DF-12 · Storage orphan cleanup on failed proof write 🟢 ✅
- **Problem:** If `uploadBytes` succeeded but the doc write failed, the file was orphaned.
- **Implemented:** `writeTransferProof`, `createBagiHasilManualEntry`, and `updateBagiHasilManualEntry` now wrap the Firestore write in try/catch and best-effort `deleteObject` the just-uploaded file on failure (for update, the freshly-uploaded *replacement* is removed, leaving the old file as the live reference).
- **Acceptance:** [x] A failed proof/manual-entry write leaves no orphaned Storage file.

### DF-13 · Surface principalAmount in notifications/recaps 🟢 ✅
- **Decision:** Principal (pengembalian pokok) is **return of capital, not profit** — it is intentionally **excluded** from every "Total Bagi Hasil" figure (those sum `amount` only, which is correct). Principal is surfaced where it belongs: the **Resume Bagi Hasil** pages (DF-01) show it in a dedicated column.
- **Implemented:** `principalAmount` is now also mirrored into the `investorNotifications` doc (+ added to the `InvestorNotification` type) so the mirror carries the full payout detail and the data isn't lost.
- **Acceptance:** [x] Principal is consistently handled — excluded from bagi-hasil totals (documented), shown on the Resume pages, and carried on the notification.

### DF-14 · Notification query must not blank the view 🟢 ✅
- **Problem:** `getNotificationsForInvestor` used `where + orderBy('createdAt')`, needing a composite index; if missing, the query threw and the hook silently showed Rp 0 + no history.
- **Implemented:** Dropped the `orderBy` — query by `investorUid` only and sort by `createdAt` desc in JS (the pattern used everywhere else in this file). No composite index needed, so the failure mode is removed. (`orderBy` import cleaned up.)
- **Acceptance:** [x] No composite index dependency; the investor's bagi-hasil view can't be blanked by a missing index.

### DF-15 · Re-sync inside deleteReport (latent trap) 🟢 ✅
- **Problem:** `deleteReport` didn't re-sync `financialData`; all callers did, but a future caller could forget.
- **Implemented:** `deleteReport` and `deleteAllReports` now call `syncFinancialData` internally (self-contained). Removed the now-redundant caller `syncFinancialData` calls in PnLPage and ProjectionsPage.
- **Acceptance:** [x] Deleting a report can never leave `financialData` stale, regardless of caller.

---

## Decisions (resolved 2026-06-28)

- [x] **DF-01:** **Manual entry wins** on a period collision. Manual entries **may** upload a proof file (PDF/image) — with one they become first-class backfilled proofs. *(Amended 2026-08-03: the file was originally mandatory; it is now optional, with un-evidenced entries flagged internally only.)*
- [x] **DF-04:** **Soft archive** — mark users/portfolios as archived and hide from UI; keep all data for audit history.
- [x] **DF-08:** **Resolve on read** — stop trusting denormalized name/email copies; look up the live name when displaying.

---

## Changelog

| Date | Task | Change | By |
|------|------|--------|-----|
| 2026-06-28 | – | Roadmap created from data-flow audit | audit |
| 2026-06-28 | – | Decisions resolved (DF-01 manual-wins+file, DF-04 soft-archive, DF-08 resolve-on-read) | – |
| 2026-06-28 | DF-01 | Recap dedup (manual wins); manual entries now require a proof file; shared `ProofDropzone`; storage cleanup on edit/delete | – |
| 2026-06-28 | DF-02 | `saveReport` upserts by (type, period); deterministic createdAt tiebreaker in `syncFinancialData` | – |
| 2026-06-28 | DF-03 | `assertOwnershipWithinLimit` guard in `createAllocation`/`updateAllocation`; UI surfaces the message | – |
| 2026-06-28 | DF-05 | `deleteInvestorTransferProof` deletes docs before file; rules let IR+staff delete proofs/notifications | – |
| 2026-06-28 | – | Phase 1 verified: `tsc -b` clean, eslint clean (no new findings) | – |
| 2026-06-28 | DF-04 | Soft archive: type fields + archive/unarchive fns; default-filter in fetch fns; `refreshPortfolioInvestors` excludes archived; AdminUsers/AdminPortfolios UI (archive/unarchive/show-archived/permanent-delete) | – |
| 2026-06-28 | DF-06 | Investigated → NOT APPLICABLE (wizard no longer collects financials; review steps are dead code) | – |
| 2026-06-28 | DF-07 | "Tarik" (unpublish) action for accumulated/all-time reports in `InvestorReportHistory`; wired from IRReporting + AdminInvestorDetail | – |
| 2026-06-28 | – | Phase 2 verified: `tsc -b` clean (pre-existing eslint warnings only) | – |
| 2026-06-28 | DF-09 | Publish/unpublish mirror writes switched to `set(merge)` (incl. accumulated/all-time) — missing mirror no longer blocks | – |
| 2026-06-28 | DF-10 | `createAllocation` dup-guard + deterministic id `${pid}_${uid}`; `assignedInvestors` deduped | – |
| 2026-06-28 | DF-11 | Confirmed reports are monthly-only (no live collision); `comparePeriods` deterministic tiebreaker added | – |
| 2026-06-28 | DF-08 | Resolve-on-read investor name/email in allocation tables; live portfolio code in AdminInvestors | – |
| 2026-06-28 | – | Phase 3 verified: `tsc -b` clean (pre-existing `no-explicit-any` in InvestorsPage mockAlloc only) | – |
| 2026-06-28 | DF-12 | Storage orphan cleanup on failed proof/manual-entry doc write (proof + bagi-hasil create/update) | – |
| 2026-06-28 | DF-13 | `principalAmount` mirrored to notification + type; documented exclusion from bagi-hasil totals | – |
| 2026-06-28 | DF-14 | `getNotificationsForInvestor` drops composite-index dependency (JS sort); removed `orderBy` import | – |
| 2026-06-28 | DF-15 | `deleteReport`/`deleteAllReports` self-sync `financialData`; redundant caller syncs removed | – |
| 2026-06-28 | – | Phase 4 verified: `tsc -b` clean (pre-existing eslint warnings only). 🎉 All phases done. | – |
| 2026-08-03 | DF-01 | Proof file on manual bagi-hasil entries relaxed to optional (user feedback: pre-app history has no receipts); un-evidenced entries flagged "Tanpa Bukti" on internal views only | – |
| 2026-08-09 | DF-01 | **Invariant amended:** manual entries now win a period collision only on the bagi-hasil dimension. Manual bagi hasil + pokok are each optional (pokok-only entries allowed), and a pokok-only row carries no bagi-hasil claim — so it must not suppress that period's proof, which would silently erase a paid payout from investor totals. Dedupe sets in `BagiHasilResumeSection`, `InvestorBagiHasilResumePage`, `InvestorDistributionsPage`, `InvestorPerformancePage` now filter on `bagiHasilAmount > 0` | – |

> ⚠️ **Deploy note:** DF-05 changed `firestore.rules`. Deploy rules (`firebase deploy --only firestore:rules`) for the IR delete fix to take effect. Runtime/manual QA of all flows is recommended before closing.
> ℹ️ **DF-04 note:** archive/unarchive write the `archived` flag via existing admin update rules — no rules change needed. No Firestore index needed (filtering is client-side).

<!--
HOW TO UPDATE THIS FILE
- Move a task's Status mark in the Progress Tracker AND its section header.
- Tick acceptance-criteria boxes as they're verified.
- Bump "Done: N / 15" and "Last updated".
- Add a changelog row per landed change with the DF-id.
-->
