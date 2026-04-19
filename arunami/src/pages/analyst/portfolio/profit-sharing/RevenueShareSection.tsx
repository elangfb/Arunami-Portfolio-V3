import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Banknote, Pencil } from 'lucide-react'
import EditConfigDialog from './EditConfigDialog'
import type { SectionProps } from './types'
import type { RevenueShareConfig } from '@/types'

export default function RevenueShareSection({
  config, investorConfig, portfolioId, currentUser, nextPeriod, onChanged,
}: SectionProps<RevenueShareConfig>) {
  const [open, setOpen] = useState(false)
  const sharePct = investorConfig.revenueSharePercent

  const [newShare, setNewShare] = useState(sharePct)
  useEffect(() => { if (open) setNewShare(sharePct) }, [open, sharePct])

  const valid = newShare >= 0 && newShare <= 100
  const canSave = valid && newShare !== sharePct

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-[#38a169]" />
            <CardTitle className="text-base">Revenue Share Saat Ini</CardTitle>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Ubah Share
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-[#38a169]">{sharePct}%</span>
            <span className="text-sm text-black">dari gross revenue untuk Investor</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Arunami Fee: {investorConfig.arunamiFeePercent}%</Badge>
          </div>
        </CardContent>
      </Card>

      <EditConfigDialog
        open={open}
        onOpenChange={setOpen}
        title="Ubah Revenue Share"
        portfolioId={portfolioId}
        currentUser={currentUser}
        currentConfig={config}
        nextPeriod={nextPeriod}
        canSave={canSave}
        buildDraft={() => ({
          newInvestorConfig: { ...investorConfig, revenueSharePercent: newShare },
          changeKind: 'revenue_share',
          fromValue: `${sharePct}%`,
          toValue: `${newShare}%`,
        })}
        onSaved={onChanged}
      >
        <div className="rounded-lg bg-muted p-3 text-sm">
          Saat ini: <span className="font-semibold">{sharePct}%</span> dari revenue
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Revenue Share (%)</Label>
          <Input
            type="number" min={0} max={100} step={0.1}
            value={newShare}
            onChange={e => setNewShare(Number(e.target.value))}
          />
        </div>
      </EditConfigDialog>
    </>
  )
}
