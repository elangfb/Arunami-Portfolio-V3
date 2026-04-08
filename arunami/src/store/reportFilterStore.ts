import { create } from 'zustand'

export type PeriodType = 'monthly' | 'quarterly' | 'yearly' | 'all'

interface ReportFilterState {
  periodType: PeriodType
  selectedPeriod: string // e.g., "2026-03", "2026-Q1", "2026", or "" (auto-select latest)
  setPeriodType: (type: PeriodType) => void
  setSelectedPeriod: (period: string) => void
}

export const useReportFilterStore = create<ReportFilterState>((set) => ({
  periodType: 'monthly',
  selectedPeriod: '',
  setPeriodType: (periodType) => set({ periodType, selectedPeriod: '' }),
  setSelectedPeriod: (selectedPeriod) => set({ selectedPeriod }),
}))
