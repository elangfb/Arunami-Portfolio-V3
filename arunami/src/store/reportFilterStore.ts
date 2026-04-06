import { create } from 'zustand'

interface ReportFilterState {
  selectedFilter: string
  setSelectedFilter: (filter: string) => void
}

export const useReportFilterStore = create<ReportFilterState>((set) => ({
  selectedFilter: 'all',
  setSelectedFilter: (filter) => set({ selectedFilter: filter }),
}))
