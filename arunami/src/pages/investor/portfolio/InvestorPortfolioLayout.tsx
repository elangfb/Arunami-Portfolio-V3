import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams, useNavigate, Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getPortfolio } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import type { Portfolio } from '@/types'
import { TrendingUp, LayoutDashboard, TrendingDown, Download, ChevronLeft, LogOut } from 'lucide-react'

const navItems = [
  { to: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: 'returns', label: 'Return Saya', icon: TrendingDown },
  { to: 'report', label: 'Download Laporan', icon: Download },
]

export default function InvestorPortfolioLayout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => {
    if (id) getPortfolio(id).then(setPortfolio)
  }, [id])

  const handleLogout = async () => {
    await signOut(auth); setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-60 flex-col flex-shrink-0" style={{ background: 'var(--sidebar-bg)' }}>
        <div className="flex h-16 items-center gap-3 px-4 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#38a169]">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className="text-base font-bold text-white truncate">{portfolio?.name ?? 'ARUNAMI'}</span>
        </div>

        <div className="px-4 pt-3">
          <Link to="/investor" className="flex items-center gap-2 text-xs text-[#9ca3af] hover:text-white transition-colors">
            <ChevronLeft className="h-3 w-3" /> Kembali
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
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

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#38a169]/30 text-[#38a169] text-xs font-bold">
              {user?.displayName?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
              <p className="text-xs text-[#6b7280]">Investor</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#9ca3af] hover:bg-white/5 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ portfolio, portfolioId: id }} />
      </main>
    </div>
  )
}
