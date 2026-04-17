import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { getAllUsers, createUser, updateUser, deleteUser } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, Pencil, Trash2 } from 'lucide-react'
import type { AppUser } from '@/types'

const createSchema = z.object({
  displayName: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['admin', 'analyst', 'investor']),
})

const editSchema = z.object({
  displayName: z.string().min(2, 'Nama minimal 2 karakter'),
  role: z.enum(['admin', 'analyst', 'investor']),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

const roleBadgeVariant = (role: string) => {
  if (role === 'admin') return 'default'
  if (role === 'analyst') return 'secondary' as const
  return 'outline' as const
}

export default function AdminUsers() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)
  const [createIsTeam, setCreateIsTeam] = useState(false)
  const [editIsTeam, setEditIsTeam] = useState(false)

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'analyst' },
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  const fetchUsers = async () => {
    const data = await getAllUsers()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const onCreate = async (data: CreateFormData) => {
    try {
      await createUser(data.email, data.password, data.displayName, data.role, user!.uid, createIsTeam)
      toast.success('Pengguna berhasil dibuat')
      createForm.reset()
      setCreateIsTeam(false)
      setOpen(false)
      fetchUsers()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Gagal membuat pengguna')
    }
  }

  const openEdit = (u: AppUser) => {
    setEditTarget(u)
    editForm.reset({ displayName: u.displayName, role: u.role as 'admin' | 'analyst' | 'investor' })
    setEditIsTeam(u.isArunamiTeam ?? false)
    setEditOpen(true)
  }

  const onEdit = async (data: EditFormData) => {
    if (!editTarget) return
    try {
      await updateUser(editTarget.uid, { ...data, isArunamiTeam: editIsTeam })
      toast.success('Pengguna berhasil diperbarui')
      setEditOpen(false)
      fetchUsers()
    } catch {
      toast.error('Gagal memperbarui pengguna')
    }
  }

  const onDelete = async (u: AppUser) => {
    if (!window.confirm(`Hapus pengguna "${u.displayName}"? Tindakan ini tidak dapat dibatalkan.`)) return
    try {
      await deleteUser(u.uid)
      toast.success('Pengguna berhasil dihapus')
      fetchUsers()
    } catch {
      toast.error('Gagal menghapus pengguna')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Pengguna</h1>
          <p className="text-muted-foreground">Kelola akun analis dan investor</p>
        </div>

        {/* Create User Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" />Tambah Pengguna</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah Pengguna Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nama Lengkap</Label>
                <Input placeholder="Nama pengguna" {...createForm.register('displayName')} />
                {createForm.formState.errors.displayName && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.displayName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="email@contoh.com" {...createForm.register('email')} />
                {createForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Minimal 6 karakter" {...createForm.register('password')} />
                {createForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select defaultValue="analyst" onValueChange={(v) => createForm.setValue('role', v as 'admin' | 'analyst' | 'investor')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="analyst">Analis</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createIsTeam}
                  onChange={(e) => setCreateIsTeam(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">Tim Arunami (Bebas Fee)</span>
              </label>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Pengguna ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengguna</p>
          ) : (
            <div className="divide-y">
              {users.map(u => (
                <div key={u.uid} className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] font-bold shrink-0">
                    {u.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.displayName}</p>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge variant={roleBadgeVariant(u.role)} className="capitalize">{u.role}</Badge>
                  {u.isArunamiTeam && (
                    <Badge variant="outline" className="border-green-600 text-green-700 text-xs">Tim Arunami</Badge>
                  )}
                  {u.role !== 'admin' && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pengguna — {editTarget?.displayName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input placeholder="Nama pengguna" {...editForm.register('displayName')} />
              {editForm.formState.errors.displayName && (
                <p className="text-xs text-destructive">{editForm.formState.errors.displayName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editForm.watch('role')}
                onValueChange={(v) => editForm.setValue('role', v as 'admin' | 'analyst' | 'investor')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="analyst">Analis</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editIsTeam}
                onChange={(e) => setEditIsTeam(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Tim Arunami (Bebas Fee)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
