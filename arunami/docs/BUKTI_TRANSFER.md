# Bukti Transfer & Investor Notification

Replace the manual WhatsApp handoff with an in-app flow: Investor Relation (IR)
uploads a payout screenshot against a published investor report, and the
investor sees an alert on their dashboard until they clear it.

## Architecture

```
IR uploads screenshot
       │
       ▼
Firebase Storage: transferProofs/{investorUid}/{reportId}/{timestamp}.{ext}
       │
       ▼ (single batched write)
investorTransferProofs/{id}     ← proof metadata (audit / IR list views)
investorNotifications/{id}      ← in-app alert (cleared = false)
       │
       ▼
Investor dashboard banner (only while uncleared ones exist)
       │
       ▼ "Tandai Dibaca"
investorNotifications/{id}.cleared = true  → banner disappears, history keeps it
```

## Collections

### `investorTransferProofs/{id}`
Top-level. One doc per proof.

| Field | Type | Notes |
| --- | --- | --- |
| `investorUid` | string | Required for the per-investor list rule. |
| `investorName` | string | Denormalized. |
| `investorReportId` | string | Links to the published `investorReports` doc. |
| `portfolioId` | string \| null | `null` for accumulated / all-time. |
| `portfolioName` | string | Denormalized for the IR table. |
| `period` | string | `YYYY-MM`, `YYYY-Qn`, or `ALL_TIME`. |
| `amount` | number | Manual entry (not derived from report). |
| `fileUrl` | string | Firebase Storage download URL. |
| `fileName` | string | Original file name. |
| `storagePath` | string | Used for cleanup on delete. |
| `notes` | string | Optional free-text. |
| `uploadedBy`, `uploadedByName` | string | IR user. |
| `createdAt` | Timestamp | Server-stamped. |

### `investorNotifications/{id}`
Top-level. One doc per notification, mirrors the proof so the investor
dashboard never needs to join collections.

| Field | Type | Notes |
| --- | --- | --- |
| `investorUid` | string | Required for per-investor `list` rule. |
| `type` | `'transfer_proof'` | Extensible. |
| `transferProofId` | string | Reverse link to proof doc. |
| `investorReportId`, `portfolioName`, `period`, `amount`, `fileUrl` | string/number | Denormalized. |
| `message` | string | Pre-built Indonesian sentence. |
| `cleared` | boolean | Investor flips this on "Tandai Dibaca". |
| `clearedAt` | Timestamp \| undefined | Set with `cleared`. |
| `createdAt` | Timestamp | Server-stamped. |

Cleared notifications are **kept** in the collection so the History tab can
render the income trail. Deletion is admin-only.

## Security Rules

`firestore.rules` adds:

```
investorTransferProofs  → staff / IR create+update; admin delete; investors read/list own
investorNotifications   → staff / IR create; investor may only flip {cleared, clearedAt}
                           on own docs; staff / IR may update any field; admin delete
```

`storage.rules` constrains the upload path to `transferProofs/{investorUid}/{reportId}/{fileName}`,
caps at 5 MB, and restricts `contentType` to `image/*` or `application/pdf`. The
investor can read files under their own `investorUid` prefix; staff / IR can read any.

> **Cross-service note:** the role checks read `users/{uid}` from Firestore. In
> Storage rules this **must** use `firestore.get(/databases/(default)/documents/users/$(uid))`
> — the bare `get(/databases/$(database)/...)` Firestore-rules syntax is invalid
> in Storage rules and silently denies every upload.

## UI Flow

### Investor Relation — `/investor-relation/transfer-proofs`
- Home: investor picker (same UI as `IRReporting`).
- Investor detail: list of all **published** reports (per-project, accumulated, all-time),
  with existing proofs shown inline and a `Kirim Bukti` button per row.
- Modal: dropzone screenshot, empty nominal (per spec Q3), optional notes.
  Validated with `zod`; submit uploads to Storage + writes both Firestore docs in one batch.
- Each existing proof has a delete icon that removes the file + proof + notification.

### Investor — `/investor`
- Top-of-page navy/blue banner shows all uncleared notifications, each with thumbnail,
  `Lihat` (opens full image in dialog), and `Tandai Dibaca` (flips `cleared`).
- When the investor presses `Tandai Dibaca`, the row vanishes from the banner in real
  time and the doc stays around.
- Below the portfolios grid, a `Riwayat Bukti Transfer` tab renders the full
  income trail (both cleared and uncleared, newest first), so the investor can
  track every payout received.

## Files

**Added**
- `src/pages/investor-relation/IRTransferProofs.tsx`
- `src/components/investor/TransferProofNotificationBanner.tsx`
- `src/components/investor/TransferProofHistoryList.tsx`
- `src/components/investor/useTransferProofNotifications.ts`
- `storage.rules`

**Edited**
- `src/lib/firestore.ts` — added `createInvestorTransferProof`, `getTransferProofsForInvestor`,
  `getAllTransferProofs`, `getTransferProofsForReport`, `deleteInvestorTransferProof`,
  `getNotificationsForInvestor`, `clearNotification`; imported `storage`/`uploadBytes`/
  `getDownloadURL`/`deleteObject`; added types `InvestorTransferProof`, `InvestorNotification`.
- `src/types/index.ts` — added the two new interfaces + `InvestorNotificationType`.
- `firestore.rules` — two new top-level match blocks.
- `firebase.json` — registers `storage.rules`.
- `src/App.tsx` — registered `/investor-relation/transfer-proofs` route.
- `src/pages/investor-relation/InvestorRelationLayout.tsx` — added `Bukti Transfer` nav item.
- `src/pages/investor/InvestorDashboard.tsx` — mounted banner and history tab.

## Validation
- File: PNG/JPG/JPEG/WEBP/PDF, ≤ 5 MB (enforced in both `react-dropzone` and `storage.rules`).
- Amount: positive number, required.
- Notes: ≤ 280 chars, optional.
- All form fields validated through `zod` via `@hookform/resolvers` (already installed).

## Deployment
After merging:
1. `firebase deploy --only firestore:rules,firestore:indexes,storage` (the new collections
   do not need new composite indexes — `where('investorUid','==',X)` alone is supported
   by the existing single-field `investorUid` ordering).
2. No backend changes; everything ships in the Vercel static bundle.