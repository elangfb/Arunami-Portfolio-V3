import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import { formatPeriod, listReportingPeriodsFrom } from '@/lib/dateUtils'
import { recordConfigChange, getAllInvestorReportsForPortfolio } from '@/lib/firestore'
import { backdateImpact } from '@/lib/reportStaleness'
import type {
  PortfolioConfig, InvestorConfigUnion, ConfigChangeKind, InvestorReportDoc,
} from '@/types'
import type { SectionUser } from './types'
import BackdateNotice from './BackdateNotice'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  portfolioId: string
  currentUser: SectionUser | null
  currentConfig: PortfolioConfig
  buildDraft: () => {
    newInvestorConfig: InvestorConfigUnion
    changeKind: ConfigChangeKind
    fromValue: string
    toValue: string
  } | null
  canSave: boolean
  nextPeriod: string
  /**
   * The portfolio's first month with data (YYYY-MM). Bounds how far back the
   * effective-period picker reaches; omit to offer upcoming periods only.
   */
  earliestPeriod?: string | null
  reasonRequired?: boolean
  onSaved: () => Promise<void> | void
  children: React.ReactNode
}

export default function EditConfigDialog({
  open, onOpenChange, title, portfolioId, currentUser, currentConfig,
  buildDraft, canSave, nextPeriod, earliestPeriod, reasonRequired = true,
  onSaved, children,
}: Props) {
  const [reasonText, setReasonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reports, setReports] = useState<InvestorReportDoc[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)

  // Past periods are offered too — see BackdateNotice for what guards them.
  const periodOptions = useMemo(
    () => listReportingPeriodsFrom(currentConfig.reportingFrequency, earliestPeriod, 12),
    [currentConfig.reportingFrequency, earliestPeriod],
  )
  // Default to the next period, never to a backdate: correcting history has to
  // be a deliberate act, not what happens when the analyst leaves it alone.
  const defaultPeriod = periodOptions.find(p => p >= nextPeriod) ?? nextPeriod
  const [effectiveFrom, setEffectiveFrom] = useState(defaultPeriod)

  useEffect(() => {
    if (!open) return
    setReasonText('')
    setEffectiveFrom(defaultPeriod)
    setAcknowledged(false)
  }, [open, defaultPeriod])

  // Loaded once per open so switching periods re-costs nothing.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReportsLoading(true)
    getAllInvestorReportsForPortfolio(portfolioId)
      .then(r => { if (!cancelled) setReports(r) })
      .catch(err => {
        console.error(err)
        if (!cancelled) setReports([])
      })
      .finally(() => { if (!cancelled) setReportsLoading(false) })
    return () => { cancelled = true }
  }, [open, portfolioId])

  const isBackdated = !!effectiveFrom && !!nextPeriod && effectiveFrom < nextPeriod
  const affectedCount = useMemo(
    () => backdateImpact(reports, effectiveFrom).reportCount,
    [reports, effectiveFrom],
  )
  const reasonValid = !reasonRequired || reasonText.trim().length > 0
  const saveEnabled = canSave && reasonValid && !!effectiveFrom && !saving
    && !!currentUser && (!isBackdated || acknowledged)

  const handleSave = async () => {
    if (!saveEnabled || !currentUser) return
    const draft = buildDraft()
    if (!draft) return
    setSaving(true)
    try {
      await recordConfigChange({
        portfolioId,
        currentConfig,
        newInvestorConfig: draft.newInvestorConfig,
        changeKind: draft.changeKind,
        fromValue: draft.fromValue,
        toValue: draft.toValue,
        reasonNote: reasonText,
        effectiveFromPeriod: effectiveFrom,
        changedByUid: currentUser.uid,
        changedByName: currentUser.displayName,
      })
      toast.success(
        affectedCount > 0
          ? `Perubahan disimpan. ${affectedCount} laporan investor perlu terbit ulang.`
          : 'Perubahan berhasil disimpan',
      )
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Gagal menyimpan perubahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {children}

          <div className="space-y-1">
            <Label className="text-xs text-black">Berlaku Mulai Periode *</Label>
            <Select value={effectiveFrom} onValueChange={setEffectiveFrom}>
              <SelectTrigger className="text-black">
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map(p => (
                  <SelectItem key={p} value={p}>
                    {formatPeriod(p)}
                    {p < nextPeriod ? ' — lampau' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Periode sebelum {formatPeriod(nextPeriod)} akan menghitung ulang
              laporan yang sudah lewat. Pilih hanya bila ketentuan lama memang salah.
            </p>
          </div>

          <BackdateNotice
            effectiveFrom={effectiveFrom}
            nextPeriod={nextPeriod}
            reports={reports}
            loading={reportsLoading}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
          />

          {reasonRequired && (
            <div className="space-y-1">
              <Label className="text-xs text-black">Alasan Perubahan *</Label>
              <Textarea
                rows={4}
                placeholder="Contoh: Milestone tercapai, negosiasi ulang kontrak investor..."
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                className="text-black"
              />
            </div>
          )}

          <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-700" />
            <div className="text-black font-bold">
              Perubahan berlaku mulai periode{' '}
              <span className="underline">{effectiveFrom ? formatPeriod(effectiveFrom) : '-'}</span>.
              Laporan periode sebelumnya tidak akan berubah.
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!saveEnabled}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
