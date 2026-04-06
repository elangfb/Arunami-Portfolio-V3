import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Briefcase, TrendingUp, LogOut, UserCheck } from 'lucide-react'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Pengguna', icon: Users },
  { to: '/admin/portfolios', label: 'Portofolio', icon: Briefcase },
  { to: '/admin/investors', label: 'Investor', icon: UserCheck },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col" style={{ background: 'var(--sidebar-bg)' }}>
        <div className="flex h-16 items-center gap-3 px-6 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#38a169]">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
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
                {label}
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
              <p className="text-xs text-[#6b7280] truncate">Admin</p>
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
