import { useEffect, useState } from 'react'
import { getAnnouncements } from '@/lib/firestore'
import { Megaphone, X } from 'lucide-react'
import type { Announcement, UserRole } from '@/types'

/**
 * Additive, dismissible banner surfacing active admin announcements to the
 * current role. Renders nothing when there are none. Dismissals persist in
 * localStorage (per announcement id) so a user isn't re-nagged every visit.
 */
export function AnnouncementsBanner({ role }: { role: UserRole }) {
  const [items, setItems] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dismissedAnnouncements') ?? '[]')) }
    catch { return new Set() }
  })

  useEffect(() => {
    getAnnouncements()
      .then(all => setItems(all.filter(a => a.active && (a.audience === 'all' || a.audience === role))))
      .catch(() => { /* non-critical banner — stay silent */ })
  }, [role])

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    try { localStorage.setItem('dismissedAnnouncements', JSON.stringify([...next])) } catch { /* noop */ }
  }

  const visible = items.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {visible.map(a => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border border-[#38a169]/30 bg-[#38a169]/5 p-3">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#1e5f3f]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
          </div>
          <button onClick={() => dismiss(a.id)} title="Tutup" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
