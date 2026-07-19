import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getInvestorPortfolios, getPublishedInvestorReports } from '@/lib/firestore'
import { contractStatus } from '@/lib/contracts'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { ResponsiveSidebarShell } from '@/components/layout/ResponsiveSidebarShell'
import { BrandMark } from '@/components/BrandMark'
import {
  LayoutDashboard, Wallet, BarChart3, FileText, FolderOpen, FileClock, User,
  LogOut,
} from 'lucide-react'

export default function InvestorLayout() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  // Live attention counts surfaced as sidebar badges (mirrors AdminLayout).
  const [unreadReportCount, setUnreadReportCount] = useState(0)
  const [renewalSoonCount, setRenewalSoonCount] = useState(0)

  useEffect(() => {
    if (!user) return
    Promise.all([getInvestorPortfolios(user.uid), getPublishedInvestorReports(user.uid)])
      .then(([portfolios, reports]) => {
        setUnreadReportCount(
          reports.filter(r => (r.scope === 'accumulated' || r.scope === 'all_time') && !r.isRead).length,
        )
        setRenewalSoonCount(
          portfolios.filter(p => contractStatus(p.contractStart, p.contractEnd).severity === 'kritis').length,
        )
      })
      .catch(err => console.error('Failed to load investor badge counts', err))
  }, [user])

  const navItems = [
    { to: '/investor', label: 'Dashboard', icon: LayoutDashboard, end: true, badge: 0 },
    { to: '/investor/distributions', label: 'Distribusi', icon: Wallet, badge: 0 },
    { to: '/investor/performance', label: 'Kinerja', icon: BarChart3, badge: 0 },
    { to: '/investor/reports', label: 'Laporan Saya', icon: FileText, badge: unreadReportCount },
    { to: '/investor/documents', label: 'Dokumen', icon: FolderOpen, badge: 0 },
    { to: '/investor/contracts', label: 'Kontrak', icon: FileClock, badge: renewalSoonCount },
    { to: '/investor/profile', label: 'Profil', icon: User, badge: 0 },
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
        <div className="min-w-0">
          <span className="block text-lg font-bold leading-tight text-white">ARUNAMI</span>
          <span className="block text-[11px] leading-tight text-[#7A96B3]">Portal Investor</span>
        </div>
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
                  title="Perlu perhatian"
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
            <p className="text-xs text-[#6b7280] truncate">Investor</p>
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
    <ResponsiveSidebarShell sidebar={sidebarContent} mobileTitle="Investor">
      <Outlet />
    </ResponsiveSidebarShell>
  )
}
