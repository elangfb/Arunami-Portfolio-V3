import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import InvestorReportForm from './InvestorReportForm'
import type { InvestorPortfolioData } from '@/lib/firestore'
import type { AppUser } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  investor: AppUser
  portfolioData: InvestorPortfolioData[]
}

/** Modal wrapper around the inline {@link InvestorReportForm}. */
export default function InvestorReportGenerator({ open, onOpenChange, investor, portfolioData }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Laporan — {investor.displayName}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <InvestorReportForm
            investor={investor}
            portfolioData={portfolioData}
            onDone={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
