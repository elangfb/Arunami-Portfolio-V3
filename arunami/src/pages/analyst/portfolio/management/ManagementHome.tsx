import { FolderOpen, PlusCircle, ChevronRight } from 'lucide-react'

interface ManagementHomeProps {
  reportCount: number
  onView: () => void
  onCreate: () => void
}

export function ManagementHome({ reportCount, onView, onCreate }: ManagementHomeProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Portfolio Management</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onView}
          className="group text-left rounded-xl border p-6 transition hover:border-[#1e5f3f] hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1e5f3f]/10 text-[#1e5f3f]">
              <FolderOpen className="h-6 w-6" />
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Lihat Report</h3>
          <p className="mt-1 text-sm text-muted-foreground">Lihat & edit laporan yang sudah ada.</p>
          <p className="mt-3 text-sm font-medium text-[#1e5f3f]">{reportCount} laporan</p>
        </button>

        <button
          type="button"
          onClick={onCreate}
          className="group text-left rounded-xl border p-6 transition hover:border-[#1e5f3f] hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1e5f3f] text-white">
              <PlusCircle className="h-6 w-6" />
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Buat Report</h3>
          <p className="mt-1 text-sm text-muted-foreground">Buat laporan baru untuk satu periode.</p>
          <p className="mt-3 text-sm font-medium text-muted-foreground">AI atau manual</p>
        </button>
      </div>
    </div>
  )
}
