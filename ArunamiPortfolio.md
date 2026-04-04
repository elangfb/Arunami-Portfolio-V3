# ARUNAMI - Portfolio Management Platform: Complete Technical Specification

## Context
The user wants a detailed description document of the ARUNAMI web application to hand off to a developer for a from-scratch rebuild. This document covers all features, role relationships, data models, workflows, and tech stack.

---

## 1. Overview

**ARUNAMI** is a role-based portfolio management platform for investment reporting. It allows an admin to manage users and portfolios, analysts to upload and analyze financial documents (with AI assistance), and investors to view their assigned portfolio performance and returns.

**Language:** Indonesian UI (labels, error messages, navigation)

---

## 2. Roles & Permissions

### 2.1 Admin
- Create user accounts (analyst or investor) with email/password
- Create portfolios with metadata (name, code, stage, period, initial investment, description)
- Assign/unassign investors to portfolios
- View dashboard with user and portfolio statistics
- Can also access analyst views

### 2.2 Analyst
- View all portfolios on their dashboard
- For each portfolio:
  - **Upload PnL documents** (PDF/Excel/CSV) → AI extracts financial data → manual review → save
  - **Upload Projection documents** → same AI extraction flow
  - **View Overview**: KPI cards (revenue, profit, transactions, AOV) with variance vs projection, bar charts, radar chart
  - **View Revenue & Profit analysis**: projected vs actual comparison charts, variance table, revenue mix breakdown
  - **View Cost Structure**: cost breakdown table with percentage bars
  - **View Investor Returns**: ROI calculations, per-slot return, transfer proof tracking
  - **Create Management Reports**: business summary, issues (with severity), action items (with status/category)
  - **Create Arunami Notes**: simple text notes with timestamps, CRUD

### 2.3 Investor
- View only portfolios assigned to them
- For each assigned portfolio:
  - **Overview**: simplified KPIs (revenue, profit, ROI per slot) — no projection data shown
  - **My Returns**: detailed ROI breakdown (monthly/annual), calculation table
  - **Download Report**: generates a .txt file with portfolio summary and return calculations

### 2.4 Access Control
- `AuthGuard` component wraps each role's layout
- Admin routes: admin only
- Analyst routes: admin + analyst
- Investor routes: investor only
- Unauthenticated users → redirect to `/login`
- Authenticated users hitting `/` → redirect to role-specific dashboard

---

## 3. Route Structure

```
/ (root) → redirects based on role
├── /login
├── /admin
│   ├── /admin (dashboard: user/portfolio stats)
│   ├── /admin/users (create users, list all users)
│   └── /admin/portfolios (create portfolios, assign investors)
├── /analyst
│   ├── /analyst (dashboard: portfolio grid)
│   └── /analyst/portfolios/[id]
│       ├── /overview (KPI cards, revenue/profit charts, radar)
│       ├── /pnl (upload PnL docs, AI extraction, history)
│       ├── /projections (upload projection docs, AI extraction, history)
│       ├── /revenue (projected vs actual charts, variance table, revenue mix)
│       ├── /costs (cost breakdown table)
│       ├── /investors (ROI calc, transfer proofs)
│       ├── /management (create management reports with issues & action items)
│       └── /notes (CRUD text notes)
└── /investor
    ├── /investor (dashboard: assigned portfolios only)
    └── /investor/portfolios/[id]
        ├── /overview (simplified KPIs, revenue chart without projections)
        ├── /returns (ROI breakdown: monthly, annual, per-slot)
        └── /report (download .txt report)
```

---

## 4. Data Models (Firestore Collections)

### 4.1 `users` collection
```
{
  uid: string
  email: string
  displayName: string
  role: "admin" | "analyst" | "investor"
  createdBy: string (admin UID)
  createdAt: Timestamp
}
```

### 4.2 `portfolios` collection
```
{
  id: string
  name: string
  code: string
  stage: string
  periode: string
  investasiAwal: number (initial investment)
  description: string
  assignedInvestors: string[] (UIDs)
  assignedAnalysts: string[] (UIDs)
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### 4.3 `portfolios/{id}/financialData` subcollection
Document key: `"current"`
```
{
  revenueData: [{ month, proyeksi, aktual }]
  profitData: [{ month, proyeksi, aktual }]
  costStructure: [{ name, amount, percentage }]
  transactionData: [{ month, laptop, service, aksesoris }]
  aovData: [{ category, value }]
  revenueMix: [{ name, value, percentage }]
  projections: [{ month, revenue, profit, type: "actual"|"forecast" }]
  radarData: [{ metric, value, fullMark }]
  investorConfig: {
    totalSlots: number
    nominalPerSlot: number
    investorSharePercent: number
    arunamiFeePercent: number
  }
}
```

### 4.4 `portfolios/{id}/reports` subcollection
```
{
  id: string
  type: "pnl" | "projection"
  fileName: string
  fileUrl: string
  period: string
  extractedData: PnLExtractedData | ProjectionExtractedData
  uploadedBy: string (UID)
  createdAt: Timestamp
}
```

**PnLExtractedData:**
```
{
  period, revenue, cogs, grossProfit,
  opex: [{ name, amount }],
  totalOpex, netProfit, transactionCount,
  unitBreakdown: { laptop, service, aksesoris },
  notes: string
}
```

**ProjectionExtractedData:**
```
{
  period, projectedRevenue, projectedCogs, projectedGrossProfit,
  projectedOpex: [{ name, amount }],
  projectedTotalOpex, projectedNetProfit, assumptions: string
}
```

### 4.5 `portfolios/{id}/managementReports` subcollection
```
{
  id: string
  period: string
  businessSummary: string
  issues: [{
    id, title, severity: "high"|"medium"|"low", description
  }]
  actionItems: [{
    id, title, status: "pending"|"in_progress"|"done",
    assignee, dueDate, category: "business"|"operational"|"financial"
  }]
  createdBy: string (UID)
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### 4.6 `portfolios/{id}/notes` subcollection
```
{
  id: string
  content: string
  attachments: [{ id, type, fileName, fileUrl, fileSize }]
  createdBy: string (UID)
  createdAt: Timestamp
}
```

### 4.7 `portfolios/{id}/transferProofs` subcollection
```
{
  id: string
  period: string
  investorUid: string
  investorName: string
  amount: number
  fileUrl: string
  fileName: string
  notes: string
  createdAt: Timestamp
}
```

---

## 5. Key Business Logic

### 5.1 Investor ROI Calculation
```
netProfit = latest month's actual profit
investorShare = netProfit × (investorSharePercent / 100)
arunamiFee = investorShare × (arunamiFeePercent / 100)
netForInvestor = investorShare - arunamiFee
returnPerSlot = netForInvestor / totalSlots
monthlyROI = (returnPerSlot / nominalPerSlot) × 100
annualROI = monthlyROI × 12
```

### 5.2 AI Document Analysis Flow
1. User uploads PDF, Excel (.xlsx), or CSV file (max 10MB)
2. Excel/CSV → parsed to text via SheetJS (xlsx library)
3. PDF → converted to base64
4. Sent to Google Gemini (gemini-1.5-flash) with structured extraction prompt
5. Gemini returns JSON with extracted financial fields
6. User reviews extracted data in a form (can manually correct)
7. On confirm, saved to Firestore as a report document

### 5.3 Formatting
- Currency: Indonesian Rupiah (IDR) — abbreviated (Rp 1.2Jt, Rp 500Rb) and exact formats
- Percentages: with +/- sign
- Month-over-Month: percentage change calculation
- Month names: Indonesian (Januari, Februari, etc.)

---

## 6. UI/UX Design

### 6.1 Theme
- **Brand color:** Forest green (#1e5f3f primary, #38a169 accent)
- **Dark mode supported** via CSS variables
- **Sidebar:** Dark background (#0d1f17) with green highlights
- **Charts:** 5-color green gradient palette

### 6.2 Layout Patterns
- **Login:** Split-screen (brand panel left, form right), mobile hides brand panel
- **Admin:** Sidebar (AdminSidebar component) + main content area
- **Analyst Dashboard:** Sticky top header + portfolio card grid
- **Analyst Portfolio:** Dark sidebar (w-64) with grouped navigation + scrollable main content
- **Investor Dashboard:** Sticky top header + assigned portfolio card grid
- **Investor Portfolio:** Dark sidebar (w-60) with simplified navigation + main content

### 6.3 Analyst Sidebar Navigation Groups
- **Laporan (Reports):** Proyeksi Plan, PnL
- **Analisis Finansial:** Overview, Revenue & Profit, Struktur Biaya, Return Investor
- **Management & Notes:** Management Report, Arunami Notes

### 6.4 Investor Sidebar Navigation
- Overview, Return Saya (My Returns), Download Laporan (Download Report)

### 6.5 Components Used
- shadcn/ui: Button, Card, Dialog, Badge, Input, Label, Textarea, Table, Select, Tabs, Avatar, Skeleton, Tooltip, Sheet, Dropdown Menu
- Recharts: BarChart, RadarChart
- Sonner: Toast notifications
- Lucide: Icons throughout

---

## 7. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.2 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui (base-nova style) | latest |
| State Management | Zustand | 5.0.12 |
| Forms | React Hook Form + Zod | 7.72.0 / 4.3.6 |
| Auth & Database | Firebase (Auth + Firestore + Storage) | 12.11.0 |
| AI | Google Generative AI (Gemini 1.5 Flash) | 0.24.1 |
| Charts | Recharts | 3.8.1 |
| Spreadsheet Parsing | SheetJS (xlsx) | 0.18.5 |
| Icons | Lucide React | 1.7.0 |
| Notifications | Sonner | 2.0.7 |
| Theme | next-themes | 0.4.6 |
| Package Manager | pnpm | — |
| Deployment | Vercel | — |

### 7.1 Environment Variables Required
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
VITE_GEMINI_API_KEY (note: uses VITE_ prefix despite being a Next.js app)
```

---

## 8. Authentication Flow

1. User visits `/` → checked for auth state
2. Not authenticated → redirect to `/login`
3. Login form: email + password validated with Zod
4. Firebase Auth `signInWithEmailAndPassword()`
5. On success: fetch user doc from Firestore `users/{uid}`
6. Redirect to role-specific dashboard (`/admin`, `/analyst`, `/investor`)
7. Auth state managed via React Context (`AuthProvider` at root layout)
8. Each role section wrapped with `AuthGuard` component that checks role

---

## 9. Known Limitations / Future Work

- Investor report download is plain .txt (no PDF generation yet)
- No analyst assignment UI (assignedAnalysts field exists but no UI to manage it)
- Gemini API key uses `VITE_` prefix (should be `NEXT_PUBLIC_` for Next.js)
- Financial data is stored as a single "current" document — no historical versioning
- No real-time updates/subscriptions (data fetched on page load)
- No password reset or profile management UI
- No file storage for uploaded documents (only extracted data is saved)
- Transfer proofs are read-only in the UI (no upload UI for them)
- No pagination on user/portfolio lists
- No search/filter on lists
