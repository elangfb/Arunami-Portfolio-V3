import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import { formatCurrencyExact } from '@/lib/utils'
import { calculateDistribution } from '@/lib/distributionStrategies'
import type {
  Portfolio, PortfolioConfig, CustomConfig, CustomVariable,
  InvestorAllocation,
} from '@/types'

interface Props {
  portfolio: Portfolio
  portfolioId: string
  config: PortfolioConfig
  onConfigUpdated: () => void
}

export default function CustomVariableInput({ portfolio, portfolioId, config, onConfigUpdated }: Props) {
  const investorConfig = config.investorConfig as CustomConfig
  const variables = investorConfig.variables ?? []
  const formula = investorConfig.formula ?? ''

  const [values, setValues] = useState<Record<string, number>>({})
  const [previewResult, setPreviewResult] = useState<number | null>(null)

  // Initialize values from defaults
  useEffect(() => {
    const initial: Record<string, number> = {}
    for (const v of variables) {
      initial[v.id] = v.defaultValue
    }
    setValues(initial)
  }, [variables])

  // Preview calculation
  useEffect(() => {
    if (variables.length === 0 || !formula) return

    // Build a mock allocation for preview
    const mockAllocation: InvestorAllocation = {
      id: 'preview',
      investorUid: '',
      investorName: 'Preview',
      investorEmail: '',
      portfolioId,
      portfolioName: portfolio.name,
      portfolioCode: portfolio.code,
      investedAmount: portfolio.investasiAwal,
      joinedAt: null as any,
      updatedAt: null as any,
    }

    // Build report data from manual values
    const reportData = {
      period: '',
      revenue: values[variables.find(v => v.source === 'from_pnl_revenue')?.id ?? ''] ?? 0,
      netProfit: values[variables.find(v => v.source === 'from_pnl_net_profit')?.id ?? ''] ?? 0,
      grossProfit: values[variables.find(v => v.source === 'from_pnl_gross_profit')?.id ?? ''] ?? 0,
    }

    // Override manual variable defaults with current values
    const configWithValues: CustomConfig = {
      ...investorConfig,
      variables: variables.map(v => ({
        ...v,
        defaultValue: values[v.id] ?? v.defaultValue,
      })),
    }

    const result = calculateDistribution({
      reportData,
      config: configWithValues,
      allocation: mockAllocation,
      portfolio,
    })
    setPreviewResult(result.totalDistribution)
  }, [values, variables, formula, investorConfig, portfolio, portfolioId])

  const updateValue = (id: string, val: number) => {
    setValues(prev => ({ ...prev, [id]: val }))
  }

  // Save updated defaults back to config
  const saveDefaults = async () => {
    try {
      const fresh = await getPortfolioConfigOrDefault(portfolioId)
      const freshConfig = fresh.investorConfig as CustomConfig
      const updatedVars = freshConfig.variables.map(v => ({
        ...v,
        defaultValue: values[v.id] ?? v.defaultValue,
      }))

      const { createdAt: _, ...rest } = fresh
      await savePortfolioConfig(portfolioId, {
        ...rest,
        investorConfig: { ...freshConfig, variables: updatedVars },
      })

      toast.success('Nilai variabel berhasil disimpan')
      onConfigUpdated()
    } catch {
      toast.error('Gagal menyimpan nilai variabel')
    }
  }

  const sourceLabel = (v: CustomVariable) => {
    switch (v.source) {
      case 'manual': return 'Manual'
      case 'from_pnl_revenue': return 'Revenue'
      case 'from_pnl_net_profit': return 'Net Profit'
      case 'from_pnl_gross_profit': return 'Gross Profit'
      case 'from_invested_amount': return 'Invested'
      case 'from_investasi_awal': return 'Total Investasi'
      default: return v.source
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-green-600" />
        <h3 className="text-lg font-semibold">Input Variabel Kustom</h3>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variabel</CardTitle>
          <p className="text-sm text-muted-foreground">
            Masukkan nilai untuk variabel manual. Variabel dari P&L akan otomatis terisi saat laporan diupload.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {variables.map(v => (
            <div key={v.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{v.name}</Label>
                  <Badge variant="outline" className="text-xs">{sourceLabel(v)}</Badge>
                  <Badge variant="outline" className="text-xs">{v.type}</Badge>
                </div>
                <Input
                  type="number"
                  value={values[v.id] ?? 0}
                  onChange={e => updateValue(v.id, parseFloat(e.target.value) || 0)}
                  disabled={v.source !== 'manual'}
                  className={v.source !== 'manual' ? 'bg-muted cursor-not-allowed' : ''}
                />
              </div>
            </div>
          ))}

          {/* Formula display */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <Label className="text-xs font-semibold">Formula</Label>
            <code className="block text-sm text-muted-foreground">{formula}</code>
          </div>

          {/* Preview */}
          {previewResult !== null && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-800">Hasil Preview (100% ownership):</p>
              <p className="text-xl font-bold text-green-700">
                {formatCurrencyExact(previewResult)}
              </p>
            </div>
          )}

          <Button onClick={saveDefaults} className="bg-green-600 hover:bg-green-700">
            Simpan Nilai Default
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
