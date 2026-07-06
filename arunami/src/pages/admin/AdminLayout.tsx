import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getAllPortfolios, getAllUsers, getAllAllocations } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { ResponsiveSidebarShell } from '@/components/layout/ResponsiveSidebarShell'
import { LayoutDashboard, Users, Briefcase, TrendingUp, LogOut, UserCheck, ScrollText, ShieldAlert } from 'lucide-react'

export default function AdminLayout() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  // Live "unfinished setup" attention counts surfaced as sidebar badges.
  const [noAnalystCount, setNoAnalystCount] = useState(0)
  const [unallocatedInvestorCount, setUnallocatedInvestorCount] = useState(0)

  useEffect(() => {
    Promise.all([getAllPortfolios(), getAllUsers(), getAllAllocations()])
      .then(([portfolios, users, allocations]) => {
        setNoAnalystCount(portfolios.filter(p => (p.assignedAnalysts?.length ?? 0) === 0).length)
        const allocatedUids = new Set(allocations.map(a => a.investorUid))
        setUnallocatedInvestorCount(
          users.filter(u => u.role === 'investor' && !u.archived && !allocatedUids.has(u.uid)).length,
        )
      })
      .catch(err => console.error('Failed to load admin badge counts', err))
  }, [])

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, badge: 0 },
    { to: '/admin/users', label: 'Pengguna', icon: Users, badge: 0 },
    { to: '/admin/portfolios', label: 'Portofolio', icon: Briefcase, badge: noAnalystCount },
    { to: '/admin/investors', label: 'Investor', icon: UserCheck, badge: unallocatedInvestorCount },
    { to: '/admin/health-rules', label: 'Kesehatan', icon: ShieldAlert, badge: 0 },
    { to: '/admin/audit-log', label: 'Log Audit', icon: ScrollText, badge: 0 },
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#38a169]">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white">ARUNAMI</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end, badge }) => (
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
              {badge > 0 && (
                <span
                  title="Perlu tindak lanjut"
                  className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white"
                >
                  {badge}
                </span>
              )}
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
    </>
  )

  return (
    <ResponsiveSidebarShell sidebar={sidebarContent} mobileTitle="Admin">
      <Outlet />
    </ResponsiveSidebarShell>
  )
}
