import { useEffect } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import type { WizardFormData } from './PortfolioSetupWizard'
import type { ClassifiedPnLData, ClassifiedProjectionData, SuggestedKpi, ClassifiedOpexItem } from '@/types'

interface StepReviewFinancialsProps {
  form: UseFormReturn<WizardFormData>
  extractedPnl: ClassifiedPnLData | null
  extractedProjection: ClassifiedProjectionData | null
  suggestedKpis: SuggestedKpi[]
  onPnlChange: (pnl: ClassifiedPnLData) => void
  onProjectionChange: (proj: ClassifiedProjectionData) => void
}

const COLORS = ['#38a169', '#3182ce', '#d69e2e', '#e53e3e', '#805ad5', '#dd6b20', '#319795', '#d53f8c', '#718096', '#2b6cb0']

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('id-ID').format(val)
}

// ─── Inline editable row for financial items ─────────────────────────────

function FinancialRow({
  label,
  value,
  isStandard,
  isCalculated,
  onLabelChange,
  onValueChange,
  onRemove,
}: {
  label: string
  value: number
  isStandard?: boolean
  isCalculated?: boolean
  onLabelChange?: (v: string) => void
  onValueChange?: (v: number) => void
  onRemove?: () => void
}) {
  const isDiscovered = isStandard === false

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
        isDiscovered && 'border-l-4 border-l-amber-400 bg-amber-50',
        isCalculated && 'bg-gray-50',
      )}
    >
      {/* Label */}
      <div className="min-w-0 flex-1">
        {onLabelChange ? (
          <Input
            value={label}
            onChange={e => onLabelChange(e.target.value)}
            className="h-7 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        ) : (
          <span className={cn('text-sm', isCalculated && 'font-medium text-gray-500')}>
            {label}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="w-40 text-right">
        {onValueChange ? (
          <Input
            type="number"
            value={value}
            onChange={e => onValueChange(Number(e.target.value))}
            className="h-7 text-right text-sm"
          />
        ) : (
          <span className={cn('text-sm tabular-nums', isCalculated && 'font-medium text-gray-500')}>
            Rp {formatCurrency(value)}
          </span>
        )}
      </div>

      {/* Status badge */}
      <div className="w-28 text-right">
        {isDiscovered && (
          <Badge variant="warning" className="text-[10px]">
            <Sparkles className="mr-1 h-3 w-3" />
            Baru Ditemukan
          </Badge>
        )}
        {isCalculated && (
          <span className="text-[10px] text-gray-400">auto</span>
        )}
      </div>

      {/* Remove button */}
      <div className="w-8">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PnL Tab ─────────────────────────────────────────────────────────────

function PnLTab({
  data,
  onChange,
}: {
  data: ClassifiedPnLData
  onChange: (d: ClassifiedPnLData) => void
}) {
  const updateField = <K extends keyof ClassifiedPnLData>(key: K, val: ClassifiedPnLData[K]) => {
    const next = { ...data, [key]: val }
    // Recalculate derived fields
    next.grossProfit = next.revenue - next.cogs
    next.totalOpex = next.opex.reduce((s, o) => s + o.amount, 0)
    next.operatingProfit = next.grossProfit - next.totalOpex
    next.netProfit = next.operatingProfit - next.interest - next.taxes
    onChange(next)
  }

  const updateOpex = (idx: number, patch: Partial<ClassifiedOpexItem>) => {
    const opex = data.opex.map((o, i) => i === idx ? { ...o, ...patch } : o)
    updateField('opex', opex)
  }

  const addOpex = () => {
    updateField('opex', [...data.opex, { name: '', amount: 0, isStandard: false }])
  }

  const removeOpex = (idx: number) => {
    updateField('opex', data.opex.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {/* Period */}
      <div className="flex items-center gap-2">
        <Label className="w-16 text-sm">Periode:</Label>
        <Input
          value={data.period}
          onChange={e => onChange({ ...data, period: e.target.value })}
          className="w-48"
          placeholder="contoh: Januari 2024"
        />
      </div>

      {/* Main line items */}
      <div className="space-y-1.5">
        <FinancialRow
          label="Revenue"
          value={data.revenue}
          onValueChange={v => updateField('revenue', v)}
        />
        <FinancialRow
          label="COGS"
          value={data.cogs}
          onValueChange={v => updateField('cogs', v)}
        />
        <FinancialRow label="Gross Profit" value={data.grossProfit} isCalculated />

        {/* Opex section */}
        <div className="ml-2 mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Detail Opex
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={addOpex} className="h-6 text-xs">
              <Plus className="mr-1 h-3 w-3" /> Tambah
            </Button>
          </div>
          {data.opex.map((item, i) => (
            <FinancialRow
              key={i}
              label={item.name}
              value={item.amount}
              isStandard={item.isStandard}
              onLabelChange={v => updateOpex(i, { name: v })}
              onValueChange={v => updateOpex(i, { amount: v })}
              onRemove={() => removeOpex(i)}
            />
          ))}
        </div>

        <FinancialRow label="Total Opex" value={data.totalOpex} isCalculated />
        <FinancialRow label="Operating Profit" value={data.operatingProfit} isCalculated />
        <FinancialRow
          label="Interest"
          value={data.interest}
          onValueChange={v => updateField('interest', v)}
        />
        <FinancialRow
          label="Taxes"
          value={data.taxes}
          onValueChange={v => updateField('taxes', v)}
        />
        <FinancialRow label="Net Profit" value={data.netProfit} isCalculated />
      </div>
    </div>
  )
}

// ─── Projection Tab ──────────────────────────────────────────────────────

function ProjectionTab({
  data,
  onChange,
}: {
  data: ClassifiedProjectionData
  onChange: (d: ClassifiedProjectionData) => void
}) {
  const updateField = <K extends keyof ClassifiedProjectionData>(key: K, val: ClassifiedProjectionData[K]) => {
    const next = { ...data, [key]: val }
    if (next.projectedRevenue > 0 && next.projectedCogsPercent >= 0) {
      next.projectedCogs = Math.round(next.projectedRevenue * next.projectedCogsPercent / 100)
    }
    next.projectedGrossProfit = next.projectedRevenue - next.projectedCogs
    next.projectedTotalOpex = next.projectedOpex.reduce((s, o) => s + o.amount, 0)
    next.projectedNetProfit = next.projectedGrossProfit - next.projectedTotalOpex
    onChange(next)
  }

  const updateOpex = (idx: number, patch: Partial<ClassifiedOpexItem>) => {
    const opex = data.projectedOpex.map((o, i) => i === idx ? { ...o, ...patch } : o)
    updateField('projectedOpex', opex)
  }

  const addOpex = () => {
    updateField('projectedOpex', [...data.projectedOpex, { name: '', amount: 0, isStandard: false }])
  }

  const removeOpex = (idx: number) => {
    updateField('projectedOpex', data.projectedOpex.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="w-16 text-sm">Periode:</Label>
        <Input
          value={data.period}
          onChange={e => onChange({ ...data, period: e.target.value })}
          className="w-48"
          placeholder="contoh: Februari 2024"
        />
      </div>

      <div className="space-y-1.5">
        <FinancialRow
          label="Projected Revenue"
          value={data.projectedRevenue}
          onValueChange={v => updateField('projectedRevenue', v)}
        />
        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <span className="flex-1 text-sm">COGS %</span>
          <Input
            type="number"
            value={data.projectedCogsPercent}
            onChange={e => updateField('projectedCogsPercent', Number(e.target.value))}
            className="h-7 w-24 text-right text-sm"
          />
          <div className="w-28" />
          <div className="w-8" />
        </div>
        <FinancialRow label="Projected COGS" value={data.projectedCogs} isCalculated />
        <FinancialRow label="Projected Gross Profit" value={data.projectedGrossProfit} isCalculated />

        <div className="ml-2 mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Detail Projected Opex
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={addOpex} className="h-6 text-xs">
              <Plus className="mr-1 h-3 w-3" /> Tambah
            </Button>
          </div>
          {data.projectedOpex.map((item, i) => (
            <FinancialRow
              key={i}
              label={item.name}
              value={item.amount}
              isStandard={item.isStandard}
              onLabelChange={v => updateOpex(i, { name: v })}
              onValueChange={v => updateOpex(i, { amount: v })}
              onRemove={() => removeOpex(i)}
            />
          ))}
        </div>

        <FinancialRow label="Projected Total Opex" value={data.projectedTotalOpex} isCalculated />
        <FinancialRow label="Projected Net Profit" value={data.projectedNetProfit} isCalculated />
      </div>

      <div>
        <Label className="text-sm">Asumsi</Label>
        <textarea
          value={data.assumptions}
          onChange={e => onChange({ ...data, assumptions: e.target.value })}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          rows={3}
        />
      </div>
    </div>
  )
}

// ─── Categories & KPI Tab ────────────────────────────────────────────────

function CategoriesKpiTab({
  form,
  suggestedKpis,
}: {
  form: UseFormReturn<WizardFormData>
  suggestedKpis: SuggestedKpi[]
}) {
  const categories = form.watch('revenueCategories')
  const kpis = form.watch('kpiMetrics')

  const addCategory = () => {
    const current = form.getValues('revenueCategories')
    form.setValue('revenueCategories', [
      ...current,
      { id: `cat-${Date.now()}`, name: '', color: COLORS[current.length % COLORS.length] },
    ])
  }

  const removeCategory = (idx: number) => {
    form.setValue('revenueCategories', categories.filter((_, i) => i !== idx))
  }

  const updateCategory = (idx: number, name: string) => {
    const updated = categories.map((c, i) =>
      i === idx ? { ...c, name, id: name.toLowerCase().replace(/\s+/g, '-') || c.id } : c
    )
    form.setValue('revenueCategories', updated)
  }

  const addKpi = () => {
    const current = form.getValues('kpiMetrics')
    form.setValue('kpiMetrics', [
      ...current,
      { id: `kpi-${Date.now()}`, name: '', targetValue: 0, unit: 'currency' as const },
    ])
  }

  const removeKpi = (idx: number) => {
    form.setValue('kpiMetrics', kpis.filter((_, i) => i !== idx))
  }

  const updateKpi = (idx: number, patch: Record<string, unknown>) => {
    const updated = kpis.map((k, i) => {
      if (i !== idx) return k
      const next = { ...k, ...patch }
      if (patch.name) next.id = (patch.name as string).toLowerCase().replace(/\s+/g, '-')
      return next
    })
    form.setValue('kpiMetrics', updated)
  }

  return (
    <div className="space-y-6">
      {/* Revenue Categories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Kategori Pendapatan</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addCategory} className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" /> Tambah
          </Button>
        </div>
        {categories.map((cat, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            <Input
              value={cat.name}
              onChange={e => updateCategory(i, e.target.value)}
              placeholder="Nama kategori"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeCategory(i)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {form.formState.errors.revenueCategories && (
          <p className="text-xs text-red-500">{form.formState.errors.revenueCategories.message}</p>
        )}
      </div>

      {/* KPI Metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">KPI & Metrik Kinerja</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addKpi} className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" /> Tambah
          </Button>
        </div>

        {/* Suggested KPI banner */}
        {suggestedKpis.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-xs font-medium text-amber-800">
              <Sparkles className="mr-1 inline h-3 w-3" />
              KPI disarankan oleh AI berdasarkan data yang diekstrak:
            </p>
            <p className="text-xs text-amber-700">
              {suggestedKpis.map(k => k.name).join(', ')}
            </p>
          </div>
        )}

        {kpis.map((kpi, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={kpi.name}
              onChange={e => updateKpi(i, { name: e.target.value })}
              placeholder="Nama metrik"
              className="flex-1"
            />
            <Input
              type="number"
              value={kpi.targetValue}
              onChange={e => updateKpi(i, { targetValue: Number(e.target.value) })}
              placeholder="Target"
              className="w-28"
            />
            <Select
              value={kpi.unit}
              onValueChange={v => updateKpi(i, { unit: v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="count">Count</SelectItem>
                <SelectItem value="ratio">Ratio</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => removeKpi(i)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {form.formState.errors.kpiMetrics && (
          <p className="text-xs text-red-500">{form.formState.errors.kpiMetrics.message}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function StepReviewFinancials({
  form,
  extractedPnl,
  extractedProjection,
  suggestedKpis,
  onPnlChange,
  onProjectionChange,
}: StepReviewFinancialsProps) {
  const industryType = form.watch('industryType')
  const hasAnyExtraction = extractedPnl !== null || extractedProjection !== null

  // On first mount with extracted data, auto-populate categories & KPIs from extraction
  useEffect(() => {
    if (!extractedPnl) return

    const categories = form.getValues('revenueCategories')
    // Only auto-populate if still using preset defaults (no user edits)
    const preset = INDUSTRY_PRESETS[industryType]
    const isPresetDefault = categories.length === preset.revenueCategories.length &&
      categories.every((c, i) => c.id === preset.revenueCategories[i]?.id)

    if (isPresetDefault && extractedPnl.revenueBreakdown.length > 0) {
      const newCategories = extractedPnl.revenueBreakdown.map((rb, i) => ({
        id: rb.name.toLowerCase().replace(/\s+/g, '-'),
        name: rb.name,
        color: COLORS[i % COLORS.length],
      }))
      form.setValue('revenueCategories', newCategories)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedPnl])

  useEffect(() => {
    if (suggestedKpis.length === 0) return

    const kpis = form.getValues('kpiMetrics')
    const preset = INDUSTRY_PRESETS[industryType]
    const isPresetDefault = kpis.length === preset.kpiMetrics.length &&
      kpis.every((k, i) => k.id === preset.kpiMetrics[i]?.id)

    if (isPresetDefault) {
      const newKpis = suggestedKpis.map(sk => ({
        id: sk.name.toLowerCase().replace(/\s+/g, '-'),
        name: sk.name,
        targetValue: sk.value,
        unit: sk.unit,
      }))
      form.setValue('kpiMetrics', newKpis)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedKpis])

  if (!hasAnyExtraction) {
    // No extraction — show a simplified manual categories & KPI editor
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kategori & KPI</CardTitle>
          <CardDescription>
            Tidak ada data yang diekstrak dari dokumen. Konfigurasi kategori pendapatan dan KPI secara manual,
            atau kembali ke langkah sebelumnya untuk upload dokumen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoriesKpiTab form={form} suggestedKpis={[]} />
        </CardContent>
      </Card>
    )
  }

  const defaultTab = extractedPnl ? 'pnl' : extractedProjection ? 'projection' : 'categories'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Data Keuangan</CardTitle>
        <CardDescription>
          Periksa hasil ekstraksi AI. Item dengan tanda{' '}
          <Badge variant="warning" className="text-[10px]">
            <Sparkles className="mr-1 h-3 w-3" />
            Baru Ditemukan
          </Badge>{' '}
          adalah variabel unik yang ditemukan AI di dokumen Anda. Anda dapat mengedit, menambah, atau menghapus item.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4">
            {extractedPnl && <TabsTrigger value="pnl">Laba Rugi</TabsTrigger>}
            {extractedProjection && <TabsTrigger value="projection">Proyeksi</TabsTrigger>}
            <TabsTrigger value="categories">Kategori & KPI</TabsTrigger>
          </TabsList>

          {extractedPnl && (
            <TabsContent value="pnl">
              <PnLTab data={extractedPnl} onChange={onPnlChange} />
            </TabsContent>
          )}

          {extractedProjection && (
            <TabsContent value="projection">
              <ProjectionTab data={extractedProjection} onChange={onProjectionChange} />
            </TabsContent>
          )}

          <TabsContent value="categories">
            <CategoriesKpiTab form={form} suggestedKpis={suggestedKpis} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
