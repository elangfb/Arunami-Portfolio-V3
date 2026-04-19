import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PieChart as PieIcon, Pencil } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import type { SectionProps } from './types'
import type { NetProfitShareConfig, PercentageBasedConfig, FixedReturnConfig } from '@/types'

type Cfg = NetProfitShareConfig | PercentageBasedConfig | FixedReturnConfig

export default function NetProfitShareSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<Cfg>) {
  const [open, setOpen] = useState(false)
  const investorPct = investorConfig.investorSharePercent
  const arunamiPct = investorConfig.arunamiFeePercent
  const projectPct = Math.max(0, 100 - investorPct - arunamiPct)

  const [newInvestor, setNewInvestor] = useState(investorPct)
  const [newArunami, setNewArunami] = useState(arunamiPct)

  useEffect(() => {
    if (open) {
      setNewInvestor(investorPct)
      setNewArunami(arunamiPct)
    }
  }, [open, investorPct, arunamiPct])

  const totalValid = newInvestor + newArunami <= 100
  const unchanged = newInvestor === investorPct && newArunami === arunamiPct
  const canSave = totalValid && !unchanged

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Investor Share Saat Ini</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Ubah Share
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-[#38a169]">{investorPct}%</span>
            <span className="text-sm text-black">dari net profit untuk Investor</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Arunami Fee: {arunamiPct}%</Badge>
            <Badge variant="outline">Sisa Proyek: {projectPct}%</Badge>
          </div>
        </CardContent>
      </Card>

      <EditConfigDialog
        open={open}
        onOpenChange={setOpen}
        title="Ubah Investor Share"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => ({
          newInvestorConfig: {
            ...investorConfig,
            investorSharePercent: newInvestor,
            arunamiFeePercent: newArunami,
          },
          changeKind: 'investor_share',
          fromValue: `${investorPct}% / fee ${arunamiPct}%`,
          toValue: `${newInvestor}% / fee ${newArunami}%`,
        })}
        onSaved={onChanged}
      >
        <div className="rounded-lg bg-muted p-3 text-sm">
          Saat ini: <span className="font-semibold">{investorPct}%</span> investor ·{' '}
          <span className="font-semibold">{arunamiPct}%</span> Arunami fee
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Investor Share (%)</Label>
            <Input
              type="number" min={0} max={100} step={1}
              value={newInvestor}
              onChange={e => setNewInvestor(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arunami Fee (%)</Label>
            <Input
              type="number" min={0} max={100} step={1}
              value={newArunami}
              onChange={e => setNewArunami(Number(e.target.value))}
            />
          </div>
        </div>
        {!totalValid && (
          <p className="text-xs text-red-600">
            Total Investor + Arunami tidak boleh melebihi 100%.
          </p>
        )}
      </EditConfigDialog>
    </>
  )
}
