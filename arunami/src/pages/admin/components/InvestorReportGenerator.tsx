import { useEffect, useState } from 'react'
import { getInvestorReportSources } from '@/lib/firestore'
import type { InvestorReportSource } from '@/lib/firestore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import InvestorReportForm from './InvestorReportForm'
import type { AppUser } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  investor: AppUser
}

/** Modal wrapper around the inline {@link InvestorReportForm}; loads its own report sources. */
export default function InvestorReportGenerator({ open, onOpenChange, investor }: Props) {
  const [sources, setSources] = useState<InvestorReportSource[] | null>(null)

  useEffect(() => {
    if (!open) return
    setSources(null)
    getInvestorReportSources(investor.uid).then(setSources).catch(() => setSources([]))
  }, [open, investor.uid])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Laporan — {investor.displayName}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          {sources === null ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1e5f3f] border-t-transparent" />
            </div>
          ) : (
            <InvestorReportForm
              investor={investor}
              portfolioData={sources}
              onDone={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
