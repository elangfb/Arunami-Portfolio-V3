import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createPortfolio, savePortfolioConfig } from '@/lib/firestore'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import type {
  IndustryType, ReturnModelType, ReportingFrequency,
  RevenueCategory, KpiMetric, InvestorConfigUnion, CustomVariableSource,
  ScheduledPayment, CustomVariable,
} from '@/types'

import StepIndicator from './StepIndicator'
import StepBasicInfo from './StepBasicInfo'
import StepInvestorModel from './StepInvestorModel'

// ─── Schema ──────────────────────────────────────────────────────────────

const revenueCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  color: z.string(),
})

const kpiMetricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Nama metrik wajib diisi'),
  targetValue: z.number().min(0),
  unit: z.enum(['currency', 'percentage', 'count', 'ratio']),
})

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

const wizardSchema = z.object({
  // Step 1: Basic Info
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  brandName: z.string().min(1, 'Brand Name wajib diisi'),
  code: z.string().min(1, 'Kode wajib diisi'),
  industryType: z.enum(['retail', 'saas', 'fnb', 'jasa', 'manufaktur', 'lainnya']),
  stage: z.string().min(1, 'Tahap wajib diisi'),
  periode: z.string().min(1, 'Periode wajib diisi'),
  investasiAwal: z.number().min(0, 'Total investasi minimal 0'),
  description: z.string().optional().default(''),

  // Hidden presets
  revenueCategories: z.array(revenueCategorySchema).min(1),
  kpiMetrics: z.array(kpiMetricSchema).min(1),

  // Step 2: Distribution Model + Investment Structure
  returnModel: z.enum([
    'net_profit_share', 'fixed_yield', 'revenue_share',
    'fixed_schedule', 'annual_dividend', 'custom',
  ]),
  investorSharePercent: z.number().min(0).max(100),
  arunamiFeePercent: z.number().min(0).max(100),

  // Fixed Yield
  fixedYieldPercent: z.number().min(0).optional(),
  principalReference: z.enum(['invested_amount', 'investasi_awal']).optional(),

  // Revenue Share
  revenueSharePercent: z.number().min(0).optional(),

  // Fixed Schedule
  scheduledPayments: z.array(scheduledPaymentSchema).optional(),

  // Annual Dividend — no extra config at setup

  // Custom
  customVariables: z.array(customVariableSchema).optional(),
  formula: z.string().optional(),
  distributionFrequency: z.enum(['bulanan', 'kuartalan', 'semesteran', 'custom']).optional(),
})

export type WizardFormData = z.infer<typeof wizardSchema>

const STEP_FIELDS: (keyof WizardFormData)[][] = [
  ['name', 'brandName', 'code', 'industryType', 'stage', 'periode', 'investasiAwal'],
  ['returnModel', 'investorSharePercent', 'arunamiFeePercent'],
]

const STEPS = [
  { label: 'Info' },
  { label: 'Struktur Investasi' },
]

function buildInvestorConfig(data: WizardFormData): InvestorConfigUnion {
  const base = {
    investorSharePercent: data.investorSharePercent,
    arunamiFeePercent: data.arunamiFeePercent,
  }

  switch (data.returnModel) {
    case 'net_profit_share':
      return { ...base, type: 'net_profit_share' as const }

    case 'fixed_yield':
      return {
        ...base,
        type: 'fixed_yield' as const,
        fixedYieldPercent: data.fixedYieldPercent ?? 0,
        principalReference: (data.principalReference ?? 'invested_amount') as 'invested_amount' | 'investasi_awal',
      }

    case 'revenue_share':
      return {
        ...base,
        type: 'revenue_share' as const,
        revenueSharePercent: data.revenueSharePercent ?? 0,
      }

    case 'fixed_schedule':
      return {
        ...base,
        investorSharePercent: 0,
        arunamiFeePercent: 0,
        type: 'fixed_schedule' as const,
        scheduledPayments: (data.scheduledPayments ?? []) as ScheduledPayment[],
      }

    case 'annual_dividend':
      return {
        ...base,
        investorSharePercent: 0,
        arunamiFeePercent: 0,
        type: 'annual_dividend' as const,
        dividendHistory: [],
      }

    case 'custom':
      return {
        ...base,
        type: 'custom' as const,
        variables: (data.customVariables ?? []) as CustomVariable[],
        formula: data.formula ?? '',
        distributionFrequency: (data.distributionFrequency ?? 'bulanan') as ReportingFrequency | 'custom',
        customScheduleDates: [],
      }

    default:
      return { ...base, type: 'net_profit_share' as const }
  }
}

export default function PortfolioSetupWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const prevIndustryRef = useRef<IndustryType | null>(null)

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema) as any,
    defaultValues: {
      name: '',
      brandName: '',
      code: '',
      industryType: 'retail',
      stage: '',
      periode: '',
      investasiAwal: 0,
      description: '',
      revenueCategories: INDUSTRY_PRESETS.retail.revenueCategories,
      kpiMetrics: INDUSTRY_PRESETS.retail.kpiMetrics,
      returnModel: 'net_profit_share',
      investorSharePercent: 70,
      arunamiFeePercent: 10,
      principalReference: 'invested_amount',
      scheduledPayments: [],
      customVariables: [],
      distributionFrequency: 'bulanan',
    },
    mode: 'onBlur',
  })

  const industryType = form.watch('industryType')

  useEffect(() => {
    if (prevIndustryRef.current !== null && prevIndustryRef.current !== industryType) {
      const preset = INDUSTRY_PRESETS[industryType]
      form.setValue('revenueCategories', preset.revenueCategories)
      form.setValue('kpiMetrics', preset.kpiMetrics)
    }
    prevIndustryRef.current = industryType
  }, [industryType, form])

  const handleNext = async () => {
    const fieldsToValidate = STEP_FIELDS[currentStep]
    const isValid = await form.trigger(fieldsToValidate as any)
    if (!isValid) return
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
  }

  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 0))

  const handleSubmit = async () => {
    const isValid = await form.trigger()
    if (!isValid) return

    setSubmitting(true)
    try {
      const data = form.getValues()

      const portfolioId = await createPortfolio({
        name: data.name,
        brandName: data.brandName,
        code: data.code,
        stage: data.stage,
        periode: data.periode,
        investasiAwal: data.investasiAwal,
        description: data.description ?? '',
        industryType: data.industryType as IndustryType,
        isGracePeriod: true,
        assignedInvestors: [],
        assignedAnalysts: [],
      })

      const investorConfig = buildInvestorConfig(data)
      const reportingFrequency: ReportingFrequency =
        data.returnModel === 'custom' && data.distributionFrequency && data.distributionFrequency !== 'custom'
          ? data.distributionFrequency as ReportingFrequency
          : 'bulanan'

      await savePortfolioConfig(portfolioId, {
        industryType: data.industryType as IndustryType,
        revenueCategories: data.revenueCategories as RevenueCategory[],
        returnModel: data.returnModel as ReturnModelType,
        investorConfig,
        reportingFrequency,
        kpiMetrics: data.kpiMetrics as KpiMetric[],
      })

      toast.success('Portofolio berhasil dibuat!')
      navigate('/admin/portfolios')
    } catch (error) {
      console.error('Failed to create portfolio:', error)
      toast.error('Gagal membuat portofolio. Silakan coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = currentStep === STEPS.length - 1

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/portfolios')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Buat Portofolio Baru</h1>
      </div>

      <StepIndicator steps={STEPS} currentStep={currentStep} />

      <div>
        {currentStep === 0 && <StepBasicInfo form={form as any} />}
        {currentStep === 1 && <StepInvestorModel form={form as any} />}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
          Kembali
        </Button>
        {isLastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {submitting ? 'Membuat...' : 'Buat Portofolio'}
          </Button>
        ) : (
          <Button onClick={handleNext} className="bg-green-600 hover:bg-green-700">
            Lanjut
          </Button>
        )}
      </div>
    </div>
  )
}
