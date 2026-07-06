import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getAllUsers, uploadKycDocument, saveKycReview } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import {
  KYC_STATUS_LABELS, KYC_DOC_LABELS, KYC_DOC_SLOTS, kycStatusOf,
} from '@/lib/kyc'
import { KycBadge } from '@/components/shared/KycBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  ShieldCheck, Search, Upload, FileText, ExternalLink, Check, X, Loader2,
} from 'lucide-react'
import type { AppUser, KycStatus, KycDocSlot, KycDocument, InvestorType } from '@/types'

const STATUS_ORDER: KycStatus[] = ['pending', 'unverified', 'verified', 'rejected']

export default function AdminKyc() {
  const { user } = useAuthStore()
  const [investors, setInvestors] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<KycStatus | 'all'>('all')
  const [reviewing, setReviewing] = useState<AppUser | null>(null)

  const load = () => {
    getAllUsers()
      .then(users => setInvestors(users.filter(u => u.role === 'investor')))
      .catch(err => { console.error(err); toast.error('Gagal memuat data investor') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c: Record<KycStatus, number> = { unverified: 0, pending: 0, verified: 0, rejected: 0 }
    for (const inv of investors) c[kycStatusOf(inv.kycStatus)]++
    return c
  }, [investors])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return investors
      .filter(inv => statusFilter === 'all' || kycStatusOf(inv.kycStatus) === statusFilter)
      .filter(inv => !q || inv.displayName.toLowerCase().includes(q) || inv.email.toLowerCase().includes(q))
      .sort((a, b) => STATUS_ORDER.indexOf(kycStatusOf(a.kycStatus)) - STATUS_ORDER.indexOf(kycStatusOf(b.kycStatus)))
  }, [investors, statusFilter, search])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-[#38a169]" />
          Verifikasi KYC
        </h1>
        <p className="text-muted-foreground">Tinjau dokumen dan status verifikasi investor</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_ORDER.map(s => (
          <Card key={s}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{KYC_STATUS_LABELS[s]}</p>
              <p className="text-2xl font-bold">{counts[s]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau email…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as KycStatus | 'all')}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{KYC_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="px-3 py-3 text-left font-medium">Investor</th>
                <th className="px-3 py-3 text-left font-medium">Tipe</th>
                <th className="px-3 py-3 text-center font-medium">Dokumen</th>
                <th className="px-3 py-3 text-center font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Tidak ada investor yang cocok.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.uid} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{inv.displayName}</div>
                    <div className="text-xs text-muted-foreground">{inv.email}</div>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">{inv.investorType ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{inv.kycDocuments?.length ?? 0}/3</td>
                  <td className="px-3 py-2.5 text-center"><KycBadge status={inv.kycStatus} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="sm" variant="outline" onClick={() => setReviewing(inv)}>Tinjau</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {reviewing && (
        <KycReviewDialog
          investor={reviewing}
          reviewerUid={user?.uid ?? ''}
          reviewerName={user?.displayName ?? 'Admin'}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); load() }}
        />
      )}
    </div>
  )
}

function KycReviewDialog({
  investor, reviewerUid, reviewerName, onClose, onSaved,
}: {
  investor: AppUser
  reviewerUid: string
  reviewerName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [investorType, setInvestorType] = useState<InvestorType | ''>(investor.investorType ?? '')
  const [npwp, setNpwp] = useState(investor.npwp ?? '')
  const [docs, setDocs] = useState<Partial<Record<KycDocSlot, KycDocument>>>(() => {
    const map: Partial<Record<KycDocSlot, KycDocument>> = {}
    for (const d of investor.kycDocuments ?? []) map[d.slot] = d
    return map
  })
  const [uploading, setUploading] = useState<KycDocSlot | null>(null)
  const [rejectionReason, setRejectionReason] = useState(investor.kycRejectionReason ?? '')
  const [saving, setSaving] = useState<KycStatus | null>(null)

  const handleUpload = async (slot: KycDocSlot, file: File) => {
    setUploading(slot)
    try {
      const meta = await uploadKycDocument(investor.uid, slot, file)
      setDocs(prev => ({ ...prev, [slot]: meta }))
      toast.success(`${KYC_DOC_LABELS[slot]} diunggah`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah dokumen')
    } finally {
      setUploading(null)
    }
  }

  const save = async (status: KycStatus) => {
    if (status === 'rejected' && !rejectionReason.trim()) {
      toast.error('Isi alasan penolakan terlebih dahulu.')
      return
    }
    setSaving(status)
    try {
      await saveKycReview({
        uid: investor.uid,
        status,
        investorType: investorType || undefined,
        npwp,
        documents: Object.values(docs).filter(Boolean) as KycDocument[],
        reviewedBy: reviewerUid,
        reviewedByName: reviewerName,
        rejectionReason,
      })
      toast.success('Status KYC disimpan')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
      setSaving(null)
    }
  }

  const busy = saving !== null || uploading !== null

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tinjau KYC — {investor.displayName}</DialogTitle>
          <DialogDescription>{investor.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Tipe Investor</Label>
              <Select value={investorType || undefined} onValueChange={v => setInvestorType(v as InvestorType)}>
                <SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individu">Individu</SelectItem>
                  <SelectItem value="institusi">Institusi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">NPWP</Label>
              <Input value={npwp} onChange={e => setNpwp(e.target.value)} placeholder="00.000.000.0-000.000" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Dokumen</Label>
            {KYC_DOC_SLOTS.map(slot => {
              const existing = docs[slot]
              return (
                <div key={slot} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{KYC_DOC_LABELS[slot]}</p>
                    {existing ? (
                      <a href={existing.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-[#1e5f3f] hover:underline">
                        {existing.fileName}<ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">Belum ada file</p>
                    )}
                  </div>
                  <label className="shrink-0">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      className="hidden"
                      disabled={busy}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot, f); e.target.value = '' }}
                    />
                    <span className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
                      {uploading === slot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      {existing ? 'Ganti' : 'Unggah'}
                    </span>
                  </label>
                </div>
              )
            })}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Alasan penolakan (wajib jika ditolak)</Label>
            <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={2} placeholder="Contoh: KTP buram / NPWP tidak sesuai" />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" disabled={busy} onClick={() => save('pending')}>
            Simpan sebagai Menunggu
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => save('rejected')}
            >
              {saving === 'rejected' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
              Tolak
            </Button>
            <Button disabled={busy} onClick={() => save('verified')}>
              {saving === 'verified' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Verifikasi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
