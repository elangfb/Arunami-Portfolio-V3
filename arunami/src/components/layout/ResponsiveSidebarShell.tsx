import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/BrandMark'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface ResponsiveSidebarShellProps {
  /** Inner sidebar content only — the shell supplies the w-64 + dark background wrapper. */
  sidebar: ReactNode
  /** Main scroll area, typically <Outlet ... />. */
  children: ReactNode
  /** Short title shown in the mobile top bar. */
  mobileTitle?: ReactNode
}

/**
 * Responsive app shell for the dark sidebar layouts.
 * - Desktop (lg+): fixed 256px rail, unchanged from the original layouts.
 * - Mobile (<lg): rail hidden; a sticky top bar with a hamburger opens the same
 *   sidebar content as a slide-in left drawer (backdrop, Esc, scroll-lock,
 *   auto-close on route change).
 */
export function ResponsiveSidebarShell({
  sidebar,
  children,
  mobileTitle,
}: ResponsiveSidebarShellProps) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Auto-close on navigation / route change (NavLinks live inside `sidebar`).
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Reset when resizing up to desktop so the drawer state can't get stuck open.
  useEffect(() => {
    if (isDesktop) setOpen(false)
  }, [isDesktop])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useBodyScrollLock(open && !isDesktop)

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop rail */}
      <aside
        className="hidden lg:flex w-64 flex-col flex-shrink-0"
        style={{ background: 'var(--sidebar-bg)' }}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer + backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col transition-transform duration-300 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--sidebar-bg)' }}
        role="dialog"
        aria-modal="true"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          aria-label="Tutup menu"
          className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[#9ca3af] hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </Button>
        {sidebar}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            className="h-9 w-9 rounded-lg text-foreground hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-7 w-7 shrink-0" />
            <span className="truncate text-sm font-semibold">{mobileTitle ?? 'ARUNAMI'}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
