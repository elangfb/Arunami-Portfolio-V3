import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getUser, updateUser,
  getAllocationsForInvestor, createAllocation, updateAllocation, deleteAllocation,
  getAllPortfolios,
  getBagiHasilManualEntriesForInvestor, updateBagiHasilManualEntry, deleteBagiHasilManualEntry,
  recordAdminOverride,
} from '@/lib/firestore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import OverrideSection from '@/components/admin/OverrideSection'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact } from '@/lib/utils'
import { makeBrandResolver } from '@/lib/portfolioName'
import { formatPeriod } from '@/lib/dateUtils'
import { ArrowLeft, AlertTriangle, Pencil, Trash2, UserPlus } from 'lucide-react'
import type {
  AppUser, InvestorAllocation, Portfolio, BagiHasilManualEntry, UserRole,
} from '@/types'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'investor', label: 'Investor' },
  { value: 'analyst', label: 'Analis' },
  { value: 'investor_relation', label: 'Investor Relation' },
  { value: 'admin', label: 'Admin' },
]

type LogFn = (section: string, summary: string, before: Record<string, unknown>, after: Record<string, unknown>, reason: string) => Promise<void>

export default function AdminInvestorOverride() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const actor = user ? { uid: user.uid, name: user.displayName } : null

  const [investor, setInvestor] = useState<AppUser | null>(null)
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [payouts, setPayouts] = useState<BagiHasilManualEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    if (!uid) return
    const [u, allocs, ptfs, entries] = await Promise.all([
      getUser(uid),
      getAllocationsForInvestor(uid),
      getAllPortfolios(),
      getBagiHasilManualEntriesForInvestor(uid),
    ])
    if (!u) {
      toast.error('Investor tidak ditemukan')
      navigate('/admin/investors')
      return
    }
    setInvestor(u)
    setAllocations(allocs)
    setPortfolios(ptfs)
    setPayouts(entries)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [uid])

  if (loading || !investor) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  const logOverride: LogFn = async (section, summary, before, after, reason) => {
    if (!actor) return
    await recordAdminOverride({
      scope: 'investor',
      targetId: investor.uid,
      targetLabel: investor.displayName,
      section, summary, before, after,
      reasonNote: reason,
      changedByUid: actor.uid,
      changedByName: actor.name,
    })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/investors/${investor.uid}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Override Data — {investor.displayName}</h1>
            <Badge variant="outline">{investor.email}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Koreksi profil, alokasi & riwayat bagi hasil investor secara manual.</p>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-800">Mode Override Admin</p>
          <p className="text-amber-700">Perubahan di halaman ini menimpa data investor dan dicatat dengan alasan di log audit.</p>
        </div>
      </div>

      <ProfileSection investor={investor} onSaved={loadAll} logOverride={logOverride} />

      <AllocationsSection investor={investor} allocations={allocations} portfolios={portfolios} onSaved={loadAll} logOverride={logOverride} />

      <PayoutsSection payouts={payouts} portfolios={portfolios} onSaved={loadAll} logOverride={logOverride} />
    </div>
  )
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileSection({ investor, onSaved, logOverride }: { investor: AppUser; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const initial = useMemo(() => ({
    displayName: investor.displayName,
    role: investor.role,
    isArunamiTeam: investor.isArunamiTeam ?? false,
  }), [investor])

  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async (reason: string) => {
    if (!form.displayName.trim()) { toast.error('Nama wajib diisi.'); throw new Error('invalid') }
    const patch = { displayName: form.displayName.trim(), role: form.role, isArunamiTeam: form.isArunamiTeam }
    try {
      await updateUser(investor.uid, patch)
      await logOverride('profile', 'Profil investor', initial, patch, reason)
      toast.success('Profil diperbarui')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'invalid' ? e.message : 'Gagal menyimpan profil')
      throw e
    }
  }

  return (
    <OverrideSection title="Profil Investor" description="Nama, peran & status tim Arunami" dirty={dirty} onSave={save} onReset={() => setForm(initial)} defaultOpen>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nama"><Input value={form.displayName} onChange={e => set('displayName', e.target.value)} /></Field>
        <Field label="Email (tidak dapat diubah di sini)"><Input value={investor.email} disabled /></Field>
        <Field label="Peran">
          <Select value={form.role} onValueChange={v => set('role', v as UserRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tim Arunami">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isArunamiTeam} onChange={e => set('isArunamiTeam', e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[#1e5f3f]" />
            Anggota tim Arunami
          </label>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Email login dikelola di sistem autentikasi dan tidak bisa diubah dari sini.</p>
    </OverrideSection>
  )
}

// ─── Allocations ────────────────────────────────────────────────────────────

function AllocationsSection({ investor, allocations, portfolios, onSaved, logOverride }: { investor: AppUser; allocations: InvestorAllocation[]; portfolios: Portfolio[]; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const [reason, setReason] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editPercent, setEditPercent] = useState('')
  const [newPid, setNewPid] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [busy, setBusy] = useState(false)

  const reasonValid = reason.trim().length > 0
  const available = portfolios.filter(p => !allocations.some(a => a.portfolioId === p.id))
  const resolveBrand = useMemo(() => makeBrandResolver(portfolios), [portfolios])

  const requireReason = () => {
    if (!reasonValid) { toast.error('Isi alasan override terlebih dahulu.'); return false }
    return true
  }

  const startEdit = (a: InvestorAllocation) => {
    setEditId(a.id); setEditAmount(String(a.investedAmount)); setEditPercent(String(a.ownershipPercent ?? ''))
  }

  const saveEdit = async (a: InvestorAllocation) => {
    if (!requireReason()) return
    const amount = Number(editAmount); const percent = Number(editPercent)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Jumlah dan persentase harus valid.'); return
    }
    setBusy(true)
    try {
      await updateAllocation(a.id, { investedAmount: amount, ownershipPercent: percent }, a.portfolioId)
      await logOverride('allocation', `Alokasi ${a.portfolioName}`,
        { investedAmount: a.investedAmount, ownershipPercent: a.ownershipPercent ?? null },
        { investedAmount: amount, ownershipPercent: percent }, reason.trim())
      toast.success('Alokasi diperbarui'); setEditId(null); setReason(''); await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui alokasi')
    } finally { setBusy(false) }
  }

  const add = async () => {
    if (!requireReason()) return
    const ptf = portfolios.find(p => p.id === newPid)
    const amount = Number(newAmount); const percent = Number(newPercent)
    if (!ptf || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Pilih portofolio & isi jumlah/persentase dengan benar.'); return
    }
    setBusy(true)
    try {
      await createAllocation({
        investorUid: investor.uid, investorName: investor.displayName, investorEmail: investor.email,
        portfolioId: ptf.id, portfolioName: ptf.name, portfolioCode: ptf.code,
        investedAmount: amount, ownershipPercent: percent,
      })
      await logOverride('allocation', `Tambah alokasi ${ptf.name}`, {}, { investedAmount: amount, ownershipPercent: percent }, reason.trim())
      toast.success(`Alokasi ke ${ptf.name} ditambahkan`)
      setNewPid(''); setNewAmount(''); setNewPercent(''); setReason(''); await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambahkan alokasi')
    } finally { setBusy(false) }
  }

  const remove = async (a: InvestorAllocation) => {
    if (!requireReason()) return
    if (!window.confirm(`Hapus alokasi di ${a.portfolioName}?`)) return
    setBusy(true)
    try {
      await deleteAllocation(a.id, a.portfolioId)
      await logOverride('allocation', `Hapus alokasi ${a.portfolioName}`,
        { investedAmount: a.investedAmount, ownershipPercent: a.ownershipPercent ?? null }, {}, reason.trim())
      toast.success('Alokasi dihapus'); setReason(''); await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus alokasi')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Alokasi Portofolio</p>
        <p className="text-xs text-muted-foreground">Investasi & kepemilikan investor di tiap portofolio</p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1">
          <Label className="text-xs">Alasan Override * <span className="font-normal text-muted-foreground">(berlaku untuk aksi tambah/edit/hapus di bawah)</span></Label>
          <Textarea rows={2} placeholder="Contoh: koreksi jumlah investasi..." value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        {allocations.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table className="text-sm">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-left py-2 px-3 font-medium">Portofolio</TableHead>
                  <TableHead className="text-right py-2 px-3 font-medium">Investasi</TableHead>
                  <TableHead className="text-center py-2 px-3 font-medium">Persentase</TableHead>
                  <TableHead className="text-right py-2 px-3 font-medium w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {allocations.map(a => {
                  const editing = editId === a.id
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/30">
                      <TableCell className="py-2.5 px-3">
                        <p className="font-medium">{resolveBrand({ id: a.portfolioId, ptName: a.portfolioName })}</p>
                        <p className="text-xs text-muted-foreground">{a.portfolioCode}</p>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right">
                        {editing
                          ? <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="h-8 w-32 text-right ml-auto" />
                          : formatCurrencyCompact(a.investedAmount)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-center">
                        {editing
                          ? <Input type="number" value={editPercent} onChange={e => setEditPercent(e.target.value)} className="h-8 w-20 text-center mx-auto" />
                          : (a.ownershipPercent != null ? `${a.ownershipPercent}%` : '—')}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right">
                        {editing ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditId(null)} disabled={busy}>Batal</Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(a)} disabled={busy}>Simpan</Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(a)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(a)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">Belum ada alokasi.</p>
        )}

        <div className="rounded-md border p-3 space-y-3">
          <p className="text-xs font-medium">Tambah Alokasi ke Portofolio</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Portofolio">
              <Select value={newPid} onValueChange={setNewPid}>
                <SelectTrigger><SelectValue placeholder="Pilih portofolio..." /></SelectTrigger>
                <SelectContent>
                  {available.length === 0
                    ? <div className="px-3 py-2 text-xs text-muted-foreground">Sudah dialokasikan ke semua portofolio</div>
                    : available.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Jumlah Investasi (IDR)"><Input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} /></Field>
            <Field label="Persentase (%)"><Input type="number" value={newPercent} onChange={e => setNewPercent(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={busy || !newPid}><UserPlus className="mr-1 h-4 w-4" />Tambah</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bagi hasil / payout entries ─────────────────────────────────────────────

function PayoutsSection({ payouts, portfolios, onSaved, logOverride }: { payouts: BagiHasilManualEntry[]; portfolios: Portfolio[]; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const resolveBrand = useMemo(() => makeBrandResolver(portfolios), [portfolios])
  const [reason, setReason] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editPrincipal, setEditPrincipal] = useState('')
  const [editPeriod, setEditPeriod] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const reasonValid = reason.trim().length > 0
  const requireReason = () => {
    if (!reasonValid) { toast.error('Isi alasan override terlebih dahulu.'); return false }
    return true
  }

  const startEdit = (e: BagiHasilManualEntry) => {
    setEditId(e.id)
    setEditAmount(String(e.bagiHasilAmount))
    setEditPrincipal(e.principalAmount != null ? String(e.principalAmount) : '')
    setEditPeriod(e.period)
    setEditNotes(e.notes ?? '')
  }

  const saveEdit = async (e: BagiHasilManualEntry) => {
    if (!requireReason()) return
    const amount = Number(editAmount)
    if (!Number.isFinite(amount) || amount < 0) { toast.error('Jumlah bagi hasil tidak valid.'); return }
    if (!/^\d{4}-\d{2}$/.test(editPeriod)) { toast.error('Periode harus format YYYY-MM.'); return }
    const principal = editPrincipal.trim() === '' ? null : Number(editPrincipal)
    if (principal != null && (!Number.isFinite(principal) || principal < 0)) { toast.error('Pokok tidak valid.'); return }
    if (amount === 0 && (principal ?? 0) === 0) { toast.error('Isi minimal salah satu: bagi hasil atau pokok.'); return }
    setBusy(true)
    try {
      const patch = { bagiHasilAmount: amount, principalAmount: principal, period: editPeriod, notes: editNotes }
      await updateBagiHasilManualEntry(e.id, patch)
      await logOverride('payout', `Bagi hasil ${formatPeriod(e.period)} — ${e.portfolioName}`,
        { bagiHasilAmount: e.bagiHasilAmount, principalAmount: e.principalAmount, period: e.period, notes: e.notes },
        patch, reason.trim())
      toast.success('Entri bagi hasil diperbarui'); setEditId(null); setReason(''); await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui entri')
    } finally { setBusy(false) }
  }

  const remove = async (e: BagiHasilManualEntry) => {
    if (!requireReason()) return
    if (!window.confirm(`Hapus entri bagi hasil ${formatPeriod(e.period)} (${e.portfolioName})?`)) return
    setBusy(true)
    try {
      await deleteBagiHasilManualEntry(e.id, e.storagePath)
      await logOverride('payout', `Hapus bagi hasil ${formatPeriod(e.period)} — ${e.portfolioName}`,
        { bagiHasilAmount: e.bagiHasilAmount, principalAmount: e.principalAmount, period: e.period }, {}, reason.trim())
      toast.success('Entri dihapus'); setReason(''); await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus entri')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Riwayat Bagi Hasil (Manual)</p>
        <p className="text-xs text-muted-foreground">Koreksi entri bagi hasil/pokok yang di-backfill. Pembuatan entri baru tetap melalui modul IR.</p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1">
          <Label className="text-xs">Alasan Override * <span className="font-normal text-muted-foreground">(berlaku untuk aksi edit/hapus di bawah)</span></Label>
          <Textarea rows={2} placeholder="Contoh: koreksi nominal bagi hasil yang salah input..." value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        {payouts.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-2">Belum ada entri bagi hasil manual.</p>
        ) : (
          <div className="space-y-2">
            {payouts.map(e => {
              const editing = editId === e.id
              return (
                <div key={e.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {resolveBrand({ id: e.portfolioId, ptName: e.portfolioName })} — {formatPeriod(e.period)}
                        {/* Internal-only marker — never shown on investor-facing views. */}
                        {!e.fileUrl && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-[10px] font-normal text-amber-700"
                            title="Nominal dicatat tanpa lampiran bukti transfer. Tanda ini hanya terlihat oleh tim."
                          >
                            Tanpa Bukti
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Bagi hasil {formatCurrencyCompact(e.bagiHasilAmount)}
                        {e.principalAmount != null && ` · Pokok ${formatCurrencyCompact(e.principalAmount)}`}
                      </p>
                    </div>
                    {!editing && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(e)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>

                  {editing && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="Periode (YYYY-MM)"><Input value={editPeriod} onChange={ev => setEditPeriod(ev.target.value)} /></Field>
                        <Field label="Bagi Hasil (IDR)"><Input type="number" value={editAmount} onChange={ev => setEditAmount(ev.target.value)} /></Field>
                        <Field label="Pokok (IDR, kosongkan jika tidak ada)"><Input type="number" value={editPrincipal} onChange={ev => setEditPrincipal(ev.target.value)} /></Field>
                      </div>
                      <Field label="Catatan"><Textarea rows={2} value={editNotes} onChange={ev => setEditNotes(ev.target.value)} /></Field>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)} disabled={busy}>Batal</Button>
                        <Button size="sm" onClick={() => saveEdit(e)} disabled={busy}>Simpan</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Small field wrapper ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
