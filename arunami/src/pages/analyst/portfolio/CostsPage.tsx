import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getFinancialData } from '@/lib/firestore'
import { formatCurrencyCompact } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinancialData, Portfolio } from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function CostsPage() {
  const { portfolioId } = useOutletContext<Context>()
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (portfolioId) getFinancialData(portfolioId).then(d => { setData(d); setLoading(false) })
  }, [portfolioId])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <div className="p-8 text-muted-foreground">Data biaya belum tersedia.</div>

  const totalCost = data.costStructure.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Struktur Biaya</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Breakdown Biaya Operasional</CardTitle>
          <p className="text-sm text-muted-foreground">Total: {formatCurrencyCompact(totalCost)}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.costStructure.map(item => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{formatCurrencyCompact(item.amount)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({item.percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#38a169] transition-all"
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2">Item Biaya</th>
                  <th className="text-right py-2">Jumlah</th>
                  <th className="text-right py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {data.costStructure.map(item => (
                  <tr key={item.name} className="border-b hover:bg-muted/30">
                    <td className="py-2.5">{item.name}</td>
                    <td className="text-right py-2.5 font-medium">{formatCurrencyCompact(item.amount)}</td>
                    <td className="text-right py-2.5 text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5">Total</td>
                  <td className="text-right py-2.5">{formatCurrencyCompact(totalCost)}</td>
                  <td className="text-right py-2.5">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
