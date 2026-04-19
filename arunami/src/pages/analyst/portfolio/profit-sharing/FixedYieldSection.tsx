import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { TrendingUp, Pencil } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import type { SectionProps } from './types'
import type { FixedYieldConfig } from '@/types'

const PRINCIPAL_LABEL: Record<FixedYieldConfig['principalReference'], string> = {
  invested_amount: 'Invested Amount',
  investasi_awal: 'Investasi Awal',
}

export default function FixedYieldSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<FixedYieldConfig>) {
  const [open, setOpen] = useState(false)
  const yieldPct = investorConfig.fixedYieldPercent
  const principalRef = investorConfig.principalReference

  const [newYield, setNewYield] = useState(yieldPct)
  const [newRef, setNewRef] = useState<FixedYieldConfig['principalReference']>(principalRef)

  useEffect(() => {
    if (open) {
      setNewYield(yieldPct)
      setNewRef(principalRef)
    }
  }, [open, yieldPct, principalRef])

  const valid = newYield >= 0 && newYield <= 100
  const unchanged = newYield === yieldPct && newRef === principalRef
  const canSave = valid && !unchanged

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Fixed Yield Saat Ini</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Ubah Yield
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-[#38a169]">{yieldPct}%</span>
            <span className="text-sm text-black">yield tetap per periode</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Basis: {PRINCIPAL_LABEL[principalRef]}</Badge>
            <Badge variant="outline">Arunami Fee: {investorConfig.arunamiFeePercent}%</Badge>
          </div>
        </CardContent>
      </Card>

      <EditConfigDialog
        open={open}
        onOpenChange={setOpen}
        title="Ubah Fixed Yield"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => ({
          newInvestorConfig: {
            ...investorConfig,
            fixedYieldPercent: newYield,
            principalReference: newRef,
          },
          changeKind: 'fixed_yield',
          fromValue: `${yieldPct}% @ ${PRINCIPAL_LABEL[principalRef]}`,
          toValue: `${newYield}% @ ${PRINCIPAL_LABEL[newRef]}`,
        })}
        onSaved={onChanged}
      >
        <div className="rounded-lg bg-muted p-3 text-sm">
          Saat ini: <span className="font-semibold">{yieldPct}%</span> yield ·{' '}
          basis <span className="font-semibold">{PRINCIPAL_LABEL[principalRef]}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Fixed Yield (%)</Label>
            <Input
              type="number" min={0} max={100} step={0.1}
              value={newYield}
              onChange={e => setNewYield(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Basis Principal</Label>
            <Select
              value={newRef}
              onValueChange={v => setNewRef(v as FixedYieldConfig['principalReference'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invested_amount">Invested Amount</SelectItem>
                <SelectItem value="investasi_awal">Investasi Awal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </EditConfigDialog>
    </>
  )
}
