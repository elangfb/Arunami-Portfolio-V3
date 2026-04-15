import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getPortfolioConfig, getEquityHistory, updateInvestorShare,
} from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatPeriod, getNextReportingPeriod } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, PieChart as PieIcon, History, Pencil } from 'lucide-react'
import type {
  Portfolio, PortfolioConfig, EquityChangeEntry,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

function formatDate(seconds?: number): string {
  if (!seconds) return '-'
  const d = new Date(seconds * 1000)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProfitSharingPage() {
  const { portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [history, setHistory] = useState<EquityChangeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = async () => {
    if (!portfolioId) return
    setLoading(true)
    const [cfg, hist] = await Promise.all([
      getPortfolioConfig(portfolioId),
      getEquityHistory(portfolioId),
    ])
    setConfig(cfg)
    setHistory(hist)
    setLoading(false)
  }

  useEffect(() => { load() }, [portfolioId])

  const nextPeriod = useMemo(
    () => config ? getNextReportingPeriod(config.reportingFrequency) : null,
    [config],
  )

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>
  }
  if (!config) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Konfigurasi portfolio belum dibuat.
        </CardContent></Card>
      </div>
    )
  }

  const investorPct = config.investorConfig.investorSharePercent
  const arunamiPct = config.investorConfig.arunamiFeePercent
  const projectPct = Math.max(0, 100 - investorPct - arunamiPct)

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto text-black">
      <div>
        <h2 className="text-xl font-bold text-black">Profit Sharing Management</h2>
        <p className="text-sm text-black mt-1">
          Kelola pembagian profit investor untuk portfolio ini. Setiap perubahan dicatat untuk akuntabilitas.
        </p>
      </div>

      {/* Current Active Share */}
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
            <span className="text-sm text-black">untuk Investor</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Arunami Fee: {arunamiPct}%</Badge>
            <Badge variant="outline">Sisa Proyek: {projectPct}%</Badge>
            <Badge variant="outline">
              Frekuensi: {config.reportingFrequency}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Safe-guard warning */}
      <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-100 p-4">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700" />
        <div className="text-sm text-black font-bold">
          <p>
            Perubahan hanya berlaku untuk laporan mulai periode{' '}
            <span className="underline">{nextPeriod ? formatPeriod(nextPeriod) : '-'}</span>.
          </p>
          <p className="mt-1">
            Data historis dan laporan yang sudah dipublikasikan tidak akan diubah.
          </p>
        </div>
      </div>

      {/* Change History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-black" />
            <CardTitle className="text-base text-black">Riwayat Perubahan</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-black">
              Belum ada riwayat perubahan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-black">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-black">
                    <th className="py-2 pr-3 font-medium">Tanggal</th>
                    <th className="py-2 pr-3 font-medium">Diubah Oleh</th>
                    <th className="py-2 pr-3 font-medium">Dari → Menjadi</th>
                    <th className="py-2 pr-3 font-medium">Berlaku</th>
                    <th className="py-2 pr-3 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3 whitespace-nowrap">{formatDate(row.changedAt?.seconds)}</td>
                      <td className="py-3 pr-3">{row.changedByName}</td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                        {row.fromInvestorPercent}% → <span className="font-semibold text-[#38a169]">{row.toInvestorPercent}%</span>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">{formatPeriod(row.effectiveFromPeriod)}</td>
                      <td className="py-3 pr-3">
                        <div className="text-black">{row.reasonNote || '-'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditShareDialog
        open={open}
        onOpenChange={setOpen}
        config={config}
        nextPeriod={nextPeriod ?? ''}
        onSaved={async () => { setOpen(false); await load() }}
        currentUser={user}
        portfolioId={portfolioId ?? ''}
      />
    </div>
  )
}

// ─── Edit Share Dialog ─────────────────────────────────────────────────

interface EditShareDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  config: PortfolioConfig
  nextPeriod: string
  onSaved: () => void
  currentUser: { uid: string; displayName: string } | null
  portfolioId: string
}

function EditShareDialog({
  open, onOpenChange, config, nextPeriod, onSaved, currentUser, portfolioId,
}: EditShareDialogProps) {
  const currentInvestor = config.investorConfig.investorSharePercent
  const currentArunami = config.investorConfig.arunamiFeePercent

  const [newInvestor, setNewInvestor] = useState<number>(currentInvestor)
  const [newArunami, setNewArunami] = useState<number>(currentArunami)
  const [reasonText, setReasonText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNewInvestor(currentInvestor)
      setNewArunami(currentArunami)
      setReasonText('')
    }
  }, [open, currentInvestor, currentArunami])

  const totalValid = newInvestor + newArunami <= 100
  const unchanged = newInvestor === currentInvestor && newArunami === currentArunami
  const reasonValid = reasonText.trim().length > 0
  const canSave = totalValid && !unchanged && reasonValid && !saving

  const handleSave = async () => {
    if (!currentUser || !portfolioId) return
    if (!canSave) return
    setSaving(true)
    try {
      await updateInvestorShare({
        portfolioId,
        currentConfig: config,
        newInvestorPercent: newInvestor,
        newArunamiPercent: newArunami,
        reasonCategory: 'other',
        reasonNote: reasonText,
        effectiveFromPeriod: nextPeriod,
        changedByUid: currentUser.uid,
        changedByName: currentUser.displayName,
      })
      toast.success('Investor share berhasil diubah')
      onSaved()
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
          <DialogTitle>Ubah Investor Share</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-lg bg-muted p-3 text-sm">
            Saat ini: <span className="font-semibold">{currentInvestor}%</span> investor ·{' '}
            <span className="font-semibold">{currentArunami}%</span> Arunami fee
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

          <div className="space-y-1">
            <Label className="text-xs text-black">Alasan Perubahan *</Label>
            <Textarea
              rows={4}
              placeholder="Contoh: Milestone 24 bulan tercapai, payback period tercapai, negosiasi ulang kontrak investor..."
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              className="text-black"
            />
          </div>

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
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
