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
  RevenueCategory, KpiMetric, InvestorConfigUnion,
  ScheduledPayment, CustomVariable, GraceConfig,
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

// Treat NaN / empty / null as "not provided" so .optional() works with
// react-hook-form's `valueAsNumber` (which emits NaN for blank inputs).
const optionalNumber = (min = 0) =>
  z.preprocess(
    v => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.number().min(min).optional()
  )

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
  contractStart: z.string().optional().default(''),
  contractEnd: z.string().optional().default(''),

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
  fixedYieldPercent: optionalNumber(0),
  principalReference: z.enum(['invested_amount', 'investasi_awal']).optional(),

  // Revenue Share
  revenueSharePercent: optionalNumber(0),

  // Fixed Schedule
  scheduledPayments: z.array(scheduledPaymentSchema).optional(),

  // Annual Dividend — no extra config at setup

  // Custom
  customVariables: z.array(customVariableSchema).optional(),
  formula: z.string().optional(),
  distributionFrequency: z.enum(['bulanan', 'kuartalan', 'semesteran', 'custom']).optional(),

  // Grace period — every new portfolio starts in grace until the first PnL.
  // Configures what investors receive while no PnL exists.
  graceReturnMode: z.enum(['none', 'fixed_yield']).default('none'),
  graceFixedYieldPercent: optionalNumber(0),
  gracePrincipalReference: z.enum(['invested_amount', 'investasi_awal']).optional(),
  graceArunamiFeePercent: optionalNumber(0),
  graceExpectedOperationalDate: z.string().optional(),
})

export type WizardFormData = z.infer<typeof wizardSchema>

const STEP_FIELDS: (keyof WizardFormData)[][] = [
  ['name', 'brandName', 'code', 'industryType', 'stage', 'periode', 'investasiAwal'],
  ['returnModel', 'investorSharePercent', 'arunamiFeePercent'],
]

// Fields that should be validated on final submit, per selected distribution model.
// Other model fields are skipped so a stale value from a previously-viewed model
// (e.g. NaN on fixedYieldPercent after toggling cards) doesn't block submission.
const MODEL_SPECIFIC_FIELDS: Record<ReturnModelType, (keyof WizardFormData)[]> = {
  net_profit_share:  ['investorSharePercent', 'arunamiFeePercent'],
  percentage_based:  ['investorSharePercent', 'arunamiFeePercent'], // legacy alias → net_profit_share
  fixed_return:      ['fixedYieldPercent', 'principalReference', 'arunamiFeePercent'], // legacy → fixed_yield
  fixed_yield:       ['fixedYieldPercent', 'principalReference', 'arunamiFeePercent'],
  revenue_share:     ['revenueSharePercent', 'investorSharePercent', 'arunamiFeePercent'],
  fixed_schedule:    ['scheduledPayments', 'arunamiFeePercent'],
  annual_dividend:   ['arunamiFeePercent'],
  custom:            ['customVariables', 'formula', 'distributionFrequency', 'arunamiFeePercent'],
}

const STEPS = [
  { label: 'Info' },
  { label: 'Struktur Investasi' },
]

export type InvestmentFormData = Pick<
  WizardFormData,
  | 'returnModel'
  | 'investorSharePercent'
  | 'arunamiFeePercent'
  | 'fixedYieldPercent'
  | 'principalReference'
  | 'revenueSharePercent'
  | 'scheduledPayments'
  | 'customVariables'
  | 'formula'
  | 'distributionFrequency'
>

export function buildInvestorConfig(data: InvestmentFormData): InvestorConfigUnion {
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
      contractStart: '',
      contractEnd: '',
      revenueCategories: INDUSTRY_PRESETS.retail.revenueCategories,
      kpiMetrics: INDUSTRY_PRESETS.retail.kpiMetrics,
      returnModel: 'net_profit_share',
      investorSharePercent: 70,
      arunamiFeePercent: 10,
      principalReference: 'invested_amount',
      scheduledPayments: [],
      customVariables: [],
      distributionFrequency: 'bulanan',
      graceReturnMode: 'none',
      gracePrincipalReference: 'invested_amount',
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
    const returnModel = form.getValues('returnModel') as ReturnModelType
    const fieldsToValidate: (keyof WizardFormData)[] = [
      ...STEP_FIELDS[0],
      'revenueCategories',
      'kpiMetrics',
      'returnModel',
      ...MODEL_SPECIFIC_FIELDS[returnModel],
    ]
    const isValid = await form.trigger(fieldsToValidate as any)
    if (!isValid) {
      const errors = form.formState.errors
      const erroredFields = Object.keys(errors) as (keyof WizardFormData)[]
      console.warn('[PortfolioSetupWizard] validation failed', errors)

      // Jump back to the earliest step that contains an errored field so the
      // inline red error messages become visible to the user.
      const firstBadStep = STEP_FIELDS.findIndex(stepFields =>
        stepFields.some(f => erroredFields.includes(f))
      )
      if (firstBadStep !== -1 && firstBadStep !== currentStep) {
        setCurrentStep(firstBadStep)
      }

      const fieldLabels: Partial<Record<keyof WizardFormData, string>> = {
        name: 'Nama',
        brandName: 'Brand Name',
        code: 'Kode',
        stage: 'Tahap',
        periode: 'Periode',
        investasiAwal: 'Total Investasi',
        investorSharePercent: 'Investor Share',
        arunamiFeePercent: 'Arunami Fee',
        returnModel: 'Model Distribusi',
      }
      const missing = erroredFields
        .map(f => fieldLabels[f] ?? String(f))
        .slice(0, 4)
        .join(', ')
      toast.error(`Lengkapi dulu: ${missing || 'beberapa field belum valid'}`)
      return
    }

    setSubmitting(true)
    try {
      const data = form.getValues()

      const graceConfig: GraceConfig = data.graceReturnMode === 'fixed_yield'
        ? {
            returnMode: 'fixed_yield',
            fixedYieldPercent: data.graceFixedYieldPercent ?? 0,
            principalReference: data.gracePrincipalReference ?? 'invested_amount',
            arunamiFeePercent: data.graceArunamiFeePercent ?? 0,
            ...(data.graceExpectedOperationalDate
              ? { expectedOperationalDate: data.graceExpectedOperationalDate }
              : {}),
          }
        : {
            returnMode: 'none',
            ...(data.graceExpectedOperationalDate
              ? { expectedOperationalDate: data.graceExpectedOperationalDate }
              : {}),
          }

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
        graceConfig,
        assignedInvestors: [],
        assignedAnalysts: [],
        ...(data.contractStart ? { contractStart: data.contractStart } : {}),
        ...(data.contractEnd ? { contractEnd: data.contractEnd } : {}),
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
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
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
