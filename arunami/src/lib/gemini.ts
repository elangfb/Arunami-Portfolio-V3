import { GoogleGenerativeAI } from '@google/generative-ai'
import * as XLSX from 'xlsx'
import type {
  PnLExtractedData, ProjectionExtractedData, PortfolioConfig,
  ClassifiedPnLData, ClassifiedProjectionData, PortfolioSetupExtraction,
  IndustryType, ProjectionUploadPending,
} from '@/types'
import { isStandardOpex, isStandardRevenue } from '@/lib/standardVariables'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

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
          texts.push(`=== Sheet: ${sheetName} ===\n${XLSX.utils.sheet_to_csv(sheet)}`)
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
  "transactionCount": number,
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

export async function extractPnL(file: File, config?: PortfolioConfig): Promise<PnLExtractedData> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
  const ext = file.name.split('.').pop()?.toLowerCase()
  const prompt = buildPnLPrompt(config)

  let result
  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
    ])
  } else {
    const text = await parseSpreadsheetToText(file)
    result = await model.generateContent([prompt, text])
  }

  const raw = result.response.text().replace(/```json|```/g, '').trim()
  return safeParseJSON<PnLExtractedData>(raw)
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
  "transactionCount": number,
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

/** Try JSON.parse with fallback repairs for common LLM output issues */
function safeParseJSON<T>(raw: string): T {
  try {
    return JSON.parse(raw)
  } catch {
    // Fix trailing commas before } or ]
    let fixed = raw.replace(/,\s*([}\]])/g, '$1')
    // Fix unescaped newlines inside string values
    fixed = fixed.replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
    try {
      return JSON.parse(fixed)
    } catch (e) {
      console.error('Raw Gemini response that failed to parse:', raw.slice(0, 500))
      throw e
    }
  }
}

async function sendToGemini(file: File, prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
  const ext = file.name.split('.').pop()?.toLowerCase()

  let result
  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
    ])
  } else {
    const text = await parseSpreadsheetToText(file)
    result = await model.generateContent([prompt, text])
  }

  return result.response.text().replace(/```json|```/g, '').trim()
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
    transactionCount: sanitizeNumber(raw.transactionCount),
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
        const raw = await sendToGemini(pnlFile, SETUP_PNL_PROMPT)
        onStage?.('extracting_pnl')
        return safeParseJSON<ClassifiedPnLData>(raw)
      })()
    : Promise.resolve(null)

  const projPromise = projectionFile
    ? (async () => {
        onStage?.('reading_projection')
        const raw = await sendToGemini(projectionFile, SETUP_PROJECTION_PROMPT)
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
    if (pnl.transactionCount > 0) {
      suggestedKpis.push({
        name: 'Jumlah Transaksi',
        value: pnl.transactionCount,
        unit: 'count' as const,
        derivedFrom: 'PnL transactionCount',
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
      "projectedNetProfit": number
    }
  ]
}
ATURAN:
- Sertakan data untuk SETIAP bulan yang ada di dokumen (jangan diringkas/diaggregat)
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
- cogsPercent = rata-rata persentase COGS terhadap revenue dari seluruh bulan
- Jika hanya ada data tahunan/total tanpa breakdown bulanan, buat satu entry saja
`

export async function extractProjectionMonthly(file: File): Promise<ProjectionUploadPending> {
  const raw = await sendToGemini(file, PROJECTION_MONTHLY_PROMPT)
  const parsed = safeParseJSON<ProjectionUploadPending>(raw)
  return { ...parsed, status: 'pending_review' }
}

// ─── Legacy extraction functions (used by analyst pages) ─────────────────

export async function extractProjection(file: File): Promise<ProjectionExtractedData> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
  const ext = file.name.split('.').pop()?.toLowerCase()

  let result
  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    result = await model.generateContent([
      PROJECTION_PROMPT,
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
    ])
  } else {
    const text = await parseSpreadsheetToText(file)
    result = await model.generateContent([PROJECTION_PROMPT, text])
  }

  const raw = result.response.text().replace(/```json|```/g, '').trim()
  return safeParseJSON<ProjectionExtractedData>(raw)
}
