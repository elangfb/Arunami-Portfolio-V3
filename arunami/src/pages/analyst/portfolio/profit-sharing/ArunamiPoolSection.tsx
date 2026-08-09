import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Pencil } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import type { SectionProps } from './types'

/**
 * Arunami's share of the whole investor pool — the step between "how much of
 * the profit goes to investors" and "how much of that goes to *this* investor".
 *
 * Deliberately one card for every return model rather than a field inside each
 * model's own section: five of the seven models (fixed schedule, annual
 * dividend, custom, and the two legacy aliases) have no percentage editor at
 * all, so there would be nowhere to put it. Fixed Yield is the one model the
 * step does not apply to, and it renders disabled-with-a-reason rather than
 * hidden, so an analyst who has heard of the setting isn't left hunting for it.
 */
export default function ArunamiPoolSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, earliestPeriod, onChanged,
}: SectionProps) {
  const [open, setOpen] = useState(false)
  const currentPct = investorConfig.arunamiPoolPercent ?? 100
  const outsidePct = Math.max(0, 100 - currentPct)
  const isFixedYield = investorConfig.type === 'fixed_yield'

  const [newPct, setNewPct] = useState(currentPct)

  useEffect(() => {
    if (open) setNewPct(currentPct)
  }, [open, currentPct])

  // 0 is rejected here rather than in the engine: `arunamiPoolFraction` treats
  // it as "unset" so a stray 0 from an override form can't zero out payouts,
  // which would silently swallow a genuine 0 typed in this box.
  const valid = newPct > 0 && newPct <= 100
  const canSave = valid && newPct !== currentPct

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#3182ce]" />
            <CardTitle className="text-base">Porsi Investor Arunami</CardTitle>
          </div>
          {!isFixedYield && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />Ubah Porsi
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isFixedYield ? (
            <p className="text-sm text-muted-foreground">
              Tidak berlaku untuk Fixed Yield — yield dihitung dari modal masing-masing
              investor, bukan dari pembagian pool. Investor di luar Arunami tidak
              memengaruhi perhitungan ini.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold text-[#3182ce]">{currentPct}%</span>
                <span className="text-sm text-black">dari pool investor didanai investor Arunami</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">Investor Luar Arunami: {outsidePct}%</Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {outsidePct > 0
                  ? `Bagian pool investor dikalikan ${currentPct}% sebelum dibagi menurut kepemilikan. Sisa ${outsidePct}% milik investor di luar Arunami dan diselesaikan di luar platform ini.`
                  : 'Seluruh pool investor didanai investor Arunami, sehingga langkah ini tidak mengubah perhitungan.'}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {!isFixedYield && (
        <EditConfigDialog
          open={open}
          onOpenChange={setOpen}
          title="Ubah Porsi Investor Arunami"
          portfolioId={portfolioId}
          currentUser={currentUser}
          currentConfig={config}
          nextPeriod={nextPeriod}
          earliestPeriod={earliestPeriod}
          canSave={canSave}
          buildDraft={() => ({
            newInvestorConfig: { ...investorConfig, arunamiPoolPercent: newPct },
            changeKind: 'arunami_pool',
            fromValue: `${currentPct}%`,
            toValue: `${newPct}%`,
          })}
          onSaved={onChanged}
        >
          <div className="rounded-lg bg-muted p-3 text-sm">
            Saat ini: <span className="font-semibold">{currentPct}%</span> investor Arunami ·{' '}
            <span className="font-semibold">{outsidePct}%</span> investor luar
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Porsi Investor Arunami (%)</Label>
            <Input
              type="number" min={0.01} max={100} step={1}
              value={newPct}
              onChange={e => setNewPct(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Isi 100 bila seluruh pool investor didanai investor Arunami.
            </p>
          </div>
          {!valid && (
            <p className="text-xs text-red-600">
              Porsi harus lebih dari 0 dan maksimal 100%.
            </p>
          )}
          {valid && newPct < 100 && (
            <p className="text-xs text-amber-700">
              Bagi hasil setiap investor Arunami menjadi {newPct}% dari nilai sebelumnya,
              terhitung sejak periode yang Anda pilih di bawah.
            </p>
          )}
        </EditConfigDialog>
      )}
    </>
  )
}
