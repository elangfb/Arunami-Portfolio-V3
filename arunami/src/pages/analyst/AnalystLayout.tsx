import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { ResponsiveSidebarShell } from '@/components/layout/ResponsiveSidebarShell'
import { BrandMark } from '@/components/BrandMark'
import {
  LayoutDashboard, Briefcase, LogOut, Table2, BarChart3,
  FileClock, Mail, StickyNote, Presentation,
} from 'lucide-react'

export default function AnalystLayout() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const navItems = [
    { to: '/analyst', label: 'Dashboard', icon: Briefcase, end: true },
    { to: '/analyst/overview', label: 'Ringkasan Global', icon: LayoutDashboard },
    { to: '/analyst/monthly', label: 'Data Bulanan', icon: Table2 },
    { to: '/analyst/benchmarking', label: 'Benchmarking', icon: BarChart3 },
    { to: '/analyst/renewals', label: 'Perpanjangan Kontrak', icon: FileClock },
    { to: '/analyst/engagement', label: 'Engagement', icon: Mail },
    { to: '/analyst/notes', label: 'Catatan Global', icon: StickyNote },
    { to: '/analyst/meeting', label: 'Mode Rapat', icon: Presentation },
  ]

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-3 px-6 border-b border-white/10">
        <BrandMark className="h-8 w-8" />
        <span className="text-lg font-bold text-white">ARUNAMI</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#38a169]/20 text-[#38a169]'
                    : 'text-[#9ca3af] hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#38a169]/30 text-[#38a169] text-xs font-bold">
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
            <p className="text-xs text-[#6b7280] truncate">Analis</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#9ca3af] hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </div>
    </>
  )

  return (
    <ResponsiveSidebarShell sidebar={sidebarContent} mobileTitle="Analis">
      <Outlet />
    </ResponsiveSidebarShell>
  )
}
