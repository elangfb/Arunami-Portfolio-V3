import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  getAllPortfolios, getAllUsers, updatePortfolio, deletePortfolio,
  getAllocationsForPortfolio, createAllocation, updateAllocation, deleteAllocation,
  getPortfolioConfig,
} from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyCompact } from '@/lib/utils'
import { PlusCircle, Users, Pencil, Trash2, UserPlus, Minus } from 'lucide-react'
import type { Portfolio, AppUser, InvestorAllocation, SlotBasedConfig } from '@/types'

const portfolioSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
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
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Portfolio | null>(null)

  // Allocation dialog state
  const [allocOpen, setAllocOpen] = useState(false)
  const [allocPortfolio, setAllocPortfolio] = useState<Portfolio | null>(null)
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [allocLoading, setAllocLoading] = useState(false)
  const [slotConfig, setSlotConfig] = useState<{ totalSlots: number; nominalPerSlot: number } | null>(null)

  // Add investor form within allocation dialog
  const [addInvestorUid, setAddInvestorUid] = useState('')
  const [addSlots, setAddSlots] = useState(1)
  const [editAllocId, setEditAllocId] = useState<string | null>(null)
  const [editSlots, setEditSlots] = useState(1)

  const editForm = useForm<PortfolioFormData>({
    resolver: zodResolver(portfolioSchema) as never,
  })

  const fetchData = async () => {
    const [p, u] = await Promise.all([getAllPortfolios(), getAllUsers()])
    setPortfolios(p)
    setInvestors(u.filter(u => u.role === 'investor'))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const openEdit = (p: Portfolio) => {
    setEditTarget(p)
    editForm.reset({
      name: p.name,
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

  // ─── Allocation Dialog ─────────────────────────────────────────────────

  const openAllocDialog = async (portfolio: Portfolio) => {
    setAllocPortfolio(portfolio)
    setAllocLoading(true)
    setAllocOpen(true)
    setAddInvestorUid('')
    setAddSlots(1)
    setEditAllocId(null)

    const [allocs, config] = await Promise.all([
      getAllocationsForPortfolio(portfolio.id),
      getPortfolioConfig(portfolio.id),
    ])
    setAllocations(allocs)

    if (config?.investorConfig && config.investorConfig.type === 'slot_based') {
      const sc = config.investorConfig as SlotBasedConfig
      setSlotConfig({ totalSlots: sc.totalSlots, nominalPerSlot: sc.nominalPerSlot })
    } else {
      setSlotConfig(null)
    }
    setAllocLoading(false)
  }

  const allocatedSlots = allocations.reduce((sum, a) => sum + a.slots, 0)
  const remainingSlots = (slotConfig?.totalSlots ?? 0) - allocatedSlots

  const handleAddAllocation = async () => {
    if (!allocPortfolio || !slotConfig || !addInvestorUid) return
    if (addSlots <= 0 || addSlots > remainingSlots) {
      toast.error(`Slot tidak valid. Tersisa ${remainingSlots} slot.`)
      return
    }

    const investor = investors.find(i => i.uid === addInvestorUid)
    if (!investor) return

    // Check if this investor already has an allocation
    if (allocations.some(a => a.investorUid === addInvestorUid)) {
      toast.error('Investor ini sudah memiliki alokasi di portofolio ini.')
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
          slots: addSlots,
          investedAmount: addSlots * slotConfig.nominalPerSlot,
        },
        slotConfig.totalSlots,
      )
      toast.success(`${investor.displayName} ditambahkan (${addSlots} slot)`)

      // Refresh
      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      setAddInvestorUid('')
      setAddSlots(1)
      fetchData()
    } catch {
      toast.error('Gagal menambahkan alokasi')
    }
  }

  const handleUpdateAllocation = async (alloc: InvestorAllocation) => {
    if (!allocPortfolio || !slotConfig) return
    const otherAllocated = allocatedSlots - alloc.slots
    const maxForThis = slotConfig.totalSlots - otherAllocated
    if (editSlots <= 0 || editSlots > maxForThis) {
      toast.error(`Slot tidak valid. Maksimal ${maxForThis} slot untuk investor ini.`)
      return
    }

    try {
      await updateAllocation(
        alloc.id,
        { slots: editSlots, investedAmount: editSlots * slotConfig.nominalPerSlot },
        allocPortfolio.id,
        slotConfig.totalSlots,
      )
      toast.success('Alokasi berhasil diperbarui')

      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      setEditAllocId(null)
      fetchData()
    } catch {
      toast.error('Gagal memperbarui alokasi')
    }
  }

  const handleDeleteAllocation = async (alloc: InvestorAllocation) => {
    if (!allocPortfolio || !slotConfig) return
    if (!window.confirm(`Hapus alokasi ${alloc.investorName}?`)) return

    try {
      await deleteAllocation(alloc.id, allocPortfolio.id, slotConfig.totalSlots)
      toast.success('Alokasi berhasil dihapus')

      const allocs = await getAllocationsForPortfolio(allocPortfolio.id)
      setAllocations(allocs)
      fetchData()
    } catch {
      toast.error('Gagal menghapus alokasi')
    }
  }

  // Investors not yet allocated to this portfolio
  const availableInvestors = investors.filter(
    inv => !allocations.some(a => a.investorUid === inv.uid),
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Portofolio</h1>
          <p className="text-muted-foreground">Buat dan kelola portofolio investasi</p>
        </div>

        <Button onClick={() => navigate('/admin/portfolios/new')}>
          <PlusCircle className="mr-2 h-4 w-4" />Buat Portofolio
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : portfolios.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada portofolio</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map(p => {
            const summary = p.slotsSummary
            return (
              <Card key={p.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{p.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{p.code} · {p.stage}</p>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Investasi Awal</p>
                      <p className="font-semibold text-sm">{formatCurrencyCompact(p.investasiAwal)}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openAllocDialog(p)}>
                      <Users className="mr-1 h-3 w-3" />
                      {summary
                        ? `${summary.investorCount} Investor · ${summary.allocatedSlots}/${summary.totalSlots} Slot`
                        : `${p.assignedInvestors.length} Investor`
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
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

      {/* Slot Allocation Dialog */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alokasi Investor — {allocPortfolio?.name}</DialogTitle>
          </DialogHeader>

          {allocLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#1e5f3f] border-t-transparent" />
            </div>
          ) : !slotConfig ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>Portofolio ini belum dikonfigurasi dengan model slot-based.</p>
              <p className="text-xs mt-1">Konfigurasi return model sebagai "Slot Based" di setup wizard terlebih dahulu.</p>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {/* Slot Summary Bar */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Alokasi Slot</span>
                  <span className="font-medium">
                    {allocatedSlots} / {slotConfig.totalSlots} slot terisi
                    {remainingSlots > 0 && (
                      <span className="text-muted-foreground ml-1">({remainingSlots} tersisa)</span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1e5f3f] transition-all"
                    style={{ width: `${slotConfig.totalSlots > 0 ? (allocatedSlots / slotConfig.totalSlots) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Nominal per slot: {formatCurrencyCompact(slotConfig.nominalPerSlot)}
                </p>
              </div>

              {/* Current Allocations Table */}
              {allocations.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium">Investor</th>
                        <th className="text-center py-2 px-3 font-medium">Slot</th>
                        <th className="text-right py-2 px-3 font-medium">Investasi</th>
                        <th className="text-center py-2 px-3 font-medium">Kepemilikan</th>
                        <th className="text-right py-2 px-3 font-medium w-24">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocations.map(alloc => (
                        <tr key={alloc.id} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3">
                            <p className="font-medium">{alloc.investorName}</p>
                            <p className="text-xs text-muted-foreground">{alloc.investorEmail}</p>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {editAllocId === alloc.id ? (
                              <Input
                                type="number"
                                min={1}
                                max={slotConfig.totalSlots - (allocatedSlots - alloc.slots)}
                                value={editSlots}
                                onChange={e => setEditSlots(Number(e.target.value))}
                                className="w-20 mx-auto h-8 text-center"
                              />
                            ) : (
                              <Badge variant="secondary">{alloc.slots}</Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {editAllocId === alloc.id
                              ? formatCurrencyCompact(editSlots * slotConfig.nominalPerSlot)
                              : formatCurrencyCompact(alloc.investedAmount)
                            }
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {slotConfig.totalSlots > 0
                              ? `${((editAllocId === alloc.id ? editSlots : alloc.slots) / slotConfig.totalSlots * 100).toFixed(1)}%`
                              : '—'
                            }
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {editAllocId === alloc.id ? (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditAllocId(null)}>
                                  Batal
                                </Button>
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateAllocation(alloc)}>
                                  Simpan
                                </Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => { setEditAllocId(alloc.id); setEditSlots(alloc.slots) }}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Investor Row */}
              {remainingSlots > 0 && availableInvestors.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-medium">Tambah Investor</p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Investor</Label>
                      <select
                        value={addInvestorUid}
                        onChange={e => setAddInvestorUid(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Pilih investor...</option>
                        {availableInvestors.map(inv => (
                          <option key={inv.uid} value={inv.uid}>
                            {inv.displayName} ({inv.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Slot</Label>
                      <Input
                        type="number"
                        min={1}
                        max={remainingSlots}
                        value={addSlots}
                        onChange={e => setAddSlots(Number(e.target.value))}
                        className="h-9"
                      />
                    </div>
                    <Button onClick={handleAddAllocation} disabled={!addInvestorUid || addSlots <= 0}>
                      <UserPlus className="mr-1 h-4 w-4" />Tambah
                    </Button>
                  </div>
                  {addInvestorUid && addSlots > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Investasi: {formatCurrencyCompact(addSlots * slotConfig.nominalPerSlot)} · Kepemilikan: {((addSlots / slotConfig.totalSlots) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              )}

              {remainingSlots <= 0 && (
                <p className="text-sm text-center text-muted-foreground py-2">Semua slot telah teralokasi.</p>
              )}

              {availableInvestors.length === 0 && remainingSlots > 0 && (
                <p className="text-sm text-center text-muted-foreground py-2">Semua investor sudah memiliki alokasi.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
