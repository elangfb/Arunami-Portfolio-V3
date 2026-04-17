import { useState } from 'react'
import { toast } from 'sonner'
import { Timestamp } from 'firebase/firestore'
import { Users, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getPortfolioConfigOrDefault, savePortfolioConfig } from '@/lib/firestore'
import { formatCurrencyExact } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { PortfolioConfig, AnnualDividendConfig, DividendEntry } from '@/types'

interface Props {
  portfolioId: string
  config: PortfolioConfig
  onConfigUpdated: () => void
}

export default function DividendDeclaration({ portfolioId, config, onConfigUpdated }: Props) {
  const { user } = useAuthStore()
  const investorConfig = config.investorConfig as AnnualDividendConfig
  const history = [...(investorConfig.dividendHistory ?? [])].sort((a, b) => b.year - a.year)

  const currentYear = new Date().getFullYear()
  const hasCurrent = history.some(d => d.year === currentYear)

  const [year, setYear] = useState(currentYear)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const declareDividend = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Jumlah dividen harus lebih dari 0')
      return
    }

    setSaving(true)
    try {
      const fresh = await getPortfolioConfigOrDefault(portfolioId)
      const freshConfig = fresh.investorConfig as AnnualDividendConfig
      const existing = freshConfig.dividendHistory ?? []

      const entry: DividendEntry = {
        id: crypto.randomUUID(),
        year,
        totalAmount: parseFloat(amount),
        approvedAt: Timestamp.now(),
        approvedBy: user?.uid ?? '',
        notes: notes || undefined,
      }

      // Replace if same year exists, otherwise append
      const idx = existing.findIndex(d => d.year === year)
      const updated = idx >= 0
        ? existing.map((d, i) => i === idx ? entry : d)
        : [...existing, entry]

      const { createdAt: _, ...rest } = fresh
      await savePortfolioConfig(portfolioId, {
        ...rest,
        investorConfig: { ...freshConfig, dividendHistory: updated },
      })

      toast.success(`Dividen tahun ${year} berhasil ditetapkan`)
      setAmount('')
      setNotes('')
      onConfigUpdated()
    } catch {
      toast.error('Gagal menyimpan dividen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-green-600" />
        <h3 className="text-lg font-semibold">Deklarasi Dividen Tahunan</h3>
      </div>

      {/* Declaration form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tetapkan Dividen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Masukkan total dividen yang disetujui setelah Rapat Umum Pemegang Saham (RUPS).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tahun</Label>
              <Input
                type="number"
                value={year}
                onChange={e => setYear(parseInt(e.target.value, 10))}
                min={2020}
                max={2050}
              />
            </div>
            <div className="space-y-2">
              <Label>Total Dividen (Rp) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="50000000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Catatan (opsional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Hasil RUPS tanggal..."
              rows={2}
            />
          </div>
          <Button
            onClick={declareDividend}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? 'Menyimpan...' : hasCurrent ? `Perbarui Dividen ${currentYear}` : `Tetapkan Dividen ${year}`}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat Dividen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Tahun {d.year}</span>
                    {d.notes && <span className="text-xs text-muted-foreground">— {d.notes}</span>}
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {formatCurrencyExact(d.totalAmount)}
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
