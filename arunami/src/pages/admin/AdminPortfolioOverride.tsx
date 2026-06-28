import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getPortfolio, updatePortfolio,
  getPortfolioConfig, getPortfolioConfigOrDefault, savePortfolioConfig, updatePortfolioConfigFields,
  getAllUsers,
  getAllocationsForPortfolio, createAllocation, updateAllocation, deleteAllocation,
  getReports, updateReport, syncFinancialData,
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
import OverrideSection from '@/components/admin/OverrideSection'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact } from '@/lib/utils'
import { formatPeriod } from '@/lib/dateUtils'
import { ArrowLeft, AlertTriangle, Pencil, Trash2, UserPlus } from 'lucide-react'
import type {
  Portfolio, PortfolioConfig, InvestorAllocation, AppUser, PortfolioReport,
  PnLExtractedData, ProjectionExtractedData, IndustryType, ReportingFrequency,
} from '@/types'

const INDUSTRY_OPTIONS: { value: IndustryType; label: string }[] = [
  { value: 'retail', label: 'Retail' },
  { value: 'saas', label: 'SaaS' },
  { value: 'fnb', label: 'F&B' },
  { value: 'jasa', label: 'Jasa' },
  { value: 'manufaktur', label: 'Manufaktur' },
  { value: 'lainnya', label: 'Lainnya' },
]

const FREQ_OPTIONS: { value: ReportingFrequency; label: string }[] = [
  { value: 'bulanan', label: 'Bulanan' },
  { value: 'kuartalan', label: 'Kuartalan' },
  { value: 'semesteran', label: 'Semesteran' },
]

// Editable scalar fields per report type. Arrays (opex, customCategories) are
// preserved untouched — the analyst PnL/Projection pages own line-item editing.
const PNL_FIELDS: { key: keyof PnLExtractedData; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogs', label: 'COGS' },
  { key: 'grossProfit', label: 'Gross Profit' },
  { key: 'totalOpex', label: 'Total Opex' },
  { key: 'operatingProfit', label: 'Operating Profit' },
  { key: 'interest', label: 'Interest' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'netProfit', label: 'Net Profit' },
]

const PROJ_FIELDS: { key: keyof ProjectionExtractedData; label: string }[] = [
  { key: 'projectedRevenue', label: 'Proyeksi Revenue' },
  { key: 'projectedCogsPercent', label: 'Proyeksi COGS %' },
  { key: 'projectedCogs', label: 'Proyeksi COGS' },
  { key: 'projectedGrossProfit', label: 'Proyeksi Gross Profit' },
  { key: 'projectedTotalOpex', label: 'Proyeksi Total Opex' },
  { key: 'projectedDepreciationAmortization', label: 'Depresiasi & Amortisasi' },
  { key: 'projectedTax', label: 'Pajak' },
  { key: 'projectedNetProfit', label: 'Proyeksi Net Profit' },
]

export default function AdminPortfolioOverride() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const actor = user ? { uid: user.uid, name: user.displayName } : null

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [configExists, setConfigExists] = useState(false)
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [investors, setInvestors] = useState<AppUser[]>([])
  const [pnlReports, setPnlReports] = useState<PortfolioReport[]>([])
  const [projReports, setProjReports] = useState<PortfolioReport[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    if (!id) return
    const [p, rawCfg, cfg, allocs, users, pnls, projs] = await Promise.all([
      getPortfolio(id),
      getPortfolioConfig(id),
      getPortfolioConfigOrDefault(id),
      getAllocationsForPortfolio(id),
      getAllUsers(),
      getReports(id, 'pnl'),
      getReports(id, 'projection'),
    ])
    if (!p) {
      toast.error('Portofolio tidak ditemukan')
      navigate('/admin/portfolios')
      return
    }
    setPortfolio(p)
    setConfigExists(!!rawCfg)
    setConfig(cfg)
    setAllocations(allocs)
    setInvestors(users.filter(u => u.role === 'investor'))
    setPnlReports(pnls)
    setProjReports(projs)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id])

  if (loading || !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  const logOverride = async (section: string, summary: string, before: Record<string, unknown>, after: Record<string, unknown>, reason: string) => {
    if (!actor) return
    await recordAdminOverride({
      scope: 'portfolio',
      targetId: portfolio.id,
      targetLabel: portfolio.name,
      section,
      summary,
      before,
      after,
      reasonNote: reason,
      changedByUid: actor.uid,
      changedByName: actor.name,
    })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/portfolios')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Override Data — {portfolio.name}</h1>
            <Badge variant="outline">{portfolio.code}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Koreksi data portofolio secara manual. Gunakan hanya untuk memperbaiki input yang salah.</p>
        </div>
      </div>

      {/* Danger banner */}
      <div className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-800">Mode Override Admin</p>
          <p className="text-amber-700">Perubahan di halaman ini menimpa data yang diinput analis dan langsung memengaruhi perhitungan investor. Setiap perubahan dicatat dengan alasan di log audit.</p>
        </div>
      </div>

      <MasterSection portfolio={portfolio} onSaved={loadAll} logOverride={logOverride} />

      {config && (
        <ConfigSection
          portfolioId={portfolio.id}
          config={config}
          configExists={configExists}
          onSaved={loadAll}
          logOverride={logOverride}
        />
      )}

      <AllocationsSection
        portfolio={portfolio}
        allocations={allocations}
        investors={investors}
        onSaved={loadAll}
        logOverride={logOverride}
      />

      <ReportsSection
        portfolioId={portfolio.id}
        type="pnl"
        reports={pnlReports}
        fields={PNL_FIELDS as { key: string; label: string }[]}
        notesKey="notes"
        onSaved={loadAll}
        logOverride={logOverride}
      />

      <ReportsSection
        portfolioId={portfolio.id}
        type="projection"
        reports={projReports}
        fields={PROJ_FIELDS as { key: string; label: string }[]}
        notesKey="assumptions"
        onSaved={loadAll}
        logOverride={logOverride}
      />
    </div>
  )
}

type LogFn = (section: string, summary: string, before: Record<string, unknown>, after: Record<string, unknown>, reason: string) => Promise<void>

// ─── Master fields ──────────────────────────────────────────────────────────

function MasterSection({ portfolio, onSaved, logOverride }: { portfolio: Portfolio; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const initial = useMemo(() => ({
    name: portfolio.name,
    brandName: portfolio.brandName ?? '',
    code: portfolio.code,
    stage: portfolio.stage,
    periode: portfolio.periode,
    investasiAwal: String(portfolio.investasiAwal ?? 0),
    description: portfolio.description ?? '',
    industryType: portfolio.industryType,
    isGracePeriod: portfolio.isGracePeriod ?? false,
  }), [portfolio])

  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async (reason: string) => {
    const amount = Number(form.investasiAwal)
    if (!form.name.trim() || !form.code.trim() || !Number.isFinite(amount) || amount < 0) {
      toast.error('Nama, kode, dan investasi awal harus valid.')
      throw new Error('invalid')
    }
    const patch = {
      name: form.name.trim(),
      brandName: form.brandName.trim(),
      code: form.code.trim(),
      stage: form.stage.trim(),
      periode: form.periode.trim(),
      investasiAwal: amount,
      description: form.description,
      industryType: form.industryType,
      isGracePeriod: form.isGracePeriod,
    }
    try {
      await updatePortfolio(portfolio.id, patch)
      await logOverride('master', 'Data master portofolio', initial, { ...patch, investasiAwal: String(amount) }, reason)
      toast.success('Data master diperbarui')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'invalid' ? e.message : 'Gagal menyimpan data master')
      throw e
    }
  }

  return (
    <OverrideSection title="Data Master Portofolio" description="Nama, kode, tahap, periode, investasi awal, industri & grace period" dirty={dirty} onSave={save} onReset={() => setForm(initial)} defaultOpen>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nama Portofolio"><Input value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Kode"><Input value={form.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label="Brand Name"><Input value={form.brandName} onChange={e => set('brandName', e.target.value)} /></Field>
        <Field label="Tahap"><Input value={form.stage} onChange={e => set('stage', e.target.value)} /></Field>
        <Field label="Periode"><Input value={form.periode} onChange={e => set('periode', e.target.value)} /></Field>
        <Field label="Investasi Awal (IDR)"><Input type="number" value={form.investasiAwal} onChange={e => set('investasiAwal', e.target.value)} /></Field>
        <Field label="Industri">
          <Select value={form.industryType} onValueChange={v => set('industryType', v as IndustryType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Grace Period">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isGracePeriod} onChange={e => set('isGracePeriod', e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[#1e5f3f]" />
            Portofolio dalam masa grace period (belum ada PnL)
          </label>
        </Field>
      </div>
      <Field label="Deskripsi"><Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></Field>
    </OverrideSection>
  )
}

// ─── Profit-sharing config ──────────────────────────────────────────────────

function ConfigSection({ portfolioId, config, configExists, onSaved, logOverride }: { portfolioId: string; config: PortfolioConfig; configExists: boolean; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const ic = config.investorConfig
  const type = ic.type
  const initial = useMemo(() => ({
    investorSharePercent: ic.investorSharePercent != null ? String(ic.investorSharePercent) : '',
    arunamiFeePercent: ic.arunamiFeePercent != null ? String(ic.arunamiFeePercent) : '',
    fixedYieldPercent: (ic as { fixedYieldPercent?: number }).fixedYieldPercent != null ? String((ic as { fixedYieldPercent?: number }).fixedYieldPercent) : '',
    revenueSharePercent: (ic as { revenueSharePercent?: number }).revenueSharePercent != null ? String((ic as { revenueSharePercent?: number }).revenueSharePercent) : '',
    reportingFrequency: config.reportingFrequency,
    returnsPrincipal: config.returnsPrincipal ?? false,
  }), [config, ic])

  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const editableNumeric = type === 'net_profit_share' || type === 'percentage_based' || type === 'fixed_return' || type === 'fixed_yield' || type === 'revenue_share'

  const save = async (reason: string) => {
    // Build the patched investorConfig, preserving every other field on the union.
    const newIc: typeof ic = { ...ic }
    const num = (s: string) => {
      const n = Number(s)
      return Number.isFinite(n) ? n : 0
    }
    if (type === 'net_profit_share' || type === 'percentage_based' || type === 'fixed_return') {
      ;(newIc as { investorSharePercent: number }).investorSharePercent = num(form.investorSharePercent)
      ;(newIc as { arunamiFeePercent: number }).arunamiFeePercent = num(form.arunamiFeePercent)
    } else if (type === 'fixed_yield') {
      ;(newIc as { fixedYieldPercent: number }).fixedYieldPercent = num(form.fixedYieldPercent)
      ;(newIc as { arunamiFeePercent: number }).arunamiFeePercent = num(form.arunamiFeePercent)
    } else if (type === 'revenue_share') {
      ;(newIc as { revenueSharePercent: number }).revenueSharePercent = num(form.revenueSharePercent)
    }

    const patch: Partial<PortfolioConfig> = {
      investorConfig: newIc,
      reportingFrequency: form.reportingFrequency,
      returnsPrincipal: form.returnsPrincipal,
    }

    try {
      if (configExists) {
        await updatePortfolioConfigFields(portfolioId, patch)
      } else {
        // No config doc yet — create it from the resolved defaults + patch.
        // savePortfolioConfig stamps createdAt itself, so drop the loaded one.
        const rest: Omit<PortfolioConfig, 'createdAt'> & { createdAt?: PortfolioConfig['createdAt'] } = { ...config }
        delete rest.createdAt
        await savePortfolioConfig(portfolioId, { ...rest, ...patch })
      }
      await logOverride('config', `Konfigurasi bagi hasil (${type})`, { ...initial }, { ...form }, reason)
      toast.success('Konfigurasi diperbarui')
      await onSaved()
    } catch (e) {
      toast.error('Gagal menyimpan konfigurasi')
      throw e
    }
  }

  return (
    <OverrideSection title="Konfigurasi Bagi Hasil" description="Persentase bagi hasil, frekuensi laporan, pengembalian pokok" dirty={dirty} onSave={save} onReset={() => setForm(initial)}>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Model distribusi saat ini: <span className="font-semibold text-foreground">{type}</span>.
        Untuk mengganti model distribusi sepenuhnya, gunakan tombol "Ubah Model Distribusi" di halaman Manajemen Portofolio.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(type === 'net_profit_share' || type === 'percentage_based' || type === 'fixed_return') && (
          <>
            <Field label="Bagi Hasil Investor (%)"><Input type="number" value={form.investorSharePercent} onChange={e => set('investorSharePercent', e.target.value)} /></Field>
            <Field label="Fee Arunami (%)"><Input type="number" value={form.arunamiFeePercent} onChange={e => set('arunamiFeePercent', e.target.value)} /></Field>
          </>
        )}
        {type === 'fixed_yield' && (
          <>
            <Field label="Fixed Yield (% / periode)"><Input type="number" value={form.fixedYieldPercent} onChange={e => set('fixedYieldPercent', e.target.value)} /></Field>
            <Field label="Fee Arunami (%)"><Input type="number" value={form.arunamiFeePercent} onChange={e => set('arunamiFeePercent', e.target.value)} /></Field>
          </>
        )}
        {type === 'revenue_share' && (
          <Field label="Revenue Share (%)"><Input type="number" value={form.revenueSharePercent} onChange={e => set('revenueSharePercent', e.target.value)} /></Field>
        )}
        <Field label="Frekuensi Laporan">
          <Select value={form.reportingFrequency} onValueChange={v => set('reportingFrequency', v as ReportingFrequency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQ_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pengembalian Pokok">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.returnsPrincipal} onChange={e => set('returnsPrincipal', e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[#1e5f3f]" />
            Portofolio mengembalikan pokok investor
          </label>
        </Field>
      </div>

      {!editableNumeric && (
        <p className="text-xs text-amber-600">
          Model "{type}" memiliki konfigurasi kompleks (jadwal/dividen/formula). Edit detailnya melalui halaman Profit Sharing analis; di sini hanya frekuensi laporan & pengembalian pokok yang bisa diubah.
        </p>
      )}
    </OverrideSection>
  )
}

// ─── Allocations ────────────────────────────────────────────────────────────

function AllocationsSection({ portfolio, allocations, investors, onSaved, logOverride }: { portfolio: Portfolio; allocations: InvestorAllocation[]; investors: AppUser[]; onSaved: () => Promise<void>; logOverride: LogFn }) {
  const [reason, setReason] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editPercent, setEditPercent] = useState('')
  const [newUid, setNewUid] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [busy, setBusy] = useState(false)

  const reasonValid = reason.trim().length > 0
  const available = investors.filter(inv => !allocations.some(a => a.investorUid === inv.uid))

  const requireReason = () => {
    if (!reasonValid) { toast.error('Isi alasan override terlebih dahulu.'); return false }
    return true
  }

  const startEdit = (a: InvestorAllocation) => {
    setEditId(a.id)
    setEditAmount(String(a.investedAmount))
    setEditPercent(String(a.ownershipPercent ?? ''))
  }

  const saveEdit = async (a: InvestorAllocation) => {
    if (!requireReason()) return
    const amount = Number(editAmount)
    const percent = Number(editPercent)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Jumlah dan persentase harus valid.'); return
    }
    setBusy(true)
    try {
      await updateAllocation(a.id, { investedAmount: amount, ownershipPercent: percent }, portfolio.id)
      await logOverride('allocation', `Alokasi ${a.investorName}`,
        { investedAmount: a.investedAmount, ownershipPercent: a.ownershipPercent ?? null },
        { investedAmount: amount, ownershipPercent: percent }, reason.trim())
      toast.success('Alokasi diperbarui')
      setEditId(null); setReason('')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui alokasi')
    } finally { setBusy(false) }
  }

  const add = async () => {
    if (!requireReason()) return
    const inv = investors.find(i => i.uid === newUid)
    const amount = Number(newAmount)
    const percent = Number(newPercent)
    if (!inv || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Pilih investor & isi jumlah/persentase dengan benar.'); return
    }
    setBusy(true)
    try {
      await createAllocation({
        investorUid: inv.uid, investorName: inv.displayName, investorEmail: inv.email,
        portfolioId: portfolio.id, portfolioName: portfolio.name, portfolioCode: portfolio.code,
        investedAmount: amount, ownershipPercent: percent,
      })
      await logOverride('allocation', `Tambah alokasi ${inv.displayName}`, {}, { investedAmount: amount, ownershipPercent: percent }, reason.trim())
      toast.success(`${inv.displayName} ditambahkan`)
      setNewUid(''); setNewAmount(''); setNewPercent(''); setReason('')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambahkan alokasi')
    } finally { setBusy(false) }
  }

  const remove = async (a: InvestorAllocation) => {
    if (!requireReason()) return
    if (!window.confirm(`Hapus alokasi ${a.investorName}?`)) return
    setBusy(true)
    try {
      await deleteAllocation(a.id, portfolio.id)
      await logOverride('allocation', `Hapus alokasi ${a.investorName}`,
        { investedAmount: a.investedAmount, ownershipPercent: a.ownershipPercent ?? null }, {}, reason.trim())
      toast.success('Alokasi dihapus')
      setReason('')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus alokasi')
    } finally { setBusy(false) }
  }

  const totalPercent = allocations.reduce((s, a) => s + (a.ownershipPercent ?? 0), 0)

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Alokasi Investor</p>
        <p className="text-xs text-muted-foreground">Total kepemilikan terpakai: {totalPercent.toFixed(2)}% (maks. 100%)</p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1">
          <Label className="text-xs">Alasan Override * <span className="font-normal text-muted-foreground">(berlaku untuk aksi tambah/edit/hapus di bawah)</span></Label>
          <Textarea rows={2} placeholder="Contoh: koreksi persentase kepemilikan investor X..." value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        {allocations.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Investor</th>
                  <th className="text-right py-2 px-3 font-medium">Investasi</th>
                  <th className="text-center py-2 px-3 font-medium">Persentase</th>
                  <th className="text-right py-2 px-3 font-medium w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allocations.map(a => {
                  const editing = editId === a.id
                  const investorUser = investors.find(i => i.uid === a.investorUid)
                  return (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3">
                        <p className="font-medium">{investorUser?.displayName ?? a.investorName}</p>
                        <p className="text-xs text-muted-foreground">{investorUser?.email ?? a.investorEmail}</p>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {editing
                          ? <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="h-8 w-32 text-right ml-auto" />
                          : formatCurrencyCompact(a.investedAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {editing
                          ? <Input type="number" value={editPercent} onChange={e => setEditPercent(e.target.value)} className="h-8 w-20 text-center mx-auto" />
                          : (a.ownershipPercent != null ? `${a.ownershipPercent}%` : '—')}
                      </td>
                      <td className="py-2.5 px-3 text-right">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">Belum ada alokasi investor.</p>
        )}

        <div className="rounded-md border p-3 space-y-3">
          <p className="text-xs font-medium">Tambah Investor</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Investor">
              <Select value={newUid} onValueChange={setNewUid}>
                <SelectTrigger><SelectValue placeholder="Pilih investor..." /></SelectTrigger>
                <SelectContent>
                  {available.length === 0
                    ? <div className="px-3 py-2 text-xs text-muted-foreground">Semua investor sudah dialokasikan</div>
                    : available.map(i => <SelectItem key={i.uid} value={i.uid}>{i.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Jumlah Investasi (IDR)"><Input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} /></Field>
            <Field label="Persentase (%)"><Input type="number" value={newPercent} onChange={e => setNewPercent(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={busy || !newUid}><UserPlus className="mr-1 h-4 w-4" />Tambah</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PnL / Projection reports ───────────────────────────────────────────────

function ReportsSection({ portfolioId, type, reports, fields, notesKey, onSaved, logOverride }: {
  portfolioId: string
  type: 'pnl' | 'projection'
  reports: PortfolioReport[]
  fields: { key: string; label: string }[]
  notesKey: string
  onSaved: () => Promise<void>
  logOverride: LogFn
}) {
  const sorted = useMemo(() => [...reports].sort((a, b) => b.period.localeCompare(a.period)), [reports])
  const [selectedId, setSelectedId] = useState<string>(sorted[0]?.id ?? '')
  useEffect(() => { setSelectedId(sorted[0]?.id ?? '') }, [sorted])

  const selected = sorted.find(r => r.id === selectedId) ?? null
  const data = (selected?.extractedData ?? {}) as Record<string, unknown>

  const initial = useMemo(() => {
    const o: Record<string, string> = {}
    for (const f of fields) o[f.key] = data[f.key] != null ? String(data[f.key]) : ''
    o[notesKey] = data[notesKey] != null ? String(data[notesKey]) : ''
    return o
  }, [selectedId, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const title = type === 'pnl' ? 'Laporan PnL (per periode)' : 'Laporan Proyeksi (per periode)'
  const desc = 'Pilih periode lalu koreksi angka utama. Rincian baris (opex, kategori) tetap dikelola di halaman analis.'

  const save = async (reason: string) => {
    if (!selected) return
    const before: Record<string, unknown> = {}
    const numericPatch: Record<string, number | string> = {}
    for (const f of fields) {
      before[f.key] = data[f.key] ?? null
      const n = Number(form[f.key])
      numericPatch[f.key] = Number.isFinite(n) && form[f.key].trim() !== '' ? n : 0
    }
    before[notesKey] = data[notesKey] ?? null
    numericPatch[notesKey] = form[notesKey]

    const newExtracted = { ...data, ...numericPatch }
    try {
      await updateReport(portfolioId, selected.id, { extractedData: newExtracted as PortfolioReport['extractedData'] })
      // Aggregated snapshot is derived from report figures — re-sync so investor
      // distributions reflect the corrected numbers.
      await syncFinancialData(portfolioId)
      await logOverride(type, `${type.toUpperCase()} ${formatPeriod(selected.period)}`, before, numericPatch, reason)
      toast.success('Laporan diperbarui')
      await onSaved()
    } catch (e) {
      toast.error('Gagal menyimpan laporan')
      throw e
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">Belum ada laporan {type === 'pnl' ? 'PnL' : 'proyeksi'} untuk portofolio ini.</p>
      </div>
    )
  }

  return (
    <OverrideSection title={title} description={desc} dirty={dirty} onSave={save} onReset={() => setForm(initial)}>
      <Field label="Periode">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sorted.map(r => <SelectItem key={r.id} value={r.id}>{formatPeriod(r.period)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(f => (
          <Field key={f.key} label={f.label}>
            <Input type="number" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          </Field>
        ))}
      </div>
      <Field label={type === 'pnl' ? 'Catatan' : 'Asumsi'}>
        <Textarea rows={2} value={form[notesKey] ?? ''} onChange={e => set(notesKey, e.target.value)} />
      </Field>
    </OverrideSection>
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
