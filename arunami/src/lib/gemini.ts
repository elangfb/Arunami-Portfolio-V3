import { GoogleGenerativeAI } from '@google/generative-ai'
import * as XLSX from 'xlsx'
import type { PnLExtractedData, ProjectionExtractedData } from '@/types'

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

const PNL_PROMPT = `
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
  "unitBreakdown": {"laptop": number, "service": number, "aksesoris": number},
  "notes": "string"
}
Semua nilai moneter dalam IDR (angka saja, tanpa simbol).
`

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

export async function extractPnL(file: File): Promise<PnLExtractedData> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const ext = file.name.split('.').pop()?.toLowerCase()

  let result
  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    result = await model.generateContent([
      PNL_PROMPT,
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
    ])
  } else {
    const text = await parseSpreadsheetToText(file)
    result = await model.generateContent([PNL_PROMPT, text])
  }

  const raw = result.response.text().replace(/```json|```/g, '').trim()
  return JSON.parse(raw) as PnLExtractedData
}

export async function extractProjection(file: File): Promise<ProjectionExtractedData> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
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
