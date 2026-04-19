import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatPeriod, getNextReportingPeriod } from '@/lib/dateUtils'
import { getPortfolioConfig, recordConfigChange } from '@/lib/firestore'
import { ModelPicker } from '@/pages/admin/setup/StepInvestorModel'
import {
  buildInvestorConfig,
  type InvestmentFormData,
} from '@/pages/admin/setup/PortfolioSetupWizard'
import type {
  PortfolioConfig, ReturnModelType, ReportingFrequency,
  InvestorConfigUnion,
} from '@/types'
import type { SectionUser } from './types'

const MODEL_LABEL: Record<ReturnModelType, string> = {
  percentage_based: 'Net Profit Share',
  fixed_return: 'Fixed Return',
  net_profit_share: 'Net Profit Share',
  fixed_yield: 'Fixed Yield',
  revenue_share: 'Revenue Share',
  fixed_schedule: 'Fixed Schedule',
  annual_dividend: 'Annual Dividend',
  custom: 'Custom Formula',
}

const scheduledPaymentSchema = z.object({
  id: z.string(),
  dueDate: z.string(),
  amount: z.number().min(0),
  label: z.string().optional(),
  status: z.enum(['pending', 'paid']),
})

const customVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['currency', 'percentage', 'number']),
  defaultValue: z.number(),
  source: z.enum([
    'manual', 'from_pnl_revenue', 'from_pnl_net_profit',
    'from_pnl_gross_profit', 'from_invested_amount', 'from_investasi_awal',
  ]),
})

const dialogSchema = z.object({
  returnModel: z.enum([
    'net_profit_share', 'fixed_yield', 'revenue_share',
    'fixed_schedule', 'annual_dividend', 'custom',
  ]),
  investorSharePercent: z.number().min(0).max(100),
  arunamiFeePercent: z.number().min(0).max(100),
  fixedYieldPercent: z.number().min(0).optional(),
  principalReference: z.enum(['invested_amount', 'investasi_awal']).optional(),
  revenueSharePercent: z.number().min(0).optional(),
  scheduledPayments: z.array(scheduledPaymentSchema).optional(),
  customVariables: z.array(customVariableSchema).optional(),
  formula: z.string().optional(),
  distributionFrequency: z.enum(['bulanan', 'kuartalan', 'semesteran', 'custom']).optional(),
})

type DialogFormData = z.infer<typeof dialogSchema>

function summarizeCurrentConfig(ic: InvestorConfigUnion): string {
  switch (ic.type) {
    case 'fixed_yield':
      return `Fixed Yield ${ic.fixedYieldPercent}% per bulan`
    case 'revenue_share':
      return `Revenue Share ${ic.revenueSharePercent}%`
    case 'fixed_schedule': {
      const n = ic.scheduledPayments?.length ?? 0
      return `${n} jadwal pembayaran`
    }
    case 'annual_dividend': {
      const n = ic.dividendHistory?.length ?? 0
      return `${n} dividen tercatat`
    }
    case 'custom':
      return `Formula custom dengan ${ic.variables?.length ?? 0} variabel`
    case 'net_profit_share':
    case 'percentage_based':
    case 'fixed_return':
    default:
      return `Investor ${ic.investorSharePercent}% / Fee ${ic.arunamiFeePercent}%`
  }
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  portfolioId: string
  currentUser: SectionUser | null
  onSaved: () => Promise<void> | void
}

export default function ChangeReturnModelDialog({
  open, onOpenChange, portfolioId, currentUser, onSaved,
}: Props) {
  const [reasonText, setReasonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [currentConfig, setCurrentConfig] = useState<PortfolioConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)

  const form = useForm<DialogFormData>({
    resolver: zodResolver(dialogSchema) as never,
    defaultValues: {
      returnModel: 'net_profit_share',
      investorSharePercent: 70,
      arunamiFeePercent: 10,
      principalReference: 'invested_amount',
      scheduledPayments: [],
      customVariables: [],
      distributionFrequency: 'bulanan',
      formula: '',
    },
    mode: 'onBlur',
  })

  useEffect(() => {
    if (!open) return
    setReasonText('')
    form.reset({
      returnModel: 'net_profit_share',
      investorSharePercent: 70,
      arunamiFeePercent: 10,
      principalReference: 'invested_amount',
      scheduledPayments: [],
      customVariables: [],
      distributionFrequency: 'bulanan',
      formula: '',
    })
    setLoadingConfig(true)
    getPortfolioConfig(portfolioId)
      .then(cfg => setCurrentConfig(cfg))
      .catch(err => {
        console.error(err)
        toast.error('Gagal memuat konfigurasi portofolio')
        setCurrentConfig(null)
      })
      .finally(() => setLoadingConfig(false))
  }, [open, portfolioId, form])

  const nextPeriod = currentConfig ? getNextReportingPeriod(currentConfig.reportingFrequency) : ''

  const selectedModel = form.watch('returnModel')
  const normalizedCurrent: ReturnModelType | null = currentConfig
    ? (currentConfig.returnModel === 'percentage_based' || currentConfig.returnModel === 'fixed_return'
      ? 'net_profit_share'
      : currentConfig.returnModel)
    : null
  const modelChanged = normalizedCurrent !== null && selectedModel !== normalizedCurrent

  const handleSave = async () => {
    if (!currentUser || !currentConfig) return
    const valid = await form.trigger()
    if (!valid) return
    if (!modelChanged) return
    if (reasonText.trim().length === 0) return

    setSaving(true)
    try {
      const data = form.getValues() as InvestmentFormData
      const newInvestorConfig = buildInvestorConfig(data)
      const newReturnModel = data.returnModel as ReturnModelType

      const newReportingFrequency: ReportingFrequency =
        data.returnModel === 'custom'
          && data.distributionFrequency
          && data.distributionFrequency !== 'custom'
          ? data.distributionFrequency as ReportingFrequency
          : currentConfig.reportingFrequency

      await recordConfigChange({
        portfolioId,
        currentConfig: { ...currentConfig, reportingFrequency: newReportingFrequency },
        newInvestorConfig,
        newReturnModel,
        changeKind: 'return_model',
        fromValue: `${MODEL_LABEL[currentConfig.returnModel]} (${summarizeCurrentConfig(currentConfig.investorConfig)})`,
        toValue: MODEL_LABEL[newReturnModel],
        reasonNote: reasonText,
        effectiveFromPeriod: nextPeriod,
        changedByUid: currentUser.uid,
        changedByName: currentUser.displayName,
      })

      toast.success('Model distribusi berhasil diubah')
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengubah model distribusi')
    } finally {
      setSaving(false)
    }
  }

  const reasonValid = reasonText.trim().length > 0
  const saveEnabled = modelChanged && reasonValid && !saving && !!currentUser && !!currentConfig

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ubah Model Distribusi</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {loadingConfig ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Memuat konfigurasi...</div>
          ) : !currentConfig ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Konfigurasi portofolio belum dibuat.
            </div>
          ) : (
            <>
              <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-700" />
                <div className="text-black space-y-1">
                  <p className="font-bold">
                    Konfigurasi saat ini akan diarsipkan ke riwayat dan model baru akan dimulai dari nol.
                  </p>
                  <p>
                    Konfigurasi saat ini: <span className="font-semibold">{MODEL_LABEL[currentConfig.returnModel]}</span>
                    {' — '}{summarizeCurrentConfig(currentConfig.investorConfig)}
                  </p>
                </div>
              </div>

              <ModelPicker form={form} />

              <div className="space-y-1">
                <Label className="text-xs text-black">Alasan Perubahan *</Label>
                <Textarea
                  rows={3}
                  placeholder="Contoh: Renegosiasi kontrak, perubahan strategi distribusi..."
                  value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  className="text-black"
                />
              </div>

              <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-700" />
                <div className="text-black font-bold">
                  Perubahan berlaku mulai periode{' '}
                  <span className="underline">{nextPeriod ? formatPeriod(nextPeriod) : '-'}</span>.
                  Laporan periode sebelumnya tidak akan berubah.
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!saveEnabled}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
