import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { FileImage, CheckCircle2, Inbox } from 'lucide-react'
import type { InvestorNotification } from '@/types'
import { ALL_TIME_PERIOD } from '@/types'
import { formatPeriod } from '@/lib/dateUtils'
import { formatCurrencyExact } from '@/lib/utils'

function periodLabel(n: InvestorNotification): string {
  if (n.period === ALL_TIME_PERIOD) return 'All-Time'
  return formatPeriod(n.period)
}

export default function TransferProofHistoryList({ notifications }: { notifications: InvestorNotification[] }) {
  const [previewing, setPreviewing] = useState<InvestorNotification | null>(null)
  const sorted = [...notifications].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Bukti Transfer ({sorted.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Catatan pembayaran dari Arunami — lacak jejak pendapatan Anda.</p>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada bukti transfer</p>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map(n => (
                <div key={n.id} className="flex items-center gap-3 py-3">
                  <button
                    onClick={() => setPreviewing(n)}
                    className="h-12 w-12 shrink-0 rounded border border-slate-200 overflow-hidden hover:opacity-90"
                    aria-label="Lihat bukti"
                  >
                    <img src={n.fileUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">
                      {n.portfolioName} · {periodLabel(n)}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{n.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[#1e5f3f]">{formatCurrencyExact(n.amount)}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      {n.cleared ? (
                        <Badge variant="outline" className="border-slate-300 text-slate-500 text-[10px]">
                          <CheckCircle2 className="mr-1 h-3 w-3" />Dibaca
                        </Badge>
                      ) : (
                        <Badge className="bg-[#2563eb] text-white text-[10px]">Baru</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <img src={previewing.fileUrl} alt="Bukti transfer" className="w-full max-h-[70vh] object-contain rounded-md border" />
              <p className="text-sm text-slate-700">{previewing.message}</p>
              <div className="flex justify-end">
                <Button asChild variant="outline">
                  <a href={previewing.fileUrl} target="_blank" rel="noreferrer">
                    <FileImage className="mr-1.5 h-4 w-4" />Buka gambar asli
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}