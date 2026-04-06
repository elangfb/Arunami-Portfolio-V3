import { GoogleGenerativeAI } from '@google/generative-ai'
import * as XLSX from 'xlsx'
import type {
  PnLExtractedData, ProjectionExtractedData, PortfolioConfig,
  ClassifiedPnLData, ClassifiedProjectionData, PortfolioSetupExtraction,
  IndustryType,
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
  "period": "string (contoh: Januari 2024)",
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
  "period": "string",
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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
  return JSON.parse(raw) as PnLExtractedData
}

// ─── Portfolio Setup Extraction (with classification) ────────────────────

const SETUP_PNL_PROMPT = `
Kamu adalah asisten keuangan untuk platform manajemen portofolio investasi Indonesia.

Analisis dokumen keuangan ini dan kembalikan HANYA JSON valid (tanpa penjelasan lain) dengan struktur:
{
  "period": "string (contoh: Januari 2024)",
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
  "period": "string",
  "projectedRevenue": number,
  "projectedCogsPercent": number,
  "projectedCogs": number,
  "projectedGrossProfit": number,
  "projectedOpex": [{"name": "string", "amount": number, "isStandard": boolean}],
  "projectedTotalOpex": number,
  "projectedNetProfit": number,
  "assumptions": "string"
}

ATURAN KLASIFIKASI isStandard:
- Opex STANDAR (isStandard: true): Gaji/Salary, Sewa/Rent, Utilitas/Utilities, Listrik, Air, Internet, Marketing/Iklan, Transportasi, Perlengkapan/ATK, Asuransi, Depresiasi/Penyusutan, Pajak, Administrasi, Maintenance/Perawatan
- Opex yang TIDAK cocok dengan daftar di atas → isStandard: false
- Semua nilai moneter dalam IDR (angka saja, tanpa simbol Rp atau titik ribuan)
`

async function sendToGemini(file: File, prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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

export async function extractPortfolioSetup(
  pnlFile: File | null,
  projectionFile: File | null,
  industryType?: IndustryType,
): Promise<PortfolioSetupExtraction> {
  let pnl: ClassifiedPnLData | null = null
  let projection: ClassifiedProjectionData | null = null

  if (pnlFile) {
    const raw = await sendToGemini(pnlFile, SETUP_PNL_PROMPT)
    pnl = JSON.parse(raw) as ClassifiedPnLData

    // Client-side fallback classification
    pnl.opex = pnl.opex.map(item => ({
      ...item,
      isStandard: item.isStandard ?? isStandardOpex(item.name, industryType),
    }))
    pnl.revenueBreakdown = (pnl.revenueBreakdown ?? []).map(item => ({
      ...item,
      isStandard: item.isStandard ?? isStandardRevenue(item.name, industryType),
    }))
  }

  if (projectionFile) {
    const raw = await sendToGemini(projectionFile, SETUP_PROJECTION_PROMPT)
    projection = JSON.parse(raw) as ClassifiedProjectionData

    projection.projectedOpex = (projection.projectedOpex ?? []).map(item => ({
      ...item,
      isStandard: item.isStandard ?? isStandardOpex(item.name, industryType),
    }))
  }

  // Build discovered variables from non-standard items
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
    ...(projection?.projectedOpex.filter(o => !o.isStandard).map(o => ({
      name: o.name,
      category: 'opex' as const,
      value: o.amount,
      description: `Item opex ditemukan dari dokumen proyeksi`,
      included: true,
    })) ?? []),
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

  return { pnl, projection, discoveredVariables, suggestedKpis }
}

// ─── Legacy extraction functions (used by analyst pages) ─────────────────

export async function extractProjection(file: File): Promise<ProjectionExtractedData> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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
  return JSON.parse(raw) as ProjectionExtractedData
}
