import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { ArrowLeft, Sparkles, PencilLine, CheckCircle2, AlertCircle, Pencil } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'

interface CreatePickerProps {
  pnlPeriods: string[] // periods (YYYY-MM) that have PnL data
  existingPeriods: string[] // periods that already have a management report
  generating: boolean
  onBack: () => void
  onGenerateAI: (period: string) => void
  onManual: (period: string) => void
  onEditExisting: (period: string) => void
}

export function CreatePicker({
  pnlPeriods, existingPeriods, generating, onBack, onGenerateAI, onManual, onEditExisting,
}: CreatePickerProps) {
  const [period, setPeriod] = useState('')

  const hasPnl = !!period && pnlPeriods.includes(period)
  const alreadyExists = !!period && existingPeriods.includes(period)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-bold">Buat Report</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pilih Periode</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pilih bulan & tahun laporan. Generate dengan AI tersedia untuk periode yang memiliki data PnL.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 max-w-md">
            <Label className="text-xs">Periode</Label>
            <MonthYearPicker value={period} onChange={setPeriod} />
          </div>

          {/* Status badge for the selected period */}
          {period && !alreadyExists && (
            hasPnl ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Data PnL tersedia untuk {formatPeriod(period)}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Tidak ada data PnL untuk {formatPeriod(period)} — generate AI dinonaktifkan
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Existing report → offer edit */}
      {period && alreadyExists && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>Sudah ada laporan untuk <span className="font-medium">{formatPeriod(period)}</span>.</span>
            </div>
            <Button size="sm" onClick={() => onEditExisting(period)}>
              <Pencil className="mr-2 h-4 w-4" />Edit Laporan
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Method choice */}
      {period && !alreadyExists && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={!hasPnl || generating}
            onClick={() => onGenerateAI(period)}
            className="text-left rounded-lg border p-5 transition hover:border-[#1e5f3f] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:shadow-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10 text-[#1e5f3f] mb-3">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{generating ? 'Menganalisis...' : 'Generate dengan AI'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              AI membuat ringkasan dari data PnL. Anda bisa meninjau & mengeditnya sebelum menyimpan.
            </p>
          </button>

          <button
            type="button"
            disabled={generating}
            onClick={() => onManual(period)}
            className="text-left rounded-lg border p-5 transition hover:border-[#1e5f3f] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/70 mb-3">
              <PencilLine className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">Buat Manual</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tulis ringkasan, isu, dan action items sendiri. Refine nada bahasa dengan AI saat menulis.
            </p>
          </button>
        </div>
      )}
    </div>
  )
}
