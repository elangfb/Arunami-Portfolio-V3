import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getSystemSettings, saveSystemSettings, DEFAULT_SYSTEM_SETTINGS } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Save } from 'lucide-react'
import type { SystemSettings, UserRole } from '@/types'

type SettingsForm = Omit<SystemSettings, 'updatedAt' | 'updatedBy'>

const TOGGLES: { key: keyof SettingsForm; label: string; help: string }[] = [
  { key: 'requireKycForAllocation', label: 'Wajib KYC untuk alokasi', help: 'Hanya investor terverifikasi yang bisa dimasukkan ke cap table.' },
  { key: 'allowInvestorSelfRegister', label: 'Izinkan registrasi mandiri investor', help: 'Investor dapat mendaftar sendiri (fitur mendatang).' },
  { key: 'maintenanceMode', label: 'Mode pemeliharaan', help: 'Tampilkan notice pemeliharaan (fitur mendatang).' },
]

// Read-only reference of what each role can do (mirrors firestore.rules).
const ROLE_MATRIX: { role: UserRole | 'Semua'; label: string; caps: string }[] = [
  { role: 'admin', label: 'Admin', caps: 'Akses penuh: pengguna, portofolio, KYC, batch, pengaturan, audit.' },
  { role: 'analyst', label: 'BA-PM (Analis)', caps: 'Kelola portofolio yang ditugaskan: PnL, laporan, milestone, covenant.' },
  { role: 'investor_relation', label: 'Investor Relations', caps: 'Baca domain investor; kirim bukti transfer & laporan akumulasi.' },
  { role: 'investor', label: 'Investor', caps: 'Baca portofolio & laporan sendiri; tandai laporan dibaca.' },
]

export default function AdminSettings() {
  const { user } = useAuthStore()
  const [form, setForm] = useState<SettingsForm>(DEFAULT_SYSTEM_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSystemSettings()
      .then(s => setForm({
        brandName: s.brandName,
        supportEmail: s.supportEmail,
        requireKycForAllocation: s.requireKycForAllocation,
        allowInvestorSelfRegister: s.allowInvestorSelfRegister,
        maintenanceMode: s.maintenanceMode,
        defaultArunamiFeePercent: s.defaultArunamiFeePercent,
      }))
      .catch(err => { console.error(err); toast.error('Gagal memuat pengaturan') })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await saveSystemSettings(form, user?.uid ?? '')
      toast.success('Pengaturan disimpan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8"><div className="h-64 animate-pulse rounded-lg bg-muted" /></div>

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings className="h-6 w-6 text-[#38a169]" />
            Pengaturan Sistem
          </h1>
          <p className="text-muted-foreground">Branding, kebijakan, dan preferensi platform</p>
        </div>
        <Button onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? 'Menyimpan…' : 'Simpan'}</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Branding & Umum</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1 block text-xs">Nama Brand</Label>
              <Input value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Email Dukungan</Label>
              <Input type="email" value={form.supportEmail} onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))} placeholder="support@arunami.id" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fee Arunami Default (%)</Label>
              <Input
                type="number"
                value={form.defaultArunamiFeePercent}
                onChange={e => setForm(f => ({ ...f, defaultArunamiFeePercent: Number(e.target.value) }))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Pre-isi wizard portofolio baru.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Kebijakan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {TOGGLES.map(t => (
              <label key={t.key} className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={form[t.key] as boolean}
                  onChange={e => setForm(f => ({ ...f, [t.key]: e.target.checked }))}
                />
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.help}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Matriks Peran (referensi)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium w-48">Peran</th>
                  <th className="px-3 py-2 text-left font-medium">Kapabilitas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ROLE_MATRIX.map(r => (
                  <tr key={r.role}>
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.caps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Ditegakkan oleh firestore.rules — hanya referensi, tidak dapat diubah di sini.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
