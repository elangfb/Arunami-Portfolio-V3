import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createPortfolio, savePortfolioConfig, saveReport, syncFinancialData } from '@/lib/firestore'
import { normalizePeriod } from '@/lib/dateUtils'
import { INDUSTRY_PRESETS } from '@/lib/industryPresets'
import type {
  IndustryType, ReturnModelType, ReportingFrequency,
  RevenueCategory, KpiMetric, InvestorConfigUnion,
  ClassifiedPnLData, ClassifiedProjectionData,
  ProjectionExtractedData,
  PortfolioSetupExtraction, SuggestedKpi,
} from '@/types'

import StepIndicator from './StepIndicator'
import StepBasicInfo from './StepBasicInfo'
import StepUploadDocuments from './StepUploadDocuments'
import StepReviewFinancials from './StepReviewFinancials'
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

const wizardSchema = z.object({
  // Step 1: Basic Info
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  code: z.string().min(1, 'Kode wajib diisi'),
  industryType: z.enum(['retail', 'saas', 'fnb', 'jasa', 'manufaktur', 'lainnya']),
  stage: z.string().min(1, 'Tahap wajib diisi'),
  periode: z.string().min(1, 'Periode wajib diisi'),
  investasiAwal: z.number().min(0, 'Investasi awal minimal 0'),
  description: z.string().optional().default(''),
  isGracePeriod: z.boolean().default(false),

  // Step 3: Review (populated from AI or manual)
  revenueCategories: z.array(revenueCategorySchema).min(1, 'Minimal 1 kategori'),
  kpiMetrics: z.array(kpiMetricSchema).min(1, 'Minimal 1 metrik'),

  // Step 4: Investor Model
  returnModel: z.enum(['slot_based', 'percentage_based', 'fixed_return']),
  reportingFrequency: z.enum(['bulanan', 'kuartalan', 'semesteran']),
  investorSharePercent: z.number().min(0).max(100),
  arunamiFeePercent: z.number().min(0).max(100),
  totalSlots: z.number().min(1).optional(),
  nominalPerSlot: z.number().min(0).optional(),
  targetReturnPercent: z.number().min(0).optional(),
})

export type WizardFormData = z.infer<typeof wizardSchema>

// Fields to validate per step (normal flow)
const STEP_FIELDS_NORMAL: (keyof WizardFormData)[][] = [
  ['name', 'code', 'industryType', 'stage', 'periode', 'investasiAwal'],
  [], // Upload step — validated by component state
  ['revenueCategories', 'kpiMetrics'],
  ['returnModel', 'reportingFrequency', 'investorSharePercent', 'arunamiFeePercent'],
]

// Fields to validate per step (grace period — skips upload & review, goes straight to investor)
const STEP_FIELDS_GRACE: (keyof WizardFormData)[][] = [
  ['name', 'code', 'industryType', 'stage', 'periode', 'investasiAwal'],
  ['returnModel', 'reportingFrequency', 'investorSharePercent', 'arunamiFeePercent'],
]

const STEPS_NORMAL = [
  { label: 'Info' },
  { label: 'Upload' },
  { label: 'Review' },
  { label: 'Investor' },
]

const STEPS_GRACE = [
  { label: 'Info' },
  { label: 'Investor' },
]

// ─── Component ───────────────────────────────────────────────────────────

export default function PortfolioSetupWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const prevIndustryRef = useRef<IndustryType | null>(null)

  // AI extraction state (lives outside the form)
  const [extractedPnl, setExtractedPnl] = useState<ClassifiedPnLData | null>(null)
  const [extractedProjection, setExtractedProjection] = useState<ClassifiedProjectionData | null>(null)
  const [suggestedKpis, setSuggestedKpis] = useState<SuggestedKpi[]>([])
  const [isExtracting, setIsExtracting] = useState(false)

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema) as any,
    defaultValues: {
      name: '',
      code: '',
      industryType: 'retail',
      stage: '',
      periode: '',
      investasiAwal: 0,
      description: '',
      isGracePeriod: false,
      revenueCategories: INDUSTRY_PRESETS.retail.revenueCategories,
      returnModel: 'slot_based',
      reportingFrequency: 'bulanan',
      investorSharePercent: 70,
      arunamiFeePercent: 10,
      totalSlots: 10,
      nominalPerSlot: 5000000,
      kpiMetrics: INDUSTRY_PRESETS.retail.kpiMetrics,
    },
    mode: 'onBlur',
  })

  const industryType = form.watch('industryType')
  const isGracePeriod = form.watch('isGracePeriod')

  // Dynamic steps based on grace period toggle
  const STEPS = isGracePeriod ? STEPS_GRACE : STEPS_NORMAL
  const STEP_FIELDS = isGracePeriod ? STEP_FIELDS_GRACE : STEP_FIELDS_NORMAL

  // Reset step if toggling grace period puts us beyond the last step
  useEffect(() => {
    if (currentStep >= STEPS.length) {
      setCurrentStep(0)
    }
  }, [isGracePeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  // When industry changes, update presets for categories & KPIs
  useEffect(() => {
    if (prevIndustryRef.current !== null && prevIndustryRef.current !== industryType) {
      const preset = INDUSTRY_PRESETS[industryType]
      form.setValue('revenueCategories', preset.revenueCategories)
      form.setValue('kpiMetrics', preset.kpiMetrics)
    }
    prevIndustryRef.current = industryType
  }, [industryType, form])

  const handleExtractionComplete = useCallback((result: PortfolioSetupExtraction) => {
    setExtractedPnl(result.pnl)
    setExtractedProjection(result.projection)
    setSuggestedKpis(result.suggestedKpis)
  }, [])

  const handleNext = async () => {
    const fieldsToValidate = STEP_FIELDS[currentStep]
    if (fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate as any)
      if (!isValid) return
    }

    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleSubmit = async () => {
    const isValid = await form.trigger()
    if (!isValid) return

    setSubmitting(true)
    try {
      const data = form.getValues()

      // Create portfolio document
      const portfolioId = await createPortfolio({
        name: data.name,
        code: data.code,
        stage: data.stage,
        periode: data.periode,
        investasiAwal: data.investasiAwal,
        description: data.description ?? '',
        industryType: data.industryType as IndustryType,
        isGracePeriod: data.isGracePeriod,
        assignedInvestors: [],
        assignedAnalysts: [],
      })

      // Build InvestorConfigUnion based on return model
      let investorConfig: InvestorConfigUnion
      if (data.returnModel === 'slot_based') {
        investorConfig = {
          type: 'slot_based',
          totalSlots: data.totalSlots ?? 10,
          nominalPerSlot: data.nominalPerSlot ?? 5000000,
          investorSharePercent: data.investorSharePercent,
          arunamiFeePercent: data.arunamiFeePercent,
        }
      } else if (data.returnModel === 'fixed_return') {
        investorConfig = {
          type: 'fixed_return',
          targetReturnPercent: data.targetReturnPercent ?? 0,
          payoutFrequency: data.reportingFrequency as ReportingFrequency,
          investorSharePercent: data.investorSharePercent,
          arunamiFeePercent: data.arunamiFeePercent,
        }
      } else {
        investorConfig = {
          type: 'percentage_based',
          investorSharePercent: data.investorSharePercent,
          arunamiFeePercent: data.arunamiFeePercent,
        }
      }

      // Save portfolio config
      await savePortfolioConfig(portfolioId, {
        industryType: data.industryType as IndustryType,
        revenueCategories: data.revenueCategories as RevenueCategory[],
        returnModel: data.returnModel as ReturnModelType,
        investorConfig,
        reportingFrequency: data.reportingFrequency as ReportingFrequency,
        kpiMetrics: data.kpiMetrics as KpiMetric[],
      })

      // Auto-save reports (skipped entirely for grace period projects)
      if (!data.isGracePeriod) {
        // Normal flow: save PnL & projection extracted reports
        if (extractedPnl) {
          const { revenueBreakdown, ...pnlFields } = extractedPnl
          const unitBreakdown: Record<string, number> = {}
          for (const rb of revenueBreakdown) {
            unitBreakdown[rb.name.toLowerCase().replace(/\s+/g, '-')] = rb.unitCount
          }
          await saveReport(portfolioId, {
            type: 'pnl',
            fileName: 'Upload Setup (AI)',
            fileUrl: '',
            period: extractedPnl.period,
            extractedData: {
              ...pnlFields,
              opex: pnlFields.opex.map(({ isStandard: _, ...rest }) => rest),
              unitBreakdown,
            },
            uploadedBy: 'admin',
          })
        }

        if (extractedProjection) {
          for (const month of extractedProjection.monthlyData) {
            const period = normalizePeriod(month.month)
            const extractedData: ProjectionExtractedData = {
              period,
              projectedRevenue: month.projectedRevenue,
              projectedCogsPercent: extractedProjection.cogsPercent,
              projectedCogs: month.projectedCogs,
              projectedGrossProfit: month.projectedGrossProfit,
              projectedOpex: month.opexBreakdown.map(({ isStandard: _, ...rest }) => rest),
              projectedTotalOpex: month.totalOpex,
              projectedNetProfit: month.projectedNetProfit,
              assumptions: extractedProjection.assumptions,
            }
            await saveReport(portfolioId, {
              type: 'projection',
              fileName: 'Upload Setup (AI)',
              fileUrl: '',
              period,
              extractedData,
              uploadedBy: 'admin',
            })
          }
        }

        // Sync financial data if reports were saved
        if (extractedPnl || extractedProjection) {
          await syncFinancialData(portfolioId)
        }
      }

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/portfolios')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Buat Portofolio Baru</h1>
      </div>

      {/* Step Indicator */}
      <StepIndicator steps={STEPS} currentStep={currentStep} />

      {/* Step Content */}
      <div>
        {currentStep === 0 && <StepBasicInfo form={form as any} />}
        {isGracePeriod ? (
          <>
            {currentStep === 1 && <StepInvestorModel form={form as any} />}
          </>
        ) : (
          <>
            {currentStep === 1 && (
              <StepUploadDocuments
                industryType={industryType}
                onExtractionComplete={handleExtractionComplete}
                hasExtraction={extractedPnl !== null || extractedProjection !== null}
                onProcessingChange={setIsExtracting}
              />
            )}
            {currentStep === 2 && (
              <StepReviewFinancials
                form={form as any}
                extractedPnl={extractedPnl}
                extractedProjection={extractedProjection}
                suggestedKpis={suggestedKpis}
                onPnlChange={setExtractedPnl}
                onProjectionChange={setExtractedProjection}
              />
            )}
            {currentStep === 3 && <StepInvestorModel form={form as any} />}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
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
          <Button
            onClick={handleNext}
            disabled={currentStep === 1 && !isGracePeriod && (isExtracting || (!extractedPnl && !extractedProjection))}
            className="bg-green-600 hover:bg-green-700"
          >
            Lanjut
          </Button>
        )}
      </div>
    </div>
  )
}
