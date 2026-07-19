import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getUser, updateInvestorProfile } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { KycBadge } from '@/components/shared/KycBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Save, Landmark, Bell } from 'lucide-react'

interface ProfileForm {
  phone: string
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
  notifyByEmail: boolean
}

export default function InvestorProfilePage() {
  const { user, setUser } = useAuthStore()
  const [form, setForm] = useState<ProfileForm>({
    phone: '', bankName: '', bankAccountNumber: '', bankAccountHolder: '', notifyByEmail: false,
  })
  const [investorType, setInvestorType] = useState<string | undefined>()
  const [npwp, setNpwp] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    getUser(user.uid)
      .then(u => {
        if (!u) return
        setForm({
          phone: u.phone ?? '',
          bankName: u.bankName ?? '',
          bankAccountNumber: u.bankAccountNumber ?? '',
          bankAccountHolder: u.bankAccountHolder ?? '',
          notifyByEmail: u.notifyByEmail ?? false,
        })
        setInvestorType(u.investorType)
        setNpwp(u.npwp)
      })
      .finally(() => setLoading(false))
  }, [user])

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const patch = {
        phone: form.phone.trim(),
        bankName: form.bankName.trim(),
        bankAccountNumber: form.bankAccountNumber.trim(),
        bankAccountHolder: form.bankAccountHolder.trim(),
        notifyByEmail: form.notifyByEmail,
      }
      await updateInvestorProfile(user.uid, patch)
      setUser({ ...user, ...patch })
      toast.success('Profil disimpan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <User className="h-6 w-6 text-[#1e5f3f]" />
              Profil & Pengaturan
            </h1>
            <p className="text-muted-foreground">Kelola data kontak, rekening, dan preferensi Anda</p>
          </div>
          <Button onClick={save} disabled={saving || loading}><Save className="mr-1 h-4 w-4" />{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Identitas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Nama</Label>
                    <Input value={user?.displayName ?? ''} disabled />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Email</Label>
                    <Input value={user?.email ?? ''} disabled />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status KYC:</span><KycBadge status={user?.kycStatus} />
                  </div>
                  {investorType && <span className="capitalize text-muted-foreground">Tipe: {investorType}</span>}
                  {npwp && <span className="text-muted-foreground">NPWP: {npwp}</span>}
                </div>
                <div>
                  <Label className="mb-1 block text-xs">No. Telepon</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08xx" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" />Rekening Bank</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs">Nama Bank</Label>
                  <Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="BCA / Mandiri / …" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Nomor Rekening</Label>
                  <Input value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-1 block text-xs">Atas Nama</Label>
                  <Input value={form.bankAccountHolder} onChange={e => setForm(f => ({ ...f, bankAccountHolder: e.target.value }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" />Preferensi Notifikasi</CardTitle></CardHeader>
              <CardContent>
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={form.notifyByEmail}
                    onChange={e => setForm(f => ({ ...f, notifyByEmail: e.target.checked }))}
                  />
                  <div>
                    <p className="text-sm font-medium">Notifikasi email</p>
                    <p className="text-xs text-muted-foreground">Terima email saat ada bukti transfer atau laporan baru.</p>
                  </div>
                </label>
              </CardContent>
            </Card>
          </>
        )}
    </main>
  )
}
