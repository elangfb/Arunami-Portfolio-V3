import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import {
  TrendingUp, Percent, DollarSign, CalendarClock, Users, Settings2,
  Plus, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatCurrencyExact } from '@/lib/utils'
import { DISTRIBUTION_MODEL_OPTIONS } from '@/lib/distributionStrategies'
import type { ReturnModelType, CustomVariableSource } from '@/types'
import type { WizardFormData } from './PortfolioSetupWizard'

interface Props {
  form: UseFormReturn<WizardFormData>
}

const MODEL_ICONS: Record<string, React.ReactNode> = {
  net_profit_share: <TrendingUp className="h-5 w-5" />,
  fixed_yield: <Percent className="h-5 w-5" />,
  revenue_share: <DollarSign className="h-5 w-5" />,
  fixed_schedule: <CalendarClock className="h-5 w-5" />,
  annual_dividend: <Users className="h-5 w-5" />,
  custom: <Settings2 className="h-5 w-5" />,
}

const VARIABLE_SOURCES: { value: CustomVariableSource; label: string }[] = [
  { value: 'manual', label: 'Input Manual' },
  { value: 'from_pnl_revenue', label: 'Revenue (dari P&L)' },
  { value: 'from_pnl_net_profit', label: 'Net Profit (dari P&L)' },
  { value: 'from_pnl_gross_profit', label: 'Gross Profit (dari P&L)' },
  { value: 'from_invested_amount', label: 'Invested Amount (per investor)' },
  { value: 'from_investasi_awal', label: 'Total Investasi Awal' },
]

export default function StepInvestorModel({ form }: Props) {
  const { register, formState: { errors }, watch, setValue, getValues } = form
  const investasiAwal = watch('investasiAwal')
  const returnModel = watch('returnModel') as ReturnModelType

  return (
    <Card>
      <CardHeader>
        <CardTitle>Struktur Investasi</CardTitle>
        <p className="text-sm text-gray-500">
          Pilih model distribusi dan konfigurasi untuk portofolio ini.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Investasi (read-only) */}
        <div className="space-y-2">
          <Label>Total Investasi</Label>
          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
            {investasiAwal > 0 ? formatCurrencyExact(investasiAwal) : '-'}
          </div>
          <p className="text-xs text-muted-foreground">
            Diambil dari langkah Informasi Dasar.
          </p>
        </div>

        {/* Model Selector */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Model Distribusi</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DISTRIBUTION_MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue('returnModel', opt.value, { shouldValidate: true })}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  returnModel === opt.value
                    ? 'border-green-600 bg-green-50 ring-1 ring-green-600'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`mt-0.5 rounded-md p-1.5 ${
                  returnModel === opt.value ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {MODEL_ICONS[opt.value]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Model-specific fields */}
        {returnModel === 'net_profit_share' && (
          <NetProfitShareFields form={form} errors={errors} register={register} />
        )}
        {returnModel === 'fixed_yield' && (
          <FixedYieldFields form={form} errors={errors} register={register} setValue={setValue} watch={watch} />
        )}
        {returnModel === 'revenue_share' && (
          <RevenueShareFields form={form} errors={errors} register={register} />
        )}
        {returnModel === 'fixed_schedule' && (
          <FixedScheduleFields form={form} getValues={getValues} setValue={setValue} register={register} />
        )}
        {returnModel === 'annual_dividend' && (
          <AnnualDividendFields register={register} />
        )}
        {returnModel === 'custom' && (
          <CustomFields form={form} getValues={getValues} setValue={setValue} register={register} errors={errors} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Net Profit Share ──────────────────────────────────────────────────────

function NetProfitShareFields({ register, errors }: any) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Profit-Sharing</Label>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="investorSharePercent">Investor Share (%) *</Label>
          <Input
            id="investorSharePercent"
            type="number"
            placeholder="70"
            {...register('investorSharePercent', { valueAsNumber: true })}
          />
          {errors.investorSharePercent && (
            <p className="text-xs text-red-500">{errors.investorSharePercent.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="arunamiFeePercent">Arunami Fee (%) *</Label>
          <Input
            id="arunamiFeePercent"
            type="number"
            placeholder="10"
            {...register('arunamiFeePercent', { valueAsNumber: true })}
          />
          {errors.arunamiFeePercent && (
            <p className="text-xs text-red-500">{errors.arunamiFeePercent.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Fixed Yield ──────────────────────────────────────────────────────────

function FixedYieldFields({ register, errors, setValue, watch }: any) {
  const principalRef = watch('principalReference') ?? 'invested_amount'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fixedYieldPercent">Fixed Yield per Bulan (%) *</Label>
        <Input
          id="fixedYieldPercent"
          type="number"
          step="0.01"
          placeholder="1.5"
          {...register('fixedYieldPercent', { valueAsNumber: true })}
        />
        {errors.fixedYieldPercent && (
          <p className="text-xs text-red-500">{errors.fixedYieldPercent.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Contoh: 1.5 berarti 1.5% dari modal per bulan.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Basis Perhitungan</Label>
        <Select value={principalRef} onValueChange={(v) => setValue('principalReference', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="invested_amount">Per Investor (Invested Amount)</SelectItem>
            <SelectItem value="investasi_awal">Total Investasi Awal Portofolio</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="arunamiFeePercent">Arunami Fee (%)</Label>
        <Input
          id="arunamiFeePercent"
          type="number"
          placeholder="0"
          {...register('arunamiFeePercent', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Persentase fee Arunami dari hasil distribusi. 0 = tidak ada fee.
        </p>
      </div>
    </div>
  )
}

// ─── Revenue Share ─────────────────────────────────────────────────────────

function RevenueShareFields({ register, errors }: any) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="revenueSharePercent">Revenue Share (%) *</Label>
        <Input
          id="revenueSharePercent"
          type="number"
          step="0.01"
          placeholder="5"
          {...register('revenueSharePercent', { valueAsNumber: true })}
        />
        {errors.revenueSharePercent && (
          <p className="text-xs text-red-500">{errors.revenueSharePercent.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Persentase dari pendapatan bruto (gross revenue) yang dibagikan ke investor pool.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="investorSharePercent">Investor Share (%) *</Label>
          <Input
            id="investorSharePercent"
            type="number"
            placeholder="100"
            {...register('investorSharePercent', { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="arunamiFeePercent">Arunami Fee (%) *</Label>
          <Input
            id="arunamiFeePercent"
            type="number"
            placeholder="0"
            {...register('arunamiFeePercent', { valueAsNumber: true })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Fixed Schedule ────────────────────────────────────────────────────────

function FixedScheduleFields({ getValues, setValue, register }: any) {
  const payments: any[] = getValues('scheduledPayments') ?? []
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')

  const addPayment = () => {
    if (!dueDate || !amount) return
    const updated = [
      ...payments,
      { id: crypto.randomUUID(), dueDate, amount: parseFloat(amount), label: label || undefined, status: 'pending' as const },
    ]
    setValue('scheduledPayments', updated)
    setDueDate('')
    setAmount('')
    setLabel('')
  }

  const removePayment = (id: string) => {
    setValue('scheduledPayments', payments.filter((p: any) => p.id !== id))
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Jadwal Pembayaran</Label>
      <p className="text-xs text-muted-foreground">
        Tentukan jadwal pembayaran tetap sesuai kontrak. Tidak harus bulanan.
      </p>

      {/* Payment list */}
      {payments.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left">Periode</th>
                <th className="px-3 py-2 text-left">Jumlah</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{p.dueDate}</td>
                  <td className="px-3 py-2">{formatCurrencyExact(p.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.label ?? '-'}</td>
                  <td className="px-3 py-2">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePayment(p.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add payment row */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Periode (YYYY-MM)</Label>
          <Input value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="2026-06" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Jumlah (Rp)</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000000" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Label (opsional)</Label>
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Pembayaran Q2" />
        </div>
        <Button type="button" variant="outline" size="icon" onClick={addPayment} className="h-10 w-10">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="arunamiFeePercent">Arunami Fee (%)</Label>
        <Input
          id="arunamiFeePercent"
          type="number"
          placeholder="0"
          {...register('arunamiFeePercent', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Persentase fee Arunami dari hasil distribusi. 0 = tidak ada fee.
        </p>
      </div>
    </div>
  )
}

// ─── Annual Dividend ──────────────────────────────────────────────────────

function AnnualDividendFields({ register }: any) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-sm font-medium text-amber-800">Dividen Diskresioner</p>
        <p className="text-xs text-amber-700">
          Jumlah dividen akan ditentukan setelah Rapat Umum Pemegang Saham (RUPS) setiap tahun.
          Admin dapat menginput jumlah dividen di halaman laporan setelah portofolio dibuat.
        </p>
        <p className="text-xs text-amber-700">
          Tidak ada konfigurasi tambahan yang dibutuhkan pada tahap ini.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="arunamiFeePercent">Arunami Fee (%)</Label>
        <Input
          id="arunamiFeePercent"
          type="number"
          placeholder="0"
          {...register('arunamiFeePercent', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Persentase fee Arunami dari hasil distribusi. 0 = tidak ada fee.
        </p>
      </div>
    </div>
  )
}

// ─── Custom Variables ─────────────────────────────────────────────────────

function CustomFields({ getValues, setValue, register, errors }: any) {
  const variables: any[] = getValues('customVariables') ?? []
  const [varName, setVarName] = useState('')
  const [varType, setVarType] = useState<'currency' | 'percentage' | 'number'>('currency')
  const [varSource, setVarSource] = useState<CustomVariableSource>('manual')

  const addVariable = () => {
    if (!varName) return
    const id = varName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const updated = [
      ...variables,
      { id, name: varName, type: varType, defaultValue: 0, source: varSource },
    ]
    setValue('customVariables', updated)
    setVarName('')
  }

  const removeVariable = (id: string) => {
    setValue('customVariables', variables.filter((v: any) => v.id !== id))
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Variabel Kustom</Label>
      <p className="text-xs text-muted-foreground">
        Definisikan variabel yang akan digunakan dalam formula perhitungan distribusi.
      </p>

      {/* Variable list */}
      {variables.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Nama</th>
                <th className="px-3 py-2 text-left">Tipe</th>
                <th className="px-3 py-2 text-left">Sumber</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {variables.map((v: any) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{v.id}</td>
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2">{v.type}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {VARIABLE_SOURCES.find(s => s.value === v.source)?.label}
                  </td>
                  <td className="px-3 py-2">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeVariable(v.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add variable row */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Nama Variabel</Label>
          <Input value={varName} onChange={e => setVarName(e.target.value)} placeholder="Revenue Share" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipe</Label>
          <Select value={varType} onValueChange={(v: any) => setVarType(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="currency">Currency</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="number">Number</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sumber</Label>
          <Select value={varSource} onValueChange={(v: any) => setVarSource(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VARIABLE_SOURCES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={addVariable} className="h-10 w-10">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Formula */}
      <div className="space-y-2">
        <Label htmlFor="formula">Formula *</Label>
        <Input
          id="formula"
          placeholder="revenue * share / 100"
          {...register('formula')}
        />
        {errors.formula && (
          <p className="text-xs text-red-500">{errors.formula.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Gunakan ID variabel dalam formula. Operator: +, -, *, /, ().
          Contoh: <code className="rounded bg-muted px-1">revenue * share_pct / 100</code>
        </p>
      </div>

      {/* Arunami Fee */}
      <div className="space-y-2">
        <Label htmlFor="arunamiFeePercent">Arunami Fee (%)</Label>
        <Input
          id="arunamiFeePercent"
          type="number"
          placeholder="0"
          {...register('arunamiFeePercent', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Persentase fee Arunami dari hasil distribusi. 0 = tidak ada fee.
        </p>
      </div>

      {/* Distribution frequency */}
      <div className="space-y-2">
        <Label>Frekuensi Distribusi</Label>
        <Select
          value={getValues('distributionFrequency') ?? 'bulanan'}
          onValueChange={(v) => setValue('distributionFrequency', v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bulanan">Bulanan</SelectItem>
            <SelectItem value="kuartalan">Kuartalan</SelectItem>
            <SelectItem value="semesteran">Semesteran</SelectItem>
            <SelectItem value="custom">Kustom</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
