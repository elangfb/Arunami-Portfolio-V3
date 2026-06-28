import { useState, type ReactNode } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface OverrideSectionProps {
  title: string
  description?: string
  /** Whether the section currently has unsaved edits. Save is gated on this. */
  dirty: boolean
  /** Persist the edits. Receives the validated reason note. Throws to signal failure. */
  onSave: (reason: string) => Promise<void>
  /** Revert local edits back to the loaded values. */
  onReset?: () => void
  defaultOpen?: boolean
  saveLabel?: string
  children: ReactNode
}

/**
 * Collapsible "danger zone" card used by the admin override pages. Wraps a block
 * of editable fields with a required reason note + Save/Reset controls. The
 * parent owns the field state and reports `dirty`; this component owns the reason
 * text and the saving lifecycle, and clears the reason after a successful save.
 */
export default function OverrideSection({
  title, description, dirty, onSave, onReset,
  defaultOpen = false, saveLabel = 'Simpan Override', children,
}: OverrideSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const reasonValid = reason.trim().length > 0
  const canSave = dirty && reasonValid && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(reason.trim())
      setReason('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            {dirty && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Belum disimpan
              </span>
            )}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          {children}

          <div className="space-y-1">
            <Label className="text-xs">Alasan Override *</Label>
            <Textarea
              rows={2}
              placeholder="Contoh: koreksi salah input analis untuk revenue Maret 2025..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            {dirty && !reasonValid && (
              <p className="text-xs text-amber-600">Wajib isi alasan sebelum menyimpan.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Perubahan langsung menimpa data & tercatat di log audit.</span>
            </div>
            <div className="flex gap-2">
              {onReset && (
                <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={!dirty || saving}>
                  Reset
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
                {saving ? 'Menyimpan...' : saveLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
