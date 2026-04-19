import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Timestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import { formatCurrencyExact } from '@/lib/utils'
import { getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import type { SectionProps } from './types'
import type { FixedScheduleConfig, ScheduledPayment } from '@/types'

function genId() {
  return `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function summarize(payments: ScheduledPayment[]): string {
  if (payments.length === 0) return 'kosong'
  const total = payments.reduce((s, p) => s + p.amount, 0)
  return `${payments.length} pembayaran · ${formatCurrencyExact(total)}`
}

export default function FixedScheduleSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<FixedScheduleConfig>) {
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState<string | null>(null)
  const payments = investorConfig.scheduledPayments ?? []
  const [draft, setDraft] = useState<ScheduledPayment[]>(payments)

  useEffect(() => {
    if (open) setDraft(payments.map(p => ({ ...p })))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalAmount = payments.reduce((s, p) => s + p.amount, 0)
  const paidAmount = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const pendingAmount = totalAmount - paidAmount

  const allValid = draft.every(p => !!p.dueDate && p.amount > 0)
  const changed = JSON.stringify(draft) !== JSON.stringify(payments)
  const canSave = allValid && changed

  const addRow = () => setDraft(d => [
    ...d,
    { id: genId(), dueDate: '', amount: 0, status: 'pending' },
  ])
  const removeRow = (id: string) => setDraft(d => d.filter(r => r.id !== id))
  const updateRow = (id: string, patch: Partial<ScheduledPayment>) =>
    setDraft(d => d.map(r => r.id === id ? { ...r, ...patch } : r))

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
      await onChanged()
    } catch {
      toast.error('Gagal mengkonfirmasi pembayaran')
    } finally {
      setMarking(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Jadwal Pembayaran</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Kelola Jadwal
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-[#38a169]">{formatCurrencyExact(totalAmount)}</span>
            <span className="text-sm text-black">total terjadwal</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Dibayar: {formatCurrencyExact(paidAmount)}</Badge>
            <Badge variant="outline">Tertunda: {formatCurrencyExact(pendingAmount)}</Badge>
            <Badge variant="outline">{payments.length} pembayaran</Badge>
          </div>

          {payments.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm text-black">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide">
                    <th className="py-2 pr-3 font-medium">Jatuh Tempo</th>
                    <th className="py-2 pr-3 font-medium">Jumlah</th>
                    <th className="py-2 pr-3 font-medium">Label</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{p.dueDate || '-'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatCurrencyExact(p.amount)}</td>
                      <td className="py-2 pr-3">{p.label || '-'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={p.status === 'paid' ? 'default' : 'outline'}>
                          {p.status === 'paid' ? 'Dibayar' : 'Tertunda'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {p.status === 'pending' ? (
                          <Button
                            size="sm"
                            onClick={() => markAsPaid(p.id)}
                            disabled={marking === p.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {marking === p.id ? 'Mengkonfirmasi...' : 'Konfirmasi Bayar'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditConfigDialog
        open={open}
        onOpenChange={setOpen}
        title="Kelola Jadwal Pembayaran"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => ({
          newInvestorConfig: { ...investorConfig, scheduledPayments: draft },
          changeKind: 'scheduled_payment',
          fromValue: summarize(payments),
          toValue: summarize(draft),
        })}
        onSaved={onChanged}
      >
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {draft.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Belum ada jadwal. Klik "Tambah Pembayaran" untuk memulai.
            </p>
          )}
          {draft.map(row => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Label className="text-xs">Jatuh Tempo</Label>
                <Input
                  type="date"
                  value={row.dueDate}
                  onChange={e => updateRow(row.id, { dueDate: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Jumlah (Rp)</Label>
                <Input
                  type="number" min={0}
                  value={row.amount}
                  onChange={e => updateRow(row.id, { amount: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Label</Label>
                <Input
                  value={row.label ?? ''}
                  placeholder="cth: Termin 1"
                  onChange={e => updateRow(row.id, { label: e.target.value })}
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" />Tambah Pembayaran
        </Button>
      </EditConfigDialog>
    </>
  )
}
