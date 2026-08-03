import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  getAllUsers, getBagiHasilManualEntries, getTransferProofsForInvestor,
  createBagiHasilManualEntry, updateBagiHasilManualEntry, deleteBagiHasilManualEntry,
  updatePortfolioConfigFields,
} from '@/lib/firestore'
import { formatCurrencyExact } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Coins, FileImage } from 'lucide-react'
import ProofDropzone from '@/components/investor/ProofDropzone'
import type { Portfolio, PortfolioConfig, BagiHasilManualEntry } from '@/types'

interface ResumeRow {
  key: string
  period: string
  bagiHasil: number
  principal: number | null
  source: 'manual' | 'otomatis'
  proofUrl?: string | null
  entry?: BagiHasilManualEntry
}

interface EditState {
  id: string | null // null = new
  period: string
  bagiHasilAmount: string
  principalAmount: string
  notes: string
  file: File | null
  existingStoragePath?: string
  hasExistingFile: boolean
}

const emptyEdit: EditState = {
  id: null, period: '', bagiHasilAmount: '', principalAmount: '', notes: '',
  file: null, hasExistingFile: false,
}

export default function BagiHasilResumeSection({
  portfolio, portfolioId, config, currentUser, onChanged,
}: {
  portfolio: Portfolio | null
  portfolioId: string
  config: PortfolioConfig
  currentUser: { uid: string; displayName: string } | null
  onChanged: () => Promise<void>
}) {
  const returnsPrincipal = !!config.returnsPrincipal
  const [togglingPrincipal, setTogglingPrincipal] = useState(false)

  const [investorNames, setInvestorNames] = useState<Record<string, string>>({})
  const [selectedInvestor, setSelectedInvestor] = useState<string>('')
  const [manualEntries, setManualEntries] = useState<BagiHasilManualEntry[]>([])
  const [linkedRows, setLinkedRows] = useState<ResumeRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const assignedInvestors = portfolio?.assignedInvestors ?? []

  // Resolve investor uid → name once.
  useEffect(() => {
    if (assignedInvestors.length === 0) return
    getAllUsers().then(users => {
      const map: Record<string, string> = {}
      for (const u of users) map[u.uid] = u.displayName
      setInvestorNames(map)
    })
    setSelectedInvestor(prev => prev || assignedInvestors[0])
  }, [portfolio])

  const loadRows = async (investorUid: string) => {
    if (!investorUid) return
    setLoadingRows(true)
    const [manual, proofs] = await Promise.all([
      getBagiHasilManualEntries(portfolioId, investorUid),
      getTransferProofsForInvestor(investorUid),
    ])
    setManualEntries(manual)
    setLinkedRows(
      proofs
        .filter(p => p.portfolioId === portfolioId)
        .map(p => ({
          key: `proof_${p.id}`,
          period: p.period,
          bagiHasil: p.amount,
          principal: p.principalAmount ?? null,
          source: 'otomatis' as const,
          proofUrl: p.fileUrl,
        })),
    )
    setLoadingRows(false)
  }

  useEffect(() => {
    if (selectedInvestor) loadRows(selectedInvestor)
  }, [selectedInvestor, portfolioId])

  const rows: ResumeRow[] = useMemo(() => {
    const manualRows: ResumeRow[] = manualEntries.map(m => ({
      key: `manual_${m.id}`,
      period: m.period,
      bagiHasil: m.bagiHasilAmount,
      principal: m.principalAmount,
      source: 'manual',
      proofUrl: m.fileUrl ?? null,
      entry: m,
    }))
    // DF-01: manual entry wins on a period collision — drop the automated proof
    // row for any period that also has a manual entry, so totals count once.
    const manualPeriods = new Set(manualEntries.map(m => m.period))
    const dedupedLinked = linkedRows.filter(r => !manualPeriods.has(r.period))
    return [...manualRows, ...dedupedLinked].sort((a, b) => comparePeriods(b.period, a.period))
  }, [manualEntries, linkedRows])

  const togglePrincipal = async () => {
    setTogglingPrincipal(true)
    try {
      await updatePortfolioConfigFields(portfolioId, { returnsPrincipal: !returnsPrincipal })
      await onChanged()
      toast.success(returnsPrincipal ? 'Kolom pengembalian pokok dinonaktifkan.' : 'Kolom pengembalian pokok diaktifkan.')
    } catch (e) {
      console.error(e)
      toast.error('Gagal memperbarui pengaturan.')
    } finally {
      setTogglingPrincipal(false)
    }
  }

  const openAdd = () => setEdit({ ...emptyEdit })
  const openEdit = (m: BagiHasilManualEntry) => setEdit({
    id: m.id,
    period: m.period,
    bagiHasilAmount: String(m.bagiHasilAmount),
    principalAmount: m.principalAmount != null ? String(m.principalAmount) : '',
    notes: m.notes,
    file: null,
    existingStoragePath: m.storagePath,
    hasExistingFile: !!m.fileUrl,
  })

  const saveEntry = async () => {
    if (!edit || !currentUser || !selectedInvestor) return
    if (!/^\d{4}-\d{2}$/.test(edit.period)) { toast.error('Pilih periode (bulan) yang valid.'); return }
    const bagiHasil = Number(edit.bagiHasilAmount)
    if (!(bagiHasil > 0)) { toast.error('Nominal bagi hasil harus lebih dari 0.'); return }
    const principal = returnsPrincipal && edit.principalAmount.trim() !== ''
      ? Number(edit.principalAmount)
      : null
    if (principal != null && !(principal >= 0)) { toast.error('Nominal pengembalian pokok tidak valid.'); return }

    setSaving(true)
    try {
      if (edit.id) {
        await updateBagiHasilManualEntry(
          edit.id,
          {
            period: edit.period,
            bagiHasilAmount: bagiHasil,
            principalAmount: principal,
            notes: edit.notes.trim(),
          },
          edit.file
            ? { file: edit.file, investorUid: selectedInvestor, oldStoragePath: edit.existingStoragePath }
            : undefined,
        )
      } else {
        await createBagiHasilManualEntry({
          portfolioId,
          portfolioName: portfolio?.name ?? '',
          investorUid: selectedInvestor,
          investorName: investorNames[selectedInvestor] ?? '',
          period: edit.period,
          bagiHasilAmount: bagiHasil,
          principalAmount: principal,
          notes: edit.notes.trim(),
          file: edit.file,
          createdBy: currentUser.uid,
          createdByName: currentUser.displayName,
        })
      }
      setEdit(null)
      await loadRows(selectedInvestor)
      toast.success('Riwayat bagi hasil tersimpan.')
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = async (m: BagiHasilManualEntry) => {
    if (!confirm(`Hapus riwayat ${formatPeriod(m.period)}?`)) return
    try {
      await deleteBagiHasilManualEntry(m.id, m.storagePath)
      await loadRows(selectedInvestor)
      toast.success('Riwayat dihapus.')
    } catch { toast.error('Gagal menghapus.') }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4" /> Resume Bagi Hasil
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Catat riwayat bagi hasil yang dibayar sebelum portofolio masuk sistem. Periode berjalan
              terisi otomatis dari bukti transfer. Bukti transfer opsional — riwayat lama boleh
              dicatat nominalnya saja.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Principal toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Pengembalian Pokok Investasi</p>
            <p className="text-xs text-muted-foreground">
              Aktifkan jika portofolio ini mengembalikan pokok investasi. Saat aktif, kolom pokok muncul
              di resume investor & form di bawah.
            </p>
          </div>
          <Button
            variant={returnsPrincipal ? 'default' : 'outline'}
            size="sm"
            disabled={togglingPrincipal}
            onClick={togglePrincipal}
          >
            {returnsPrincipal ? 'Aktif' : 'Nonaktif'}
          </Button>
        </div>

        {assignedInvestors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada investor yang ditugaskan ke portofolio ini.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <Label className="text-xs">Investor</Label>
                <Select value={selectedInvestor} onValueChange={setSelectedInvestor}>
                  <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Pilih investor" /></SelectTrigger>
                  <SelectContent>
                    {assignedInvestors.map(uid => (
                      <SelectItem key={uid} value={uid}>{investorNames[uid] ?? uid}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={openAdd} disabled={!selectedInvestor}>
                <Plus className="mr-1.5 h-4 w-4" /> Tambah Riwayat Manual
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                  <TableRow>
                    <TableHead className="text-left py-2.5 px-3 font-medium">Periode</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium">Bagi Hasil</TableHead>
                    {returnsPrincipal && <TableHead className="text-right py-2.5 px-3 font-medium">Pengembalian Pokok</TableHead>}
                    <TableHead className="text-left py-2.5 px-3 font-medium">Sumber</TableHead>
                    <TableHead className="text-right py-2.5 px-3 font-medium w-24">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRows ? (
                    <TableRow><TableCell colSpan={returnsPrincipal ? 5 : 4} className="py-6 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={returnsPrincipal ? 5 : 4} className="py-6 text-center text-muted-foreground">Belum ada catatan.</TableCell></TableRow>
                  ) : rows.map(row => (
                    <TableRow key={row.key} className="hover:bg-muted/30">
                      <TableCell className="py-2.5 px-3 font-medium">{formatPeriod(row.period)}</TableCell>
                      <TableCell className="py-2.5 px-3 text-right">{formatCurrencyExact(row.bagiHasil)}</TableCell>
                      {returnsPrincipal && (
                        <TableCell className="py-2.5 px-3 text-right">
                          {row.principal != null ? formatCurrencyExact(row.principal) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="py-2.5 px-3">
                        {row.proofUrl ? (
                          <a href={row.proofUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#1e5f3f] hover:underline">
                            <FileImage className="h-3.5 w-3.5" />
                            <Badge variant="outline" className="text-[10px]">
                              {row.source === 'manual' ? 'Manual' : 'Otomatis'}
                            </Badge>
                          </a>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {row.source === 'manual' ? 'Manual' : 'Otomatis'}
                            </Badge>
                            {/* Internal-only marker — deliberately absent from every investor-facing view. */}
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]"
                              title="Nominal dicatat tanpa lampiran bukti transfer. Tanda ini hanya terlihat oleh tim."
                            >
                              Tanpa Bukti
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right">
                        {row.entry ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(row.entry!)} className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => removeEntry(row.entry!)} className="h-7 w-7 text-red-500 hover:text-red-700" title="Hapus">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              Tanda <span className="font-medium text-amber-700">Tanpa Bukti</span> menandai entri yang
              dicatat nominalnya saja. Tanda ini internal — investor hanya melihat periode dan nominalnya.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{edit?.id ? 'Edit Riwayat Bagi Hasil' : 'Tambah Riwayat Bagi Hasil'}</DialogTitle>
            <DialogDescription>
              {investorNames[selectedInvestor] ?? selectedInvestor} · {portfolio?.name}
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bh-period">Periode</Label>
                <Input id="bh-period" type="month" value={edit.period}
                  onChange={e => setEdit({ ...edit, period: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bh-amount">Nominal Bagi Hasil (Rp)</Label>
                <Input id="bh-amount" type="number" min="0" step="1" placeholder="Contoh: 1500000"
                  value={edit.bagiHasilAmount}
                  onChange={e => setEdit({ ...edit, bagiHasilAmount: e.target.value })} />
              </div>
              {returnsPrincipal && (
                <div className="space-y-1.5">
                  <Label htmlFor="bh-principal">Pengembalian Pokok (Rp) — opsional</Label>
                  <Input id="bh-principal" type="number" min="0" step="1" placeholder="Kosongkan jika tidak ada"
                    value={edit.principalAmount}
                    onChange={e => setEdit({ ...edit, principalAmount: e.target.value })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="bh-notes">Catatan (opsional)</Label>
                <Textarea id="bh-notes" rows={2} value={edit.notes}
                  onChange={e => setEdit({ ...edit, notes: e.target.value })} />
              </div>
              <ProofDropzone
                label={edit.id ? 'Bukti Transfer (ganti — opsional)' : 'Bukti Transfer (opsional)'}
                file={edit.file}
                onFile={(f) => setEdit({ ...edit, file: f })}
              />
              {edit.id && edit.hasExistingFile && !edit.file ? (
                <p className="text-xs text-muted-foreground">Bukti transfer saat ini tetap dipakai jika tidak diganti.</p>
              ) : !edit.file && (
                <p className="text-xs text-muted-foreground">
                  Boleh dikosongkan jika bukti transfernya sudah tidak ada. Entri tanpa bukti ditandai
                  di tabel ini saja — investor tidak melihat tandanya.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>Batal</Button>
            <Button onClick={saveEntry} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
