import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Landmark, Plus } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import { formatCurrencyExact } from '@/lib/utils'
import type { SectionProps } from './types'
import type { AnnualDividendConfig, DividendEntry } from '@/types'

function genId() {
  return `div_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(t?: Timestamp): string {
  if (!t) return '-'
  return t.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AnnualDividendSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<AnnualDividendConfig>) {
  const [open, setOpen] = useState(false)
  const history = investorConfig.dividendHistory ?? []
  const latest = [...history].sort((a, b) => b.year - a.year)[0]

  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [amount, setAmount] = useState(0)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setYear(thisYear)
      setAmount(0)
      setNotes('')
    }
  }, [open, thisYear])

  const canSave = amount > 0 && year > 1900

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Dividen Tahunan</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Deklarasi Baru
          </Button>
        </CardHeader>
        <CardContent>
          {latest ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-[#38a169]">
                  {formatCurrencyExact(latest.totalAmount)}
                </span>
                <span className="text-sm text-black">dividen {latest.year}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">Disetujui: {formatDate(latest.approvedAt)}</Badge>
                <Badge variant="outline">Arunami Fee: {investorConfig.arunamiFeePercent}%</Badge>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Belum ada dividen yang dideklarasi.
            </p>
          )}

          {history.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm text-black">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide">
                    <th className="py-2 pr-3 font-medium">Tahun</th>
                    <th className="py-2 pr-3 font-medium">Jumlah</th>
                    <th className="py-2 pr-3 font-medium">Disetujui</th>
                    <th className="py-2 pr-3 font-medium">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].sort((a, b) => b.year - a.year).map(d => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{d.year}</td>
                      <td className="py-2 pr-3">{formatCurrencyExact(d.totalAmount)}</td>
                      <td className="py-2 pr-3">{formatDate(d.approvedAt)}</td>
                      <td className="py-2 pr-3">{d.notes || '-'}</td>
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
        title="Deklarasi Dividen"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => {
          if (!currentUser) return null
          const entry: DividendEntry = {
            id: genId(),
            year,
            totalAmount: amount,
            approvedAt: Timestamp.now(),
            approvedBy: currentUser.displayName,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }
          return {
            newInvestorConfig: {
              ...investorConfig,
              dividendHistory: [...history, entry],
            },
            changeKind: 'dividend_declared',
            fromValue: latest ? `${latest.year}: ${formatCurrencyExact(latest.totalAmount)}` : '-',
            toValue: `${year}: ${formatCurrencyExact(amount)}`,
          }
        }}
        onSaved={onChanged}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tahun</Label>
            <Input
              type="number" min={1900} max={2100}
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total Dividen (Rp)</Label>
            <Input
              type="number" min={0}
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Catatan (opsional)</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </EditConfigDialog>
    </>
  )
}
