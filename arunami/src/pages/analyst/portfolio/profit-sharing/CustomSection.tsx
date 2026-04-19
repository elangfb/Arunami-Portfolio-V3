import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Variable, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import { getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { formatCurrencyExact } from '@/lib/utils'
import type { SectionProps } from './types'
import type {
  CustomConfig, CustomVariable, CustomVariableSource, ReportingFrequency,
  InvestorAllocation,
} from '@/types'

function genId() {
  return `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const SOURCE_LABEL: Record<CustomVariableSource, string> = {
  manual: 'Manual',
  from_pnl_revenue: 'P&L Revenue',
  from_pnl_net_profit: 'P&L Net Profit',
  from_pnl_gross_profit: 'P&L Gross Profit',
  from_invested_amount: 'Invested Amount',
  from_investasi_awal: 'Investasi Awal',
}

const FREQ_LABEL: Record<CustomConfig['distributionFrequency'], string> = {
  bulanan: 'Bulanan',
  kuartalan: 'Kuartalan',
  semesteran: 'Semesteran',
  custom: 'Custom',
}

export default function CustomSection({
  config, investorConfig, portfolio, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<CustomConfig>) {
  const [open, setOpen] = useState(false)

  const [formula, setFormula] = useState(investorConfig.formula)
  const [variables, setVariables] = useState<CustomVariable[]>(investorConfig.variables)
  const [frequency, setFrequency] = useState<CustomConfig['distributionFrequency']>(
    investorConfig.distributionFrequency,
  )

  const [varValues, setVarValues] = useState<Record<string, number>>({})
  const [savingDefaults, setSavingDefaults] = useState(false)

  useEffect(() => {
    const initial: Record<string, number> = {}
    for (const v of investorConfig.variables) initial[v.id] = v.defaultValue
    setVarValues(initial)
  }, [investorConfig.variables])

  const previewResult = useMemo(() => {
    if (!portfolio || investorConfig.variables.length === 0 || !investorConfig.formula) return null

    const mockAllocation: InvestorAllocation = {
      id: 'preview',
      investorUid: '',
      investorName: 'Preview',
      investorEmail: '',
      portfolioId,
      portfolioName: portfolio.name,
      portfolioCode: portfolio.code,
      investedAmount: portfolio.investasiAwal,
      joinedAt: null as never,
      updatedAt: null as never,
    }

    const reportData = {
      period: '',
      revenue: varValues[investorConfig.variables.find(v => v.source === 'from_pnl_revenue')?.id ?? ''] ?? 0,
      netProfit: varValues[investorConfig.variables.find(v => v.source === 'from_pnl_net_profit')?.id ?? ''] ?? 0,
      grossProfit: varValues[investorConfig.variables.find(v => v.source === 'from_pnl_gross_profit')?.id ?? ''] ?? 0,
    }

    const configWithValues: CustomConfig = {
      ...investorConfig,
      variables: investorConfig.variables.map(v => ({
        ...v,
        defaultValue: varValues[v.id] ?? v.defaultValue,
      })),
    }

    try {
      const result = calculateDistribution({
        reportData,
        config: configWithValues,
        allocation: mockAllocation,
        portfolio,
      })
      return result.totalDistribution
    } catch {
      return null
    }
  }, [varValues, investorConfig, portfolio, portfolioId])

  const saveDefaults = async () => {
    setSavingDefaults(true)
    try {
      const fresh = await getPortfolioConfigOrDefault(portfolioId)
      const freshConfig = fresh.investorConfig as CustomConfig
      const updatedVars = freshConfig.variables.map(v => ({
        ...v,
        defaultValue: varValues[v.id] ?? v.defaultValue,
      }))
      const { createdAt: _, ...rest } = fresh
      await savePortfolioConfig(portfolioId, {
        ...rest,
        investorConfig: { ...freshConfig, variables: updatedVars },
      })
      toast.success('Nilai variabel berhasil disimpan')
      await onChanged()
    } catch {
      toast.error('Gagal menyimpan nilai variabel')
    } finally {
      setSavingDefaults(false)
    }
  }

  useEffect(() => {
    if (open) {
      setFormula(investorConfig.formula)
      setVariables(investorConfig.variables.map(v => ({ ...v })))
      setFrequency(investorConfig.distributionFrequency)
    }
  }, [open, investorConfig])

  const allVarsValid = variables.every(v => v.name.trim().length > 0)
  const formulaChanged = formula !== investorConfig.formula
  const varsChanged = JSON.stringify(variables) !== JSON.stringify(investorConfig.variables)
  const freqChanged = frequency !== investorConfig.distributionFrequency
  const canSave = allVarsValid && (formulaChanged || varsChanged || freqChanged)

  const addVar = () => setVariables(v => [...v, {
    id: genId(), name: '', type: 'number', defaultValue: 0, source: 'manual',
  }])
  const removeVar = (id: string) => setVariables(v => v.filter(x => x.id !== id))
  const updateVar = (id: string, patch: Partial<CustomVariable>) =>
    setVariables(v => v.map(x => x.id === id ? { ...x, ...patch } : x))

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <Variable className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Model Kustom</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Ubah Formula
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Formula</p>
              <code className="block rounded bg-muted px-3 py-2 text-sm break-all">
                {investorConfig.formula || '(belum ditentukan)'}
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Frekuensi: {FREQ_LABEL[investorConfig.distributionFrequency]}</Badge>
              <Badge variant="outline">{investorConfig.variables.length} variabel</Badge>
              <Badge variant="outline">Arunami Fee: {investorConfig.arunamiFeePercent}%</Badge>
            </div>
            {investorConfig.variables.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-black">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide">
                      <th className="py-2 pr-3 font-medium">Nama</th>
                      <th className="py-2 pr-3 font-medium">Tipe</th>
                      <th className="py-2 pr-3 font-medium">Sumber</th>
                      <th className="py-2 pr-3 font-medium">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investorConfig.variables.map(v => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{v.name}</td>
                        <td className="py-2 pr-3">{v.type}</td>
                        <td className="py-2 pr-3">{SOURCE_LABEL[v.source]}</td>
                        <td className="py-2 pr-3">{v.defaultValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Input Variabel Kustom</CardTitle>
          </div>
          <Button
            size="sm"
            onClick={saveDefaults}
            disabled={savingDefaults || investorConfig.variables.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {savingDefaults ? 'Menyimpan...' : 'Simpan Nilai Default'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-black">
            Masukkan nilai untuk variabel manual. Variabel dari P&L akan otomatis terisi saat laporan diupload.
          </p>

          {investorConfig.variables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada variabel. Gunakan tombol "Ubah Formula" di atas untuk menambah.</p>
          ) : (
            <div className="space-y-3">
              {investorConfig.variables.map(v => (
                <div key={v.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{v.name}</Label>
                    <Badge variant="outline" className="text-xs">{SOURCE_LABEL[v.source]}</Badge>
                    <Badge variant="outline" className="text-xs">{v.type}</Badge>
                  </div>
                  <Input
                    type="number"
                    value={varValues[v.id] ?? 0}
                    onChange={e => setVarValues(prev => ({ ...prev, [v.id]: parseFloat(e.target.value) || 0 }))}
                    disabled={v.source !== 'manual'}
                    className={v.source !== 'manual' ? 'bg-muted cursor-not-allowed' : ''}
                  />
                </div>
              ))}

              {previewResult !== null && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-sm text-green-800">Hasil Preview (100% ownership):</p>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrencyExact(previewResult)}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EditConfigDialog
        open={open}
        onOpenChange={setOpen}
        title="Ubah Model Kustom"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => ({
          newInvestorConfig: {
            ...investorConfig,
            formula,
            variables,
            distributionFrequency: frequency,
          },
          changeKind: 'custom_formula',
          fromValue: `${investorConfig.formula || '(kosong)'} · ${investorConfig.variables.length} var`,
          toValue: `${formula || '(kosong)'} · ${variables.length} var`,
        })}
        onSaved={onChanged}
      >
        <div className="space-y-1">
          <Label className="text-xs">Formula</Label>
          <Textarea
            rows={2}
            value={formula}
            onChange={e => setFormula(e.target.value)}
            placeholder="cth: revenue * 0.15 - biaya_ops"
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Frekuensi Distribusi</Label>
          <Select
            value={frequency}
            onValueChange={v => setFrequency(v as CustomConfig['distributionFrequency'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['bulanan', 'kuartalan', 'semesteran', 'custom'] as const).map(f => (
                <SelectItem key={f} value={f}>{FREQ_LABEL[f as ReportingFrequency | 'custom']}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          <Label className="text-xs">Variabel</Label>
          {variables.length === 0 && (
            <p className="text-xs text-muted-foreground">Belum ada variabel.</p>
          )}
          {variables.map(v => (
            <div key={v.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <Input
                  placeholder="nama"
                  value={v.name}
                  onChange={e => updateVar(v.id, { name: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Select
                  value={v.type}
                  onValueChange={t => updateVar(v.id, { type: t as CustomVariable['type'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="currency">Currency</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4">
                <Select
                  value={v.source}
                  onValueChange={s => updateVar(v.id, { source: s as CustomVariableSource })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABEL).map(([k, lbl]) => (
                      <SelectItem key={k} value={k}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  value={v.defaultValue}
                  onChange={e => updateVar(v.id, { defaultValue: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={() => removeVar(v.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addVar}>
          <Plus className="h-4 w-4 mr-1" />Tambah Variabel
        </Button>
      </EditConfigDialog>
    </>
  )
}
