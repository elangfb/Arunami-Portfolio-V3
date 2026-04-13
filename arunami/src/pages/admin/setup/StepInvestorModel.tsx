import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrencyExact } from '@/lib/utils'
import type { WizardFormData } from './PortfolioSetupWizard'

interface Props {
  form: UseFormReturn<WizardFormData>
}

export default function StepInvestorModel({ form }: Props) {
  const { register, formState: { errors }, watch } = form
  const investasiAwal = watch('investasiAwal')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Struktur Investasi</CardTitle>
        <p className="text-sm text-gray-500">
          Total investasi dan model bagi hasil untuk portofolio ini.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Total Investasi</Label>
          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
            {investasiAwal > 0 ? formatCurrencyExact(investasiAwal) : '-'}
          </div>
          <p className="text-xs text-muted-foreground">
            Diambil dari langkah Informasi Dasar.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Profit-Sharing Model</Label>
          <div className="grid grid-cols-2 gap-4 pt-1">
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
      </CardContent>
    </Card>
  )
}
