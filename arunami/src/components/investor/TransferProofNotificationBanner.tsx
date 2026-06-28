import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Bell, CheckCircle2, ExternalLink, FileText } from 'lucide-react'
import { clearNotification } from '@/lib/firestore'
import { toast } from 'sonner'
import type { InvestorNotification } from '@/types'
import { ALL_TIME_PERIOD } from '@/types'
import { formatPeriod } from '@/lib/dateUtils'
import { isPdfProof } from '@/lib/utils'

function periodLabel(n: InvestorNotification): string {
  if (n.period === ALL_TIME_PERIOD) return 'All-Time'
  return formatPeriod(n.period)
}

interface Props {
  notifications: InvestorNotification[]
  onChanged: () => void
}

export default function TransferProofNotificationBanner({ notifications, onChanged }: Props) {
  const uncleared = notifications.filter(n => !n.cleared)
  const [previewing, setPreviewing] = useState<InvestorNotification | null>(null)

  if (uncleared.length === 0) return null

  const handleClear = async (n: InvestorNotification) => {
    try {
      await clearNotification(n.id)
      onChanged()
    } catch {
      toast.error('Gagal menandai notifikasi')
    }
  }

  return (
    <>
      <div className="rounded-lg border border-[#2563eb]/30 bg-gradient-to-br from-[#2563eb]/8 to-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/15">
            <Bell className="h-5 w-5 text-[#2563eb]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[#0f172a]">
                {uncleared.length === 1 ? 'Bukti transfer baru' : `${uncleared.length} bukti transfer belum dibaca`}
              </h2>
              <span className="text-xs font-medium text-[#2563eb] bg-[#2563eb]/10 rounded-full px-2 py-0.5">
                {uncleared.length} baru
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              Arunami telah mengirim bukti pembayaran. Tinjau dan tandai telah dibaca.
            </p>

            <ul className="mt-3 space-y-2">
              {uncleared.map(n => (
                <li key={n.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
                  {isPdfProof(n.fileName ?? n.fileUrl) ? (
                    <button
                      onClick={() => setPreviewing(n)}
                      className="flex h-12 w-12 items-center justify-center rounded border border-slate-200 bg-slate-100 hover:opacity-90"
                      aria-label="Lihat bukti"
                    >
                      <FileText className="h-5 w-5 text-[#2563eb]" />
                    </button>
                  ) : (
                    <img
                      src={n.fileUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover border border-slate-200 cursor-pointer hover:opacity-90"
                      onClick={() => setPreviewing(n)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">
                      {n.portfolioName} · {periodLabel(n)}
                    </p>
                    <p className="text-xs text-slate-600 truncate">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setPreviewing(n)}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />Lihat
                    </Button>
                    <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => handleClear(n)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Tandai Dibaca
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bukti Transfer</DialogTitle>
            <DialogDescription>
              {previewing && `${previewing.portfolioName} · ${periodLabel(previewing)}`}
            </DialogDescription>
          </DialogHeader>
          {previewing && (
            <div className="space-y-3">
              {isPdfProof(previewing.fileName ?? previewing.fileUrl) ? (
                <iframe src={previewing.fileUrl} title="Bukti transfer" className="w-full h-[70vh] rounded-md border" />
              ) : (
                <img src={previewing.fileUrl} alt="Bukti transfer" className="w-full max-h-[70vh] object-contain rounded-md border" />
              )}
              <p className="text-sm text-slate-700">{previewing.message}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}