import type { UseFormReturn } from 'react-hook-form'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { INDUSTRY_OPTIONS, STAGE_OPTIONS } from '@/lib/industryPresets'
import type { WizardFormData } from './PortfolioSetupWizard'

interface Props {
  form: UseFormReturn<WizardFormData>
}

export default function StepBasicInfo({ form }: Props) {
  const { register, formState: { errors }, setValue, watch } = form
  const industryType = watch('industryType')
  const stage = watch('stage')
  const isGracePeriod = watch('isGracePeriod')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informasi Dasar</CardTitle>
        <p className="text-sm text-gray-500">Masukkan informasi dasar perusahaan portofolio.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nama Portofolio *</Label>
            <Input id="name" placeholder="PT Contoh Teknologi" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Kode *</Label>
            <Input id="code" placeholder="ARN-01" {...register('code')} />
            {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Industri / Jenis Bisnis *</Label>
            <Select
              value={industryType}
              onValueChange={v => setValue('industryType', v as WizardFormData['industryType'], { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih industri" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.industryType && <p className="text-xs text-red-500">{errors.industryType.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Tahap Investasi *</Label>
            <Select
              value={stage}
              onValueChange={v => setValue('stage', v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih tahap" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stage && <p className="text-xs text-red-500">{errors.stage.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Periode Mulai *</Label>
            <MonthYearPicker
              value={watch('periode')}
              onChange={(v) => setValue('periode', v, { shouldValidate: true })}
            />
            {errors.periode && <p className="text-xs text-red-500">{errors.periode.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="investasiAwal">Investasi Awal (IDR) *</Label>
            <Input
              id="investasiAwal"
              type="number"
              placeholder="100000000"
              {...register('investasiAwal', { valueAsNumber: true })}
            />
            {errors.investasiAwal && <p className="text-xs text-red-500">{errors.investasiAwal.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea
            id="description"
            placeholder="Deskripsi singkat tentang perusahaan..."
            {...register('description')}
          />
        </div>

        {/* Grace Period Toggle */}
        <div
          className={`rounded-lg border p-4 transition-colors ${isGracePeriod ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={isGracePeriod}
              onChange={e => setValue('isGracePeriod', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 accent-amber-600"
            />
            <div className="space-y-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Proyek dalam Grace Period
              </span>
              <p className="text-xs text-muted-foreground">
                Aktifkan jika proyek belum memiliki laporan PnL dan Proyeksi.
                Sistem akan meminta upload <strong>Management Report</strong> dan <strong>Arunami Note</strong> sebagai gantinya.
              </p>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
