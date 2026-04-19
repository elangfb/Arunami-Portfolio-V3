import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import { formatPeriod } from '@/lib/dateUtils'
import { recordConfigChange } from '@/lib/firestore'
import type {
  PortfolioConfig, InvestorConfigUnion, ConfigChangeKind,
} from '@/types'
import type { SectionUser } from './types'

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
  reasonRequired?: boolean
  onSaved: () => Promise<void> | void
  children: React.ReactNode
}

export default function EditConfigDialog({
  open, onOpenChange, title, portfolioId, currentUser, currentConfig,
  buildDraft, canSave, nextPeriod, reasonRequired = true, onSaved, children,
}: Props) {
  const [reasonText, setReasonText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setReasonText('') }, [open])

  const reasonValid = !reasonRequired || reasonText.trim().length > 0
  const saveEnabled = canSave && reasonValid && !saving && !!currentUser

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
        effectiveFromPeriod: nextPeriod,
        changedByUid: currentUser.uid,
        changedByName: currentUser.displayName,
      })
      toast.success('Perubahan berhasil disimpan')
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
              <span className="underline">{nextPeriod ? formatPeriod(nextPeriod) : '-'}</span>.
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
