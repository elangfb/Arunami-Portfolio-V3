import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getAllAdminOverrides } from '@/lib/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ScrollText, Search, ChevronDown, ChevronRight, Briefcase, UserCheck } from 'lucide-react'
import type { AdminOverrideLog, AdminOverrideScope } from '@/types'

/** Friendly Indonesian label per recorded `section` string. */
const SECTION_LABELS: Record<string, string> = {
  master: 'Data master',
  config: 'Konfigurasi bagi hasil',
  allocation: 'Alokasi',
  payout: 'Bagi hasil',
  profile: 'Profil investor',
  pnl: 'PnL',
  projection: 'Proyeksi',
}

function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section
}

function formatDateTime(seconds: number | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function OverrideRow({ log }: { log: AdminOverrideLog }) {
  const [open, setOpen] = useState(false)
  const ScopeIcon = log.scope === 'portfolio' ? Briefcase : UserCheck
  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f]">
          <ScopeIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{sectionLabel(log.section)}</Badge>
            <span className="text-sm font-medium">{log.summary}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {log.targetLabel} · oleh {log.changedByName} · {formatDateTime(log.changedAt?.seconds)}
          </p>
          {log.reasonNote && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Alasan:</span> {log.reasonNote}
            </p>
          )}
        </div>
        {open
          ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="grid gap-3 border-t px-4 py-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Sebelum</p>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(log.before ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Sesudah</p>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(log.after ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AdminOverrideLog[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<AdminOverrideScope | 'all'>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    getAllAdminOverrides()
      .then(setLogs)
      .catch(err => {
        console.error('Failed to load audit log', err)
        toast.error('Gagal memuat log audit')
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return logs.filter(l => {
      if (scope !== 'all' && l.scope !== scope) return false
      if (!term) return true
      return (
        l.targetLabel?.toLowerCase().includes(term) ||
        l.summary?.toLowerCase().includes(term) ||
        l.changedByName?.toLowerCase().includes(term) ||
        l.reasonNote?.toLowerCase().includes(term)
      )
    })
  }, [logs, scope, q])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ScrollText className="h-6 w-6 text-[#38a169]" />
          Log Audit
        </h1>
        <p className="text-muted-foreground">
          Jejak setiap koreksi manual admin (data master, konfigurasi, alokasi & bagi hasil)
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cari nama target, ringkasan, atau alasan…"
            className="pl-9"
          />
        </div>
        <Select value={scope} onValueChange={v => setScope(v as AdminOverrideScope | 'all')}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua target</SelectItem>
            <SelectItem value="portfolio">Portofolio</SelectItem>
            <SelectItem value="investor">Investor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-12 animate-pulse rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? 'Belum ada aktivitas koreksi admin.' : 'Tidak ada entri yang cocok dengan filter.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{filtered.length} entri</p>
          <div className="space-y-3">
            {filtered.map(l => <OverrideRow key={l.id} log={l} />)}
          </div>
        </>
      )}
    </div>
  )
}
