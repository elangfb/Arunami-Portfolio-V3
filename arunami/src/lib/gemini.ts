// NOTE: This file is still named `gemini.ts` for import-path compatibility,
// but now uses the Anthropic Claude API. All exported function signatures are
// unchanged so callers (PnLPage, ProjectionsPage, StepUploadDocuments,
// portfolioEnrichment) don't need to change their imports.
import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import type {
  PnLExtractedData, ProjectionExtractedData, PortfolioConfig,
  ClassifiedPnLData, ClassifiedProjectionData, PortfolioSetupExtraction,
  IndustryType, ProjectionUploadPending, PnLUploadPending, MonthlyPnLRow,
} from '@/types'
import { isStandardOpex, isStandardRevenue } from '@/lib/standardVariables'
import { slugifyCategory } from '@/lib/customCategories'
import { normalizePeriod } from '@/lib/dateUtils'

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 32768

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseSpreadsheetToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const texts: string[] = []
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
          if (!csv) continue
          texts.push(`=== Sheet: ${sheetName} ===\n${csv}`)
        }
        if (texts.length === 0) {
          reject(new Error('Spreadsheet kosong atau tidak bisa dibaca'))
          return
        }
        resolve(texts.join('\n\n'))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function buildPnLPrompt(config?: PortfolioConfig): string {
  const categoryFields = config?.revenueCategories
    ? config.revenueCategories.map(c => `"${c.id}": number`).join(', ')
    : '"laptop": number, "service": number, "aksesoris": number'

  return `
Kamu adalah asisten keuangan. Ekstrak data PnL berikut dari dokumen dan kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string format YYYY-MM (contoh: 2024-01 untuk Januari 2024)",
  "revenue": number,
  "cogs": number,
  "grossProfit": number,
  "opex": [{"name": "string", "amount": number}],
  "totalOpex": number,
  "netProfit": number,
  "unitBreakdown": {${categoryFields}},
  "notes": "string"
}
Semua nilai moneter dalam IDR (angka saja, tanpa simbol).
Jika data untuk suatu kategori unit tidak ditemukan, isi dengan 0.
`
}

const PROJECTION_PROMPT = `
Kamu adalah asisten keuangan. Ekstrak data proyeksi keuangan berikut dan kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string format YYYY-MM (contoh: 2024-01 untuk Januari 2024)",
  "projectedRevenue": number,
  "projectedCogs": number,
  "projectedGrossProfit": number,
  "projectedOpex": [{"name": "string", "amount": number}],
  "projectedTotalOpex": number,
  "projectedNetProfit": number,
  "assumptions": "string"
}
Semua nilai moneter dalam IDR (angka saja, tanpa simbol).
`

/** @deprecated Use extractPnLMonthly for the multi-month review flow */
export async function extractPnL(file: File, config?: PortfolioConfig): Promise<PnLExtractedData> {
  const raw = await sendToClaude(file, buildPnLPrompt(config))
  return safeParseJSON<PnLExtractedData>(raw)
}

// ─── Monthly PnL Extraction (Analyst Review) ────────────────────────────

function buildPnLMonthlyPrompt(config?: PortfolioConfig): string {
  const categoryFields = config?.pnlUnitCategories?.length
    ? config.pnlUnitCategories.map(c => `"${c.id}": number`).join(', ')
    : config?.revenueCategories?.length
      ? config.revenueCategories.map(c => `"${c.id}": number`).join(', ')
      : '"laptop": number, "service": number, "aksesoris": number'

  return `
Kamu adalah asisten keuangan. Ekstrak data Profit & Loss (PnL) BULANAN dari dokumen berikut.
Kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string (contoh: Januari 2026 - Maret 2026)",
  "notes": "string",
  "unitBreakdown": {${categoryFields}},
  "monthlyData": [
    {
      "month": "string format YYYY-MM (contoh: 2026-01 untuk Januari 2026)",
      "revenue": number,
      "cogs": number,
      "cogsBreakdown": [{"name": "string", "amount": number}],
      "grossProfit": number,
      "opex": [{"name": "string", "amount": number}],
      "totalOpex": number,
      "operatingProfit": number,
      "interest": number,
      "taxes": number,
      "netProfit": number
    }
  ]
}
ATURAN:
- Sertakan data untuk SETIAP bulan yang ada di dokumen (jangan diringkas/diaggregat)
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
- Gunakan nama opex yang KONSISTEN di semua bulan
- Jika dokumen memecah COGS menjadi komponen (Bahan Baku, Tenaga Kerja Langsung, Overhead Produksi, dll), isi "cogsBreakdown" dengan setiap komponen. Gunakan nama yang KONSISTEN di semua bulan. Sum cogsBreakdown harus sama dengan cogs. Jika tidak ada breakdown di dokumen, kembalikan array kosong.
- grossProfit = revenue - cogs
- operatingProfit = grossProfit - totalOpex
- netProfit = operatingProfit - interest - taxes
- Jika hanya ada data satu bulan, kembalikan monthlyData dengan satu entry saja
- Jika data untuk suatu kategori unit tidak ditemukan, isi dengan 0
`
}

type RawMonthlyPnLRow = MonthlyPnLRow & { cogsBreakdown?: Array<{ name: string; amount: number }> }
type RawPnLUploadPending = Omit<PnLUploadPending, 'monthlyData'> & { monthlyData: RawMonthlyPnLRow[] }

export async function extractPnLMonthly(file: File, config?: PortfolioConfig): Promise<PnLUploadPending> {
  const raw = await sendToClaude(file, buildPnLMonthlyPrompt(config))
  const parsed = safeParseJSON<RawPnLUploadPending>(raw)

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.monthlyData)) {
    throw new Error('Struktur data tidak sesuai — dokumen mungkin tidak berisi laporan laba-rugi bulanan')
  }

  // Normalize opex names across months: collect all unique names, ensure every month has all
  const allOpexNames = [...new Set(parsed.monthlyData.flatMap(m => (m.opex ?? []).map(o => o.name)))]

  // Normalize COGS breakdown names across months the same way, then convert to CustomSubItems
  // with slugified ids. If no month has any breakdown, cogsSubItems stays empty and cogs is
  // kept flat (backward-compatible).
  const allCogsNames = [...new Set(parsed.monthlyData.flatMap(m => (m.cogsBreakdown ?? []).map(o => o.name)))]
  const cogsIdByName: Record<string, string> = {}
  for (const name of allCogsNames) {
    const base = slugifyCategory(name) || `cogs-${Object.keys(cogsIdByName).length + 1}`
    let id = base
    let i = 2
    while (Object.values(cogsIdByName).includes(id)) id = `${base}-${i++}`
    cogsIdByName[name] = id
  }

  const normalizedData: MonthlyPnLRow[] = parsed.monthlyData.map(m => {
    const existingNames = new Set((m.opex ?? []).map(o => o.name))
    const filledOpex = [
      ...(m.opex ?? []),
      ...allOpexNames.filter(n => !existingNames.has(n)).map(n => ({ name: n, amount: 0 })),
    ]

    const existingCogsNames = new Set((m.cogsBreakdown ?? []).map(o => o.name))
    const filledCogs = [
      ...(m.cogsBreakdown ?? []),
      ...allCogsNames.filter(n => !existingCogsNames.has(n)).map(n => ({ name: n, amount: 0 })),
    ]
    const cogsSubItems = filledCogs.map(item => ({
      id: cogsIdByName[item.name],
      name: item.name,
      amount: Number(item.amount) || 0,
    }))

    // Recalculate derived values. If breakdown exists, cogs is forced to the sum so AI drift
    // can't produce inconsistent grossProfit.
    const revenue = Number(m.revenue) || 0
    const cogs = cogsSubItems.length > 0
      ? cogsSubItems.reduce((s, x) => s + x.amount, 0)
      : Number(m.cogs) || 0
    const totalOpex = filledOpex.reduce((s, o) => s + (Number(o.amount) || 0), 0)
    const interest = Number(m.interest) || 0
    const taxes = Number(m.taxes) || 0
    const grossProfit = revenue - cogs
    const operatingProfit = grossProfit - totalOpex
    const netProfit = operatingProfit - interest - taxes

    const { cogsBreakdown: _drop, ...rest } = m
    void _drop
    return {
      ...rest,
      revenue, cogs, grossProfit,
      opex: filledOpex, totalOpex, operatingProfit,
      interest, taxes, netProfit,
      ...(cogsSubItems.length > 0 ? { cogsSubItems } : {}),
    }
  })

  return { ...parsed, monthlyData: normalizedData, status: 'pending_review' }
}

// ─── Portfolio Setup Extraction (with classification) ────────────────────

const SETUP_PNL_PROMPT = `
Kamu adalah asisten keuangan untuk platform manajemen portofolio investasi Indonesia.

Analisis dokumen keuangan ini dan kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string format YYYY-MM (contoh: 2024-01 untuk Januari 2024)",
  "revenue": number,
  "cogs": number,
  "grossProfit": number,
  "opex": [{"name": "string", "amount": number, "isStandard": boolean}],
  "totalOpex": number,
  "operatingProfit": number,
  "interest": number,
  "taxes": number,
  "netProfit": number,
  "revenueBreakdown": [{"name": "string", "amount": number, "unitCount": number, "isStandard": boolean}],
  "notes": "string"
}

ATURAN KLASIFIKASI isStandard:
- Opex STANDAR (isStandard: true): Gaji/Salary, Sewa/Rent, Utilitas/Utilities, Listrik, Air, Internet, Marketing/Iklan, Transportasi, Perlengkapan/ATK, Asuransi, Depresiasi/Penyusutan, Pajak, Administrasi, Maintenance/Perawatan
- Opex yang TIDAK cocok dengan daftar di atas → isStandard: false
- Revenue breakdown: jika ada kategori produk/layanan spesifik, ekstrak masing-masing. Kategori umum (Penjualan, Sales) → isStandard: true. Kategori spesifik/unik → isStandard: false
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
- Jika data tidak ditemukan, isi dengan 0
`

const SETUP_PROJECTION_PROMPT = `
Kamu adalah asisten keuangan untuk platform manajemen portofolio investasi Indonesia.

Analisis dokumen proyeksi keuangan ini dan kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string format YYYY-MM dari bulan PERTAMA proyeksi (contoh: 2024-01 untuk Januari 2024)",
  "assumptions": "string",
  "cogsPercent": number,
  "monthlyData": [
    {
      "month": "YYYY-MM",
      "projectedRevenue": number,
      "projectedCogs": number,
      "projectedGrossProfit": number,
      "opexBreakdown": [{"name": "string", "amount": number, "isStandard": boolean}],
      "totalOpex": number,
      "projectedNetProfit": number
    }
  ]
}

ATURAN PENTING:
- Ekstrak SEMUA bulan yang ada di dokumen. Setiap bulan menjadi satu entry di "monthlyData"
- "month" format YYYY-MM (contoh: "2026-01" untuk Januari 2026)
- "period" adalah bulan PERTAMA dari proyeksi
- cogsPercent: hitung sebagai rata-rata (projectedCogs / projectedRevenue * 100) dari semua bulan, bulatkan 1 desimal. Jika COGS tidak ada, isi 0
- Per bulan: projectedGrossProfit = projectedRevenue - projectedCogs
- Per bulan: projectedNetProfit = projectedGrossProfit - totalOpex
- Jika dokumen hanya berisi data tahunan/total tanpa breakdown bulanan, buat satu entry saja
- assumptions: ambil dari bagian asumsi/catatan di dokumen, atau tulis ringkasan singkat jika tidak ada
- Pastikan semua bulan memiliki opexBreakdown yang KONSISTEN (nama item yang sama di setiap bulan)

ATURAN KLASIFIKASI isStandard:
- Opex STANDAR (isStandard: true): Gaji/Salary, Sewa/Rent, Utilitas/Utilities, Listrik, Air, Internet, Marketing/Iklan, Transportasi, Perlengkapan/ATK, Asuransi, Depresiasi/Penyusutan, Pajak, Administrasi, Maintenance/Perawatan
- Opex yang TIDAK cocok dengan daftar di atas → isStandard: false
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
`

/**
 * Scan `raw` for the first JSON value (object or array) and return its exact
 * slice. Walks the string with a depth counter that respects string literals
 * and backslash escapes so braces inside quoted strings don't throw it off.
 * Returns null when no balanced JSON value is found.
 */
function extractBalancedJson(raw: string): string | null {
  const firstObj = raw.indexOf('{')
  const firstArr = raw.indexOf('[')
  const start =
    firstObj === -1 ? firstArr :
    firstArr === -1 ? firstObj :
    Math.min(firstObj, firstArr)
  if (start === -1) return null

  const open = raw[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (escaped) { escaped = false; continue }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

/** Apply cheap repairs for common LLM-produced JSON defects. */
function repairJson(s: string): string {
  let fixed = s.replace(/,\s*([}\]])/g, '$1') // trailing commas
  fixed = fixed.replace(/(?<=:\s*"[^"]*)\n/g, '\\n') // unescaped newlines inside strings
  return fixed
}

/**
 * Parse Claude's response as JSON, tolerating prose wrappers and minor
 * malformations. Order of attempts:
 *   1. Parse the raw string as-is (fast path).
 *   2. Extract the first balanced {...} or [...] block and parse that —
 *      recovers from leading prose ("I need to..."), trailing prose, stray
 *      fences, and language tags.
 *   3. Apply trailing-comma / unescaped-newline repairs to the extracted
 *      slice (or the raw string if no slice found) and parse again.
 * On total failure, throw an Error whose message includes a preview of the
 * response so the UI can surface it to the user.
 */
function safeParseJSON<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch { /* fall through */ }

  const sliced = extractBalancedJson(raw)
  if (sliced) {
    try { return JSON.parse(sliced) as T } catch { /* fall through */ }
    try { return JSON.parse(repairJson(sliced)) as T } catch { /* fall through */ }
  } else {
    try { return JSON.parse(repairJson(raw)) as T } catch { /* fall through */ }
  }

  const preview = raw.trim().slice(0, 200).replace(/\s+/g, ' ')
  console.error('AI response that failed to parse:', raw.slice(0, 500))
  throw new Error(`AI tidak mengembalikan JSON valid. Cuplikan respons: "${preview}"`)
}

/**
 * Core helper: sends a file + prompt to Claude and returns the raw JSON string.
 * Handles both PDF (document content block) and spreadsheet (parsed to text).
 * The prompt is split so the static instruction portion is sent as a cached
 * system message — ~90% cheaper on repeat uploads.
 */
async function sendToClaude(file: File, prompt: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  // Build the user content blocks: file payload + a tiny nudge.
  const userContent: Anthropic.Messages.ContentBlockParam[] = []

  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64,
      },
    })
  } else {
    const text = await parseSpreadsheetToText(file)
    userContent.push({
      type: 'text',
      text: `Dokumen (CSV/spreadsheet):\n\n${text}`,
    })
  }
  userContent.push({
    type: 'text',
    text: 'Ekstrak sekarang dan balas HANYA dengan JSON valid sesuai skema di instruksi. Jangan menyertakan markdown fence atau penjelasan.',
  })

  // Streaming is required by the SDK whenever max_tokens is high enough that a
  // non-streaming call could exceed the 10-minute safety cap. Using stream()
  // + finalMessage() keeps the same return shape while lifting that limit.
  //
  // Prefilling the assistant turn with "{" forces Claude's completion to begin
  // as a JSON object — it cannot emit a prose preamble like "I need to analyze
  // this document..." before the data. The prefill character is NOT included
  // in the returned text, so we prepend it back before parsing.
  const response = await withRetry(() =>
    anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: prompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    }).finalMessage(),
  )

  const first = response.content[0]
  if (!first || first.type !== 'text') {
    throw new Error('Claude response did not contain text content')
  }
  // Re-attach the prefilled "{" and strip any stray closing fence Claude may
  // have emitted at the end. safeParseJSON handles any residual prose.
  return ('{' + first.text).replace(/```json|```/g, '').trim()
}

/**
 * Retry transient failures (5xx, 429, network) up to 3 times with backoff.
 * Does NOT retry on 4xx client errors (bad key, malformed request).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  const delays = [500, 1500, 4000]
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = (err as { status?: number })?.status
      const retriable = status === undefined || status >= 500 || status === 429
      if (!retriable || i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, delays[i]))
    }
  }
  throw lastErr
}

/** Ensure all numeric fields are valid numbers (replace NaN/undefined with 0) */
function sanitizeNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function sanitizeProjection(raw: ClassifiedProjectionData): ClassifiedProjectionData {
  const cogsPercent = sanitizeNumber(raw.cogsPercent)

  const monthlyData = (raw.monthlyData ?? []).map(m => {
    const projectedRevenue = sanitizeNumber(m.projectedRevenue)
    let projectedCogs = sanitizeNumber(m.projectedCogs)
    // Recalculate COGS from percentage if available
    if (cogsPercent > 0 && projectedRevenue > 0) {
      projectedCogs = Math.round(projectedRevenue * cogsPercent / 100)
    }
    const projectedGrossProfit = projectedRevenue - projectedCogs
    const opexBreakdown = (m.opexBreakdown ?? []).map(o => ({
      ...o,
      amount: sanitizeNumber(o.amount),
    }))
    const totalOpex = opexBreakdown.reduce((s, o) => s + o.amount, 0)

    return {
      month: m.month || '',
      projectedRevenue,
      projectedCogs,
      projectedGrossProfit,
      opexBreakdown,
      totalOpex,
      projectedNetProfit: projectedGrossProfit - totalOpex,
    }
  })

  // Derive cogsPercent from actual values if not provided
  let finalCogsPercent = cogsPercent
  if (finalCogsPercent === 0 && monthlyData.length > 0) {
    const totalRevenue = monthlyData.reduce((s, m) => s + m.projectedRevenue, 0)
    const totalCogs = monthlyData.reduce((s, m) => s + m.projectedCogs, 0)
    if (totalRevenue > 0 && totalCogs > 0) {
      finalCogsPercent = Math.round((totalCogs / totalRevenue) * 100 * 10) / 10
    }
  }

  return {
    period: raw.period || '',
    assumptions: raw.assumptions || '',
    cogsPercent: finalCogsPercent,
    monthlyData,
  }
}

function sanitizePnl(raw: ClassifiedPnLData): ClassifiedPnLData {
  return {
    ...raw,
    revenue: sanitizeNumber(raw.revenue),
    cogs: sanitizeNumber(raw.cogs),
    grossProfit: sanitizeNumber(raw.grossProfit),
    totalOpex: sanitizeNumber(raw.totalOpex),
    operatingProfit: sanitizeNumber(raw.operatingProfit),
    interest: sanitizeNumber(raw.interest),
    taxes: sanitizeNumber(raw.taxes),
    netProfit: sanitizeNumber(raw.netProfit),
    opex: (raw.opex ?? []).map(o => ({ ...o, amount: sanitizeNumber(o.amount) })),
    revenueBreakdown: (raw.revenueBreakdown ?? []).map(r => ({
      ...r,
      amount: sanitizeNumber(r.amount),
      unitCount: sanitizeNumber(r.unitCount),
    })),
    notes: raw.notes || '',
  }
}

export interface ExtractionErrors {
  pnl?: string
  projection?: string
}

export async function extractPortfolioSetup(
  pnlFile: File | null,
  projectionFile: File | null,
  industryType?: IndustryType,
  onStage?: (stage: string) => void,
): Promise<PortfolioSetupExtraction & { errors: ExtractionErrors }> {
  let pnl: ClassifiedPnLData | null = null
  let projection: ClassifiedProjectionData | null = null
  const errors: ExtractionErrors = {}

  // Extract both files in parallel
  const pnlPromise = pnlFile
    ? (async () => {
        onStage?.('reading_pnl')
        const raw = await sendToClaude(pnlFile, SETUP_PNL_PROMPT)
        onStage?.('extracting_pnl')
        return safeParseJSON<ClassifiedPnLData>(raw)
      })()
    : Promise.resolve(null)

  const projPromise = projectionFile
    ? (async () => {
        onStage?.('reading_projection')
        const raw = await sendToClaude(projectionFile, SETUP_PROJECTION_PROMPT)
        onStage?.('extracting_projection')
        return safeParseJSON<ClassifiedProjectionData>(raw)
      })()
    : Promise.resolve(null)

  const [pnlResult, projResult] = await Promise.allSettled([pnlPromise, projPromise])

  // Process PnL result
  if (pnlResult.status === 'fulfilled' && pnlResult.value) {
    pnl = sanitizePnl(pnlResult.value)
    pnl.opex = pnl.opex.map(item => ({
      ...item,
      isStandard: item.isStandard ?? isStandardOpex(item.name, industryType),
    }))
    pnl.revenueBreakdown = (pnl.revenueBreakdown ?? []).map(item => ({
      ...item,
      isStandard: item.isStandard ?? isStandardRevenue(item.name, industryType),
    }))
  } else if (pnlResult.status === 'rejected') {
    console.error('PnL extraction failed:', pnlResult.reason)
    errors.pnl = `Gagal mengekstrak PnL: ${pnlResult.reason?.message || 'Unknown error'}`
  }

  // Process Projection result
  if (projResult.status === 'fulfilled' && projResult.value) {
    projection = sanitizeProjection(projResult.value)
    projection.monthlyData = projection.monthlyData.map(m => ({
      ...m,
      opexBreakdown: m.opexBreakdown.map(item => ({
        ...item,
        isStandard: item.isStandard ?? isStandardOpex(item.name, industryType),
      })),
    }))
  } else if (projResult.status === 'rejected') {
    console.error('Projection extraction failed:', projResult.reason)
    errors.projection = `Gagal mengekstrak Proyeksi: ${projResult.reason?.message || 'Unknown error'}`
  }

  onStage?.('classifying')

  // Build discovered variables from non-standard items
  const projOpexSeen = new Set<string>()
  const projDiscovered: { name: string; category: 'opex'; value: number; description: string; included: boolean }[] = []
  if (projection) {
    for (const m of projection.monthlyData) {
      for (const o of m.opexBreakdown) {
        if (!o.isStandard && !projOpexSeen.has(o.name)) {
          projOpexSeen.add(o.name)
          projDiscovered.push({
            name: o.name,
            category: 'opex' as const,
            value: o.amount,
            description: `Item opex ditemukan dari dokumen proyeksi`,
            included: true,
          })
        }
      }
    }
  }

  const discoveredVariables = [
    ...(pnl?.opex.filter(o => !o.isStandard).map(o => ({
      name: o.name,
      category: 'opex' as const,
      value: o.amount,
      description: `Item opex ditemukan dari dokumen PnL`,
      included: true,
    })) ?? []),
    ...(pnl?.revenueBreakdown.filter(r => !r.isStandard).map(r => ({
      name: r.name,
      category: 'revenue' as const,
      value: r.amount,
      description: `Kategori pendapatan ditemukan dari dokumen PnL`,
      included: true,
    })) ?? []),
    ...projDiscovered,
  ]

  // Suggest KPIs from extracted data
  const suggestedKpis = []
  if (pnl) {
    suggestedKpis.push(
      { name: 'Revenue', value: pnl.revenue, unit: 'currency' as const, derivedFrom: 'PnL' },
      { name: 'Net Profit', value: pnl.netProfit, unit: 'currency' as const, derivedFrom: 'PnL' },
    )
    if (pnl.revenue > 0) {
      suggestedKpis.push({
        name: 'Gross Margin %',
        value: Math.round((pnl.grossProfit / pnl.revenue) * 100 * 10) / 10,
        unit: 'percentage' as const,
        derivedFrom: 'grossProfit / revenue',
      })
      suggestedKpis.push({
        name: 'Efisiensi %',
        value: Math.round((pnl.netProfit / pnl.revenue) * 100 * 10) / 10,
        unit: 'percentage' as const,
        derivedFrom: 'netProfit / revenue',
      })
    }
  }

  return { pnl, projection, discoveredVariables, suggestedKpis, errors }
}

// ─── Monthly Projection Extraction (Analyst Review) ────────────────────

const PROJECTION_MONTHLY_PROMPT = `
Kamu adalah asisten keuangan. Ekstrak data proyeksi keuangan BULANAN dari dokumen berikut.
Kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string (contoh: April 2026 - Maret 2027)",
  "assumptions": "string",
  "cogsPercent": number,
  "monthlyData": [
    {
      "month": "string format YYYY-MM (contoh: 2026-04 untuk April 2026)",
      "projectedRevenue": number,
      "projectedCogs": number,
      "projectedGrossProfit": number,
      "opexBreakdown": [{"name": "string", "amount": number}],
      "totalOpex": number,
      "projectedDepreciationAmortization": number,
      "projectedTax": number,
      "projectedNetProfit": number
    }
  ]
}
ATURAN:
- Sertakan data untuk SETIAP bulan yang ada di dokumen (jangan diringkas/diaggregat)
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
- cogsPercent = rata-rata persentase COGS terhadap revenue dari seluruh bulan
- Jika hanya ada data tahunan/total tanpa breakdown bulanan, buat satu entry saja
- "month" HARUS format YYYY-MM yang valid berdasarkan tanggal kalender (contoh: "2026-04"). JANGAN gunakan label seperti "Month-1", "Month 2", atau "Bulan ke-1". Jika dokumen menggunakan label numerik, konversi ke bulan kalender aktual berdasarkan periode proyeksi yang ada di dokumen.
- "projectedDepreciationAmortization": nilai Depresiasi/Amortisasi (Depreciation & Amortization / D&A / Penyusutan). JANGAN masukkan item ini ke dalam "opexBreakdown". Jika tidak ada, isi 0.
- "projectedTax": nilai Pajak/Tax. JANGAN masukkan item ini ke dalam "opexBreakdown". Jika tidak ada, isi 0.
- projectedNetProfit = projectedGrossProfit - totalOpex - projectedDepreciationAmortization - projectedTax
`

export async function extractProjectionMonthly(file: File): Promise<ProjectionUploadPending> {
  const raw = await sendToClaude(file, PROJECTION_MONTHLY_PROMPT)
  const parsed = safeParseJSON<ProjectionUploadPending>(raw)
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.monthlyData)) {
    throw new Error('Struktur data tidak sesuai — dokumen mungkin tidak berisi proyeksi bulanan')
  }
  // Normalize proper month names (e.g. "April 2026" → "2026-04").
  // Month-N labels are left as-is so the caller can show a start-month dialog.
  const monthlyData = (parsed.monthlyData ?? []).map((row) => ({
    ...row,
    month: normalizePeriod(row.month),
    projectedDepreciationAmortization: Number(row.projectedDepreciationAmortization) || 0,
    projectedTax: Number(row.projectedTax) || 0,
  }))
  return { ...parsed, monthlyData, status: 'pending_review' }
}

// ─── Legacy extraction functions (used by analyst pages) ─────────────────

export async function extractProjection(file: File): Promise<ProjectionExtractedData> {
  const raw = await sendToClaude(file, PROJECTION_PROMPT)
  return safeParseJSON<ProjectionExtractedData>(raw)
}

// ─── AI-generated Management Report ──────────────────────────────────────

export interface GeneratedManagementReport {
  businessSummary: string
}

const TONE_GUIDELINES = `
NADA & PEMILIHAN KATA (WAJIB):
- Gunakan nada NETRAL dan objektif. Biarkan angka berbicara sendiri — jangan menambahkan penilaian emosional.
- JANGAN gunakan kata-kata yang melebih-lebihkan (intensifier) atau bermuatan emosi, seperti:
  "signifikan", "sangat", "luar biasa", "mengesankan", "gemilang", "kuat", "lemah", "buruk",
  "mengecewakan", "mengkhawatirkan", "drastis", "tajam", "meroket", "anjlok", "pesat", "dramatis",
  "jauh", "sungguh", "benar-benar".
- Lebih baik sebutkan besaran/persentase aktual (mis. "lebih tinggi 12% dari proyeksi") daripada
  label kualitatif ("jauh di atas proyeksi" atau "kenaikan signifikan").
- Gunakan kata kerja netral: "naik", "turun", "di atas", "di bawah", "selisih", "sesuai",
  "melampaui", "belum mencapai" — tanpa tambahan intensifier.
- Tujuannya agar investor membaca laporan secara objektif tanpa digiring ke kesimpulan tertentu.
`.trim()

const MGMT_REPORT_SYSTEM = `
Kamu adalah seorang financial analyst senior yang membuat laporan manajemen bulanan untuk investor di Indonesia.

Tugasmu: menganalisis data PnL aktual vs proyeksi untuk satu bulan, lalu menghasilkan satu business summary dalam Bahasa Indonesia.

**businessSummary** — narasi 2-4 kalimat yang menjelaskan kinerja bulan ini secara keseluruhan. Sebutkan angka revenue, net profit, dan variance utama vs proyeksi. Sebutkan juga driver utama (margin, opex, dsb.) bila relevan. Nada profesional namun mudah dipahami investor non-teknis.

PENTING:
- Gunakan Bahasa Indonesia formal namun tidak kaku
- Jangan gunakan markdown atau formatting lain di dalam string
- Angka selalu dalam IDR (tanpa simbol Rp, tanpa titik ribuan di dalam string, cukup sebut "Rp 48 juta" atau "Rp 48jt")
- Fokus hanya pada summary — jangan buat daftar isu atau action items (user akan menuliskan sendiri)

${TONE_GUIDELINES}
`.trim()

const REFINE_SUMMARY_SYSTEM = `
Kamu adalah editor bahasa untuk laporan manajemen investor di Indonesia.

Tugasmu: menulis ulang draf business summary yang diberikan analyst agar nada dan gaya bahasanya KONSISTEN dengan standar laporan lain. Bukan mengganti isi/opini, bukan menambah analisis baru — hanya menyelaraskan bahasa.

ATURAN REFINE:
- Pertahankan MAKNA, FAKTA, dan ANGKA persis seperti di draf. Jangan menambah angka, variance, atau klaim baru yang tidak ada di draf.
- Boleh memperbaiki struktur kalimat, susunan, tanda baca, dan pilihan kata.
- Hasil akhir: narasi Bahasa Indonesia formal tapi tidak kaku, 2-4 kalimat, tanpa markdown/bullet/formatting.
- Jika draf menyebut angka dalam format aneh ("Rp48.000.000"), boleh normalisasi menjadi "Rp 48 juta" atau "Rp 48jt".
- Jika draf kosong atau tidak bermakna, kembalikan string kosong di "refinedSummary".
- Data periode (PnL aktual & proyeksi) diberikan HANYA sebagai konteks untuk memastikan kamu tidak merusak fakta. Jangan menulis fakta baru dari data tersebut.

${TONE_GUIDELINES}
`.trim()

const REFINE_SUMMARY_SCHEMA = `
Kembalikan HANYA JSON valid dengan struktur berikut (tanpa penjelasan tambahan, tanpa markdown fence):
{
  "refinedSummary": "string"
}
`.trim()

const MGMT_REPORT_SCHEMA = `
Kembalikan HANYA JSON valid dengan struktur berikut (tanpa penjelasan tambahan, tanpa markdown fence):
{
  "businessSummary": "string"
}
`.trim()

interface GenerateArgs {
  period: string // YYYY-MM
  pnl: PnLExtractedData
  projection?: ProjectionExtractedData | null
  previousPnl?: PnLExtractedData | null
  portfolioName?: string
  arunamiNotes?: string[]
}

/**
 * Generate an investor-ready management report in Bahasa Indonesia using
 * Claude. Analyzes actual P&L vs projection for the given period and produces
 * business summary, detected issues, and recommended action items.
 */
export async function generateManagementReport(args: GenerateArgs): Promise<GeneratedManagementReport> {
  const { period, pnl, projection, previousPnl, portfolioName, arunamiNotes } = args

  // Build a compact data snapshot that Claude reasons over.
  const lines: string[] = []
  lines.push(`PORTOFOLIO: ${portfolioName ?? '(tidak diketahui)'}`)
  lines.push(`PERIODE: ${period}`)
  lines.push('')
  lines.push('═══ PnL AKTUAL BULAN INI ═══')
  lines.push(`Revenue: ${pnl.revenue}`)
  lines.push(`COGS: ${pnl.cogs}`)
  lines.push(`Gross Profit: ${pnl.grossProfit}`)
  lines.push(`Total Opex: ${pnl.totalOpex}`)
  lines.push(`Operating Profit: ${pnl.operatingProfit}`)
  lines.push(`Interest: ${pnl.interest}`)
  lines.push(`Taxes: ${pnl.taxes}`)
  lines.push(`Net Profit: ${pnl.netProfit}`)
  if (pnl.opex?.length) {
    lines.push('Detail Opex:')
    for (const o of pnl.opex) lines.push(`  - ${o.name}: ${o.amount}`)
  }
  if (pnl.notes) lines.push(`Catatan PnL: ${pnl.notes}`)
  lines.push('')

  if (projection) {
    lines.push('═══ PROYEKSI UNTUK BULAN INI ═══')
    lines.push(`Projected Revenue: ${projection.projectedRevenue}`)
    lines.push(`Projected COGS: ${projection.projectedCogs}`)
    lines.push(`Projected Gross Profit: ${projection.projectedGrossProfit}`)
    lines.push(`Projected Total Opex: ${projection.projectedTotalOpex}`)
    lines.push(`Projected Net Profit: ${projection.projectedNetProfit}`)
    if (projection.projectedOpex?.length) {
      lines.push('Detail Projected Opex:')
      for (const o of projection.projectedOpex) lines.push(`  - ${o.name}: ${o.amount}`)
    }
    if (projection.assumptions) lines.push(`Asumsi Proyeksi: ${projection.assumptions}`)
    lines.push('')
  } else {
    lines.push('═══ PROYEKSI: tidak tersedia untuk bulan ini ═══')
    lines.push('')
  }

  if (previousPnl) {
    lines.push('═══ PnL BULAN SEBELUMNYA (untuk konteks MoM) ═══')
    lines.push(`Revenue: ${previousPnl.revenue}`)
    lines.push(`Net Profit: ${previousPnl.netProfit}`)
    lines.push(`Total Opex: ${previousPnl.totalOpex}`)
    lines.push('')
  }

  if (arunamiNotes?.length) {
    lines.push('═══ ARUNAMI NOTES (konteks kualitatif dari analyst) ═══')
    for (const n of arunamiNotes) lines.push(`- ${n}`)
    lines.push('')
  }

  lines.push(MGMT_REPORT_SCHEMA)

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: MGMT_REPORT_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: lines.join('\n') }],
        },
      ],
    }),
  )

  const first = response.content[0]
  if (!first || first.type !== 'text') {
    throw new Error('Claude response did not contain text content')
  }
  const raw = first.text.replace(/```json|```/g, '').trim()
  return safeParseJSON<GeneratedManagementReport>(raw)
}

// ─── Refine Business Summary (analyst-drafted text) ─────────────────────

export interface RefinedSummary {
  refinedSummary: string
}

interface RefineArgs {
  draft: string
  period: string // YYYY-MM
  pnl?: PnLExtractedData | null
  projection?: ProjectionExtractedData | null
  portfolioName?: string
}

/**
 * Rewrite an analyst-drafted business summary so its tone matches the rest of
 * the report suite (neutral, no intensifiers). Facts and numbers in the draft
 * are preserved; period data is passed as context so the model avoids
 * introducing new claims.
 */
export async function refineBusinessSummary(args: RefineArgs): Promise<RefinedSummary> {
  const { draft, period, pnl, projection, portfolioName } = args

  const lines: string[] = []
  lines.push(`PORTOFOLIO: ${portfolioName ?? '(tidak diketahui)'}`)
  lines.push(`PERIODE: ${period}`)
  lines.push('')
  lines.push('═══ DRAF ANALYST (ini yang harus direfine) ═══')
  lines.push(draft)
  lines.push('')

  if (pnl) {
    lines.push('═══ KONTEKS — PnL AKTUAL BULAN INI ═══')
    lines.push(`Revenue: ${pnl.revenue}`)
    lines.push(`COGS: ${pnl.cogs}`)
    lines.push(`Gross Profit: ${pnl.grossProfit}`)
    lines.push(`Total Opex: ${pnl.totalOpex}`)
    lines.push(`Net Profit: ${pnl.netProfit}`)
    lines.push('')
  }

  if (projection) {
    lines.push('═══ KONTEKS — PROYEKSI UNTUK BULAN INI ═══')
    lines.push(`Projected Revenue: ${projection.projectedRevenue}`)
    lines.push(`Projected Net Profit: ${projection.projectedNetProfit}`)
    lines.push(`Projected Total Opex: ${projection.projectedTotalOpex}`)
    lines.push('')
  }

  lines.push(REFINE_SUMMARY_SCHEMA)

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: REFINE_SUMMARY_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: lines.join('\n') }],
        },
      ],
    }),
  )

  const first = response.content[0]
  if (!first || first.type !== 'text') {
    throw new Error('Claude response did not contain text content')
  }
  const raw = first.text.replace(/```json|```/g, '').trim()
  return safeParseJSON<RefinedSummary>(raw)
}
