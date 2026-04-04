import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { getAllPortfolios, createPortfolio, getAllUsers, updatePortfolio, deletePortfolio } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatCurrencyCompact } from '@/lib/utils'
import { PlusCircle, Users, Pencil, Trash2 } from 'lucide-react'
import type { Portfolio, AppUser } from '@/types'

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
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [investors, setInvestors] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Portfolio | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null)
  const [selectedInvestors, setSelectedInvestors] = useState<string[]>([])

  const createForm = useForm<PortfolioFormData>({
    resolver: zodResolver(portfolioSchema) as never,
  })

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

  const onCreate = async (data: unknown) => {
    const formData = data as PortfolioFormData
    try {
      await createPortfolio({
        ...formData,
        description: formData.description ?? '',
        assignedInvestors: [],
        assignedAnalysts: [],
      })
      toast.success('Portofolio berhasil dibuat')
      createForm.reset()
      setOpen(false)
      fetchData()
    } catch {
      toast.error('Gagal membuat portofolio')
    }
  }

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

  const openAssign = (portfolio: Portfolio) => {
    setSelectedPortfolio(portfolio)
    setSelectedInvestors([...portfolio.assignedInvestors])
    setAssignOpen(true)
  }

  const toggleInvestor = (uid: string) => {
    setSelectedInvestors(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid],
    )
  }

  const saveAssignment = async () => {
    if (!selectedPortfolio) return
    try {
      await updatePortfolio(selectedPortfolio.id, { assignedInvestors: selectedInvestors })
      toast.success('Penugasan investor berhasil diperbarui')
      setAssignOpen(false)
      fetchData()
    } catch {
      toast.error('Gagal memperbarui penugasan')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Portofolio</h1>
          <p className="text-muted-foreground">Buat dan kelola portofolio investasi</p>
        </div>

        {/* Create Portfolio Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="mr-2 h-4 w-4" />Buat Portofolio</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Buat Portofolio Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nama Portofolio</Label>
                  <Input placeholder="Nama portofolio" {...createForm.register('name')} />
                  {createForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{String(createForm.formState.errors.name.message)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Kode</Label>
                  <Input placeholder="ARN-01" {...createForm.register('code')} />
                  {createForm.formState.errors.code && (
                    <p className="text-xs text-destructive">{String(createForm.formState.errors.code.message)}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tahap</Label>
                  <Input placeholder="Seed / Series A" {...createForm.register('stage')} />
                </div>
                <div className="space-y-2">
                  <Label>Periode</Label>
                  <Input placeholder="2024" {...createForm.register('periode')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Investasi Awal (IDR)</Label>
                <Input type="number" placeholder="0" {...createForm.register('investasiAwal')} />
              </div>
              <div className="space-y-2">
                <Label>Deskripsi</Label>
                <Textarea placeholder="Deskripsi singkat portofolio..." {...createForm.register('description')} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : portfolios.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada portofolio</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map(p => (
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
                  <Button size="sm" variant="outline" onClick={() => openAssign(p)}>
                    <Users className="mr-1 h-3 w-3" />
                    {p.assignedInvestors.length} Investor
                  </Button>
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

      {/* Assign Investors Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Investor — {selectedPortfolio?.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
            {investors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada investor terdaftar</p>
            ) : (
              investors.map(inv => (
                <label key={inv.uid} className="flex items-center gap-3 cursor-pointer rounded-lg border p-3 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selectedInvestors.includes(inv.uid)}
                    onChange={() => toggleInvestor(inv.uid)}
                    className="h-4 w-4 accent-[#1e5f3f]"
                  />
                  <div>
                    <p className="text-sm font-medium">{inv.displayName}</p>
                    <p className="text-xs text-muted-foreground">{inv.email}</p>
                  </div>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Batal</Button>
            <Button onClick={saveAssignment}>Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
