import { useState } from 'react'
import { toast } from 'sonner'
import { Timestamp } from 'firebase/firestore'
import { Check, Clock, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import { formatCurrencyExact } from '@/lib/utils'
import { formatPeriod } from '@/lib/dateUtils'
import type { PortfolioConfig, FixedScheduleConfig } from '@/types'

interface Props {
  portfolioId: string
  config: PortfolioConfig
  onConfigUpdated: () => void
}

export default function SchedulePaymentConfirm({ portfolioId, config, onConfigUpdated }: Props) {
  const [marking, setMarking] = useState<string | null>(null)
  const investorConfig = config.investorConfig as FixedScheduleConfig
  const payments = investorConfig.scheduledPayments ?? []

  const pending = payments.filter(p => p.status === 'pending').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const paid = payments.filter(p => p.status === 'paid').sort((a, b) => b.dueDate.localeCompare(a.dueDate))

  const markAsPaid = async (paymentId: string) => {
    setMarking(paymentId)
    try {
      const fresh = await getPortfolioConfigOrDefault(portfolioId)
      const freshConfig = fresh.investorConfig as FixedScheduleConfig
      const updated = freshConfig.scheduledPayments.map(p =>
        p.id === paymentId ? { ...p, status: 'paid' as const, paidAt: Timestamp.now() } : p,
      )

      const { createdAt: _, ...rest } = fresh
      await savePortfolioConfig(portfolioId, {
        ...rest,
        investorConfig: { ...freshConfig, scheduledPayments: updated },
      })

      toast.success('Pembayaran berhasil dikonfirmasi')
      onConfigUpdated()
    } catch {
      toast.error('Gagal mengkonfirmasi pembayaran')
    } finally {
      setMarking(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-green-600" />
        <h3 className="text-lg font-semibold">Jadwal Pembayaran</h3>
      </div>

      {/* Pending payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pembayaran Tertunda ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Semua pembayaran sudah dikonfirmasi.</p>
          ) : (
            <div className="space-y-3">
              {pending.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">{formatPeriod(p.dueDate)}</span>
                      {p.label && <Badge variant="outline">{p.label}</Badge>}
                    </div>
                    <p className="mt-1 text-lg font-bold text-green-700">
                      {formatCurrencyExact(p.amount)}
                    </p>
                  </div>
                  <Button
                    onClick={() => markAsPaid(p.id)}
                    disabled={marking === p.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {marking === p.id ? 'Mengkonfirmasi...' : 'Konfirmasi Bayar'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paid history */}
      {paid.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat Pembayaran ({paid.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paid.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">{formatPeriod(p.dueDate)}</span>
                    {p.label && <Badge variant="outline" className="text-xs">{p.label}</Badge>}
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {formatCurrencyExact(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
