import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WizardFormData } from './PortfolioSetupWizard'

interface Props {
  form: UseFormReturn<WizardFormData>
}

const RETURN_MODEL_OPTIONS = [
  { value: 'slot_based', label: 'Slot-based Revenue Share' },
  { value: 'percentage_based', label: 'Percentage-based' },
  { value: 'fixed_return', label: 'Fixed Return' },
]

const FREQUENCY_OPTIONS = [
  { value: 'bulanan', label: 'Bulanan' },
  { value: 'kuartalan', label: 'Kuartalan' },
  { value: 'semesteran', label: 'Semesteran' },
]

export default function StepInvestorModel({ form }: Props) {
  const { register, formState: { errors }, setValue, watch } = form
  const returnModel = watch('returnModel')
  const reportingFrequency = watch('reportingFrequency')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Struktur Investor</CardTitle>
        <p className="text-sm text-gray-500">
          Tentukan model bagi hasil dan konfigurasi investor untuk portofolio ini.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Model Bagi Hasil *</Label>
            <Select
              value={returnModel}
              onValueChange={v => setValue('returnModel', v as WizardFormData['returnModel'], { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih model" />
              </SelectTrigger>
              <SelectContent>
                {RETURN_MODEL_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Frekuensi Pelaporan *</Label>
            <Select
              value={reportingFrequency}
              onValueChange={v => setValue('reportingFrequency', v as WizardFormData['reportingFrequency'], { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih frekuensi" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Common fields for all models */}
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

        {/* Slot-based fields */}
        {returnModel === 'slot_based' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalSlots">Total Slot *</Label>
              <Input
                id="totalSlots"
                type="number"
                placeholder="10"
                {...register('totalSlots', { valueAsNumber: true })}
              />
              {errors.totalSlots && (
                <p className="text-xs text-red-500">{errors.totalSlots.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nominalPerSlot">Nominal per Slot (IDR) *</Label>
              <Input
                id="nominalPerSlot"
                type="number"
                placeholder="5000000"
                {...register('nominalPerSlot', { valueAsNumber: true })}
              />
              {errors.nominalPerSlot && (
                <p className="text-xs text-red-500">{errors.nominalPerSlot.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Fixed return fields */}
        {returnModel === 'fixed_return' && (
          <div className="space-y-2">
            <Label htmlFor="targetReturnPercent">Target Return (%) *</Label>
            <Input
              id="targetReturnPercent"
              type="number"
              placeholder="12"
              {...register('targetReturnPercent', { valueAsNumber: true })}
            />
            {errors.targetReturnPercent && (
              <p className="text-xs text-red-500">{errors.targetReturnPercent.message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
