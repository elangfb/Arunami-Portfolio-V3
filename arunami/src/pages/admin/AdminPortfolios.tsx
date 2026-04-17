import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  getAllPortfolios, getAllUsers, updatePortfolio, deletePortfolio,
  getAllocationsForPortfolio, createAllocation, updateAllocation, deleteAllocation,
} from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyCompact } from '@/lib/utils'
import { PlusCircle, Users, Pencil, Trash2, UserPlus, Minus, UserCog, Search, ChevronDown, X } from 'lucide-react'
import type { Portfolio, InvestorAllocation, AppUser } from '@/types'

const portfolioSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  brandName: z.string().min(1, 'Brand Name wajib diisi'),
  code: z.string().min(1, 'Kode wajib diisi'),
  stage: z.string().min(1, 'Tahap wajib diisi'),
  periode: z.string().min(1, 'Periode wajib diisi'),
  investasiAwal: z.coerce.number().min(0, 'Investasi awal tidak valid'),
  description: z.string().optional(),
})

type PortfolioFormData = z.infer<typeof portfolioSchema>

export default function AdminPortfolios() {
  const navigate = useNavigate()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [investors, setInvestors] = useState<AppUser[]>([])
  const [analysts, setAnalysts] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Portfolio | null>(null)

  // Assign Analyst dialog
  const [analystDialogOpen, setAnalystDialogOpen] = useState(false)
  const [analystTarget, setAnalystTarget] = useState<Portfolio | null>(null)
  const [selectedAnalystUids, setSelectedAnalystUids] = useState<Set<string>>(new Set())
  const [savingAnalysts, setSavingAnalysts] = useState(false)

  const [allocOpen, setAllocOpen] = useState(false)
  const [allocPortfolio, setAllocPortfolio] = useState<Portfolio | null>(null)
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [allocLoading, setAllocLoading] = useState(false)

  const [newInvestorUid, setNewInvestorUid] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercent, setNewPercent] = useState('')

  const [editAllocId, setEditAllocId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editPercent, setEditPercent] = useState('')

  // Search states
  const [portfolioSearch, setPortfolioSearch] = useState('')
  const [investorSearch, setInvestorSearch] = useState('')
  const [investorDropdownOpen, setInvestorDropdownOpen] = useState(false)
  const [analystSearch, setAnalystSearch] = useState('')
  const investorDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!investorDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (investorDropdownRef.current && !investorDropdownRef.current.contains(e.target as Node)) {
        setInvestorDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [investorDropdownOpen])

  const editForm = useForm<PortfolioFormData>({
    resolver: zodResolver(portfolioSchema) as never,
  })

  const fetchData = async () => {
    const [p, users] = await Promise.all([getAllPortfolios(), getAllUsers()])
    setPortfolios(p)
    setInvestors(users.filter(u => u.role === 'investor'))
    setAnalysts(users.filter(u => u.role === 'analyst'))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const openEdit = (p: Portfolio) => {
    setEditTarget(p)
    editForm.reset({
      name: p.name,
      brandName: p.brandName ?? '',
      code: p.code,
      stage: p.stage,
      periode: p.periode,
      investasiAwal: p.investasiAwal,
      description: p.description,
    })
    setEditOpen(true)
  }

  const onEdit = async (data: unknown) => {
    if (!editTarget) return
    const formData = data as PortfolioFormData
    try {
      await updatePortfolio(editTarget.id, {
        ...formData,
        description: formData.description ?? '',
      })
      toast.success('Portofolio berhasil diperbarui')
      setEditOpen(false)
      fetchData()
    } catch {
      toast.error('Gagal memperbarui portofolio')
    }
  }

  const openAnalystDialog = (p: Portfolio) => {
    setAnalystTarget(p)
    setSelectedAnalystUids(new Set(p.assignedAnalysts ?? []))
    setAnalystSearch('')
    setAnalystDialogOpen(true)
  }

  const toggleAnalyst = (uid: string) => {
    setSelectedAnalystUids(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const saveAssignedAnalysts = async () => {
    if (!analystTarget) return
    setSavingAnalysts(true)
    try {
      await updatePortfolio(analystTarget.id, {
        assignedAnalysts: [...selectedAnalystUids],
      })
      toast.success('Analis berhasil diperbarui')
      setAnalystDialogOpen(false)
      fetchData()
    } catch {
      toast.error('Gagal memperbarui analis')
    } finally {
      setSavingAnalysts(false)
    }
  }

  const onDelete = async (p: Portfolio) => {
    if (!window.confirm(`Hapus portofolio "${p.name}"? Tindakan ini tidak dapat dibatalkan.`)) return
    try {
      await deletePortfolio(p.id)
      toast.success('Portofolio berhasil dihapus')
      fetchData()
    } catch {
      toast.error('Gagal menghapus portofolio')
    }
  }

  const openAllocDialog = async (portfolio: Portfolio) => {
    setAllocPortfolio(portfolio)
    setAllocLoading(true)
    setAllocOpen(true)
    setNewInvestorUid('')
    setNewAmount('')
    setNewPercent('')
    setInvestorSearch('')
    setInvestorDropdownOpen(false)

    const allocs = await getAllocationsForPortfolio(portfolio.id)
    setAllocations(allocs)
    setAllocLoading(false)
  }

  const availableInvestors = investors.filter(
    inv => !allocations.some(a => a.investorUid === inv.uid),
  )

  const filteredPortfolios = portfolios.filter(p => {
    const q = portfolioSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.brandName ?? '').toLowerCase().includes(q)
  })

  const filteredAvailableInvestors = availableInvestors.filter(inv => {
    const q = investorSearch.toLowerCase()
    return inv.displayName.toLowerCase().includes(q) || inv.email.toLowerCase().includes(q)
  })

  const filteredAnalysts = analysts.filter(a => {
    const q = analystSearch.toLowerCase()
    return a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
  })

  const handleAddAllocation = async () => {
    if (!allocPortfolio) return
    const investor = investors.find(i => i.uid === newInvestorUid)
    const amount = Number(newAmount)
    const percent = Number(newPercent)
    if (!investor || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Pilih Investor dan isi Jumlah Investasi & Persentase dengan benar.')
      return
    }

    try {
      await createAllocation(
        {
          investorUid: investor.uid,
          investorName: investor.displayName,
          investorEmail: investor.email,
          portfolioId: allocPortfolio.id,
          portfolioName: allocPortfolio.name,
          portfolioCode: allocPortfolio.code,
          slots: 0,
          investedAmount: amount,
          ownershipPercent: percent,
        },
        0,
      )
      toast.success(`${investor.displayName} ditambahkan`)
      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      setNewInvestorUid('')
      setNewAmount('')
      setNewPercent('')
      fetchData()
    } catch {
      toast.error('Gagal menambahkan investor')
    }
  }

  const startEditAllocation = (alloc: InvestorAllocation) => {
    setEditAllocId(alloc.id)
    setEditAmount(String(alloc.investedAmount))
    setEditPercent(String(alloc.ownershipPercent ?? ''))
  }

  const cancelEditAllocation = () => {
    setEditAllocId(null)
    setEditAmount('')
    setEditPercent('')
  }

  const handleSaveEditAllocation = async (alloc: InvestorAllocation) => {
    if (!allocPortfolio) return
    const amount = Number(editAmount)
    const percent = Number(editPercent)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(percent) || percent <= 0) {
      toast.error('Jumlah Investasi dan Persentase harus valid.')
      return
    }
    try {
      await updateAllocation(
        alloc.id,
        { investedAmount: amount, ownershipPercent: percent },
        allocPortfolio.id,
        0,
      )
      toast.success('Alokasi berhasil diperbarui')
      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      cancelEditAllocation()
      fetchData()
    } catch {
      toast.error('Gagal memperbarui alokasi')
    }
  }

  const handleDeleteAllocation = async (alloc: InvestorAllocation) => {
    if (!allocPortfolio) return
    if (!window.confirm(`Hapus alokasi ${alloc.investorName}?`)) return

    try {
      await deleteAllocation(alloc.id, allocPortfolio.id, 0)
      toast.success('Alokasi berhasil dihapus')
      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      fetchData()
    } catch {
      toast.error('Gagal menghapus alokasi')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Portofolio</h1>
          <p className="text-muted-foreground">Buat dan kelola portofolio investasi</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari portofolio..."
              value={portfolioSearch}
              onChange={e => setPortfolioSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => navigate('/admin/portfolios/new')}>
            <PlusCircle className="mr-2 h-4 w-4" />Buat Portofolio
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : filteredPortfolios.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{portfolioSearch ? 'Tidak ada portofolio yang cocok' : 'Belum ada portofolio'}</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPortfolios.map(p => (
            <Card key={p.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{p.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.brandName ? `${p.brandName} · ` : ''}{p.code} · {p.stage}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline">{p.periode}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(p)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{p.description || 'Tidak ada deskripsi'}</p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Investasi Awal</p>
                    <p className="font-semibold text-sm">{formatCurrencyCompact(p.investasiAwal)}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => openAllocDialog(p)}>
                      <Users className="mr-1 h-3 w-3" />
                      {p.assignedInvestors.length} Investor
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAnalystDialog(p)}>
                      <UserCog className="mr-1 h-3 w-3" />
                      {(p.assignedAnalysts?.length ?? 0)} Analis
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Portfolio Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Portofolio — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama Portofolio</Label>
                <Input placeholder="Nama portofolio" {...editForm.register('name')} />
                {editForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{String(editForm.formState.errors.name.message)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Kode</Label>
                <Input placeholder="ARN-01" {...editForm.register('code')} />
                {editForm.formState.errors.code && (
                  <p className="text-xs text-destructive">{String(editForm.formState.errors.code.message)}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Brand Name</Label>
              <Input placeholder="Contoh Brand" {...editForm.register('brandName')} />
              {editForm.formState.errors.brandName && (
                <p className="text-xs text-destructive">{String(editForm.formState.errors.brandName.message)}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tahap</Label>
                <Input placeholder="Seed / Series A" {...editForm.register('stage')} />
              </div>
              <div className="space-y-2">
                <Label>Periode</Label>
                <Input placeholder="2024" {...editForm.register('periode')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Investasi Awal (IDR)</Label>
              <Input type="number" placeholder="0" {...editForm.register('investasiAwal')} />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea placeholder="Deskripsi singkat portofolio..." {...editForm.register('description')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual Investor Allocation Dialog */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Investor — {allocPortfolio?.name}</DialogTitle>
          </DialogHeader>

          {allocLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#1e5f3f] border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {allocations.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium">Nama Investor</th>
                        <th className="text-right py-2 px-3 font-medium">Jumlah Investasi</th>
                        <th className="text-center py-2 px-3 font-medium">Persentase</th>
                        <th className="text-right py-2 px-3 font-medium w-16">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocations.map(alloc => {
                        const isEditing = editAllocId === alloc.id
                        return (
                          <tr key={alloc.id} className="hover:bg-muted/30">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{alloc.investorName}</p>
                                {investors.find(i => i.uid === alloc.investorUid)?.isArunamiTeam && (
                                  <Badge variant="outline" className="border-green-600 text-green-700 text-xs">Tim Arunami</Badge>
                                )}
                              </div>
                              {alloc.investorEmail && (
                                <p className="text-xs text-muted-foreground">{alloc.investorEmail}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editAmount}
                                  onChange={e => setEditAmount(e.target.value)}
                                  className="h-8 w-32 text-right ml-auto"
                                />
                              ) : (
                                formatCurrencyCompact(alloc.investedAmount)
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  value={editPercent}
                                  onChange={e => setEditPercent(e.target.value)}
                                  className="h-8 w-20 text-center mx-auto"
                                />
                              ) : (
                                alloc.ownershipPercent != null ? `${alloc.ownershipPercent}%` : '—'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelEditAllocation}>
                                    Batal
                                  </Button>
                                  <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveEditAllocation(alloc)}>
                                    Simpan
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => startEditAllocation(alloc)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteAllocation(alloc)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Form — pick investor account, manual amount & % */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">Tambah Investor</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Investor</Label>
                    <div className="relative" ref={investorDropdownRef}>
                      <div
                        className="flex items-center w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer"
                        onClick={() => setInvestorDropdownOpen(!investorDropdownOpen)}
                      >
                        <span className={`flex-1 truncate ${!newInvestorUid ? 'text-muted-foreground' : ''}`}>
                          {newInvestorUid
                            ? (() => { const inv = investors.find(i => i.uid === newInvestorUid); return inv ? `${inv.displayName}` : 'Pilih investor...' })()
                            : 'Pilih investor...'}
                        </span>
                        {newInvestorUid ? (
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0 ml-1" onClick={(e) => { e.stopPropagation(); setNewInvestorUid(''); setInvestorSearch('') }} />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                        )}
                      </div>
                      {investorDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                          <div className="p-2">
                            <Input
                              placeholder="Cari investor..."
                              value={investorSearch}
                              onChange={e => setInvestorSearch(e.target.value)}
                              className="h-8 text-xs"
                              autoFocus
                            />
                          </div>
                          <ul className="max-h-48 overflow-y-auto">
                            {filteredAvailableInvestors.length === 0 ? (
                              <li className="px-3 py-2 text-xs text-muted-foreground text-center">Tidak ditemukan</li>
                            ) : (
                              filteredAvailableInvestors.map(inv => (
                                <li
                                  key={inv.uid}
                                  className="px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
                                  onClick={() => { setNewInvestorUid(inv.uid); setInvestorDropdownOpen(false); setInvestorSearch('') }}
                                >
                                  <p className="font-medium truncate">{inv.displayName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jumlah Investasi (IDR)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newAmount}
                      onChange={e => setNewAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Persentase (%)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newPercent}
                      onChange={e => setNewPercent(e.target.value)}
                    />
                  </div>
                </div>
                {availableInvestors.length === 0 && (
                  <p className="text-xs text-muted-foreground">Semua investor sudah memiliki alokasi di portofolio ini.</p>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleAddAllocation} disabled={!newInvestorUid}>
                    <UserPlus className="mr-1 h-4 w-4" />Tambah
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Analyst Dialog */}
      <Dialog open={analystDialogOpen} onOpenChange={setAnalystDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Analis — {analystTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            {analysts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada akun analis terdaftar. Buat di halaman Manajemen Pengguna.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari analis..."
                    value={analystSearch}
                    onChange={e => setAnalystSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <ul className="divide-y rounded-lg border max-h-64 overflow-y-auto">
                  {filteredAnalysts.length === 0 ? (
                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">Tidak ada analis yang cocok</li>
                  ) : (
                    filteredAnalysts.map(a => {
                      const checked = selectedAnalystUids.has(a.uid)
                      return (
                        <li key={a.uid}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAnalyst(a.uid)}
                              className="h-4 w-4 rounded border-gray-300 accent-[#1e5f3f]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{a.displayName}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                            </div>
                          </label>
                        </li>
                      )
                    })
                  )}
                </ul>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Hanya analis yang dipilih yang dapat membuka dan mengedit portofolio ini.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAnalystDialogOpen(false)}>Batal</Button>
              <Button onClick={saveAssignedAnalysts} disabled={savingAnalysts}>
                {savingAnalysts ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
