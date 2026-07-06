import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getPortfolio, getPortfolioConfigOrDefault, getPublishedInvestorReports } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { isFixedReturnModel, FIXED_RETURN_VISIBLE_ROUTES } from '@/lib/projectTypeRules'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveSidebarShell } from '@/components/layout/ResponsiveSidebarShell'
import type { Portfolio, PortfolioConfig, InvestorReportDoc } from '@/types'
import {
  TrendingUp, LayoutDashboard, TrendingDown, BarChart2,
  DollarSign, ClipboardList, StickyNote, FileText,
  ChevronLeft, LogOut, Wallet, FileClock, ShieldCheck,
} from 'lucide-react'

export type InvestorReportTypeFilter = 'monthly' | 'quarterly'

export interface InvestorPortfolioOutletContext {
  portfolio: Portfolio | null
  portfolioConfig: PortfolioConfig | null
  portfolioId: string | undefined
  selectedPeriod: string
  setSelectedPeriod: (p: string) => void
  availablePeriods: string[]
  publishedReports: InvestorReportDoc[]
  reportTypeFilter: InvestorReportTypeFilter
  setReportTypeFilter: (t: InvestorReportTypeFilter) => void
  hasMonthly: boolean
  hasQuarterly: boolean
}

const navGroups = [
  {
    label: 'Analisis Finansial',
    items: [
      { to: 'overview', label: 'Overview', icon: LayoutDashboard },
      { to: 'revenue', label: 'Revenue & Profit', icon: BarChart2 },
      { to: 'costs', label: 'Struktur Biaya', icon: DollarSign },
      { to: 'returns', label: 'Return Saya', icon: TrendingDown },
    ],
  },
  {
    label: 'Management & Notes',
    items: [
      { to: 'management', label: 'Portfolio Management', icon: ClipboardList },
      { to: 'notes', label: 'Arunami Notes', icon: StickyNote },
      { to: 'governance', label: 'Covenant & Milestone', icon: ShieldCheck },
    ],
  },
  {
    label: 'Laporan',
    items: [
      { to: 'resume', label: 'Resume Bagi Hasil', icon: Wallet },
      { to: 'report', label: 'Laporan Investor', icon: FileText },
      { to: 'contract', label: 'Kontrak', icon: FileClock },
    ],
  },
]

export default function InvestorPortfolioLayout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser } = useAuthStore()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [publishedReports, setPublishedReports] = useState<InvestorReportDoc[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [reportTypeFilter, setReportTypeFilter] = useState<InvestorReportTypeFilter>('monthly')

  useEffect(() => {
    if (!id) return
    setConfigLoaded(false)
    Promise.all([getPortfolio(id), getPortfolioConfigOrDefault(id)])
      .then(([p, c]) => {
        setPortfolio(p)
        setPortfolioConfig(c)
      })
      .finally(() => setConfigLoaded(true))
  }, [id])

  // Fetch this investor's published reports for this portfolio
  useEffect(() => {
    if (!id || !user) return
    ;(async () => {
      const all = await getPublishedInvestorReports(user.uid)
      const forPortfolio = all
        .filter(r => r.portfolioId === id)
        .sort((a, b) => comparePeriods(b.period, a.period))
      setPublishedReports(forPortfolio)
    })()
  }, [id, user])

  // Grace projects slim to just the report too: the operational pages have no
  // PnL data yet, and the grace report already carries the management summary,
  // notes, and any fixed-yield return.
  const isFixed = isFixedReturnModel(portfolioConfig?.returnModel)
  const slimNav = isFixed || portfolio?.isGracePeriod === true

  const monthlyReports = useMemo(
    () => publishedReports.filter(r => (r.reportType ?? 'monthly') === 'monthly'),
    [publishedReports],
  )
  const quarterlyReports = useMemo(
    () => publishedReports.filter(r => r.reportType === 'quarterly'),
    [publishedReports],
  )
  const hasMonthly = monthlyReports.length > 0
  const hasQuarterly = quarterlyReports.length > 0

  // Default the report-type filter to whichever group has data.
  useEffect(() => {
    if (hasMonthly) setReportTypeFilter('monthly')
    else if (hasQuarterly) setReportTypeFilter('quarterly')
  }, [hasMonthly, hasQuarterly])

  const activeReports = reportTypeFilter === 'quarterly' ? quarterlyReports : monthlyReports
  const availablePeriods = useMemo(
    () => [...new Set(activeReports.map(r => r.period))],
    [activeReports],
  )

  // Pin selectedPeriod to the active report-type group whenever the filter
  // changes or the underlying reports load.
  useEffect(() => {
    if (availablePeriods.length === 0) {
      setSelectedPeriod('')
      return
    }
    if (!availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(availablePeriods[0])
    }
  }, [availablePeriods, selectedPeriod])

  // For fixed-return AND grace projects, redirect away from hidden operational pages.
  useEffect(() => {
    if (!configLoaded || !id || !slimNav) return
    const sub = location.pathname.split(`/investor/portfolios/${id}/`)[1] ?? ''
    const segment = sub.split('/')[0] ?? ''
    if (segment && !FIXED_RETURN_VISIBLE_ROUTES.has(segment)) {
      navigate(`/investor/portfolios/${id}/report`, { replace: true })
    }
  }, [configLoaded, slimNav, id, location.pathname, navigate])

  const filteredNavGroups = useMemo(
    () => (slimNav ? navGroups.filter(g => g.label === 'Laporan') : navGroups),
    [slimNav],
  )

  const handleLogout = async () => {
    await signOut(auth); setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  const outletContext: InvestorPortfolioOutletContext = {
    portfolio,
    portfolioConfig,
    portfolioId: id,
    selectedPeriod,
    setSelectedPeriod,
    availablePeriods,
    publishedReports: activeReports,
    reportTypeFilter,
    setReportTypeFilter,
    hasMonthly,
    hasQuarterly,
  }

  const sidebarContent = (
    <>
        <div className="flex h-16 items-center gap-3 px-4 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#38a169]">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-base font-bold text-white truncate leading-tight">
              {portfolio?.brandName || portfolio?.name || 'ARUNAMI'}
            </span>
            {portfolio?.name && (
              <span className="text-[10px] text-white/60 truncate leading-tight">
                {portfolio.name}
              </span>
            )}
          </div>
        </div>

        {/* Period Selector */}
        <div className="px-4 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280] mb-1">Periode Laporan</p>
          {hasMonthly && hasQuarterly && (
            <div className="mb-2 flex rounded-md border border-white/10 bg-white/5 p-0.5">
              {(['monthly', 'quarterly'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReportTypeFilter(t)}
                  className={cn(
                    'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                    reportTypeFilter === t
                      ? 'bg-[#38a169] text-white'
                      : 'text-[#9ca3af] hover:text-white',
                  )}
                >
                  {t === 'monthly' ? 'Bulanan' : 'Kuartalan'}
                </button>
              ))}
            </div>
          )}
          {availablePeriods.length > 0 ? (
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full rounded-md border border-white/10 bg-white/5 text-sm text-white focus:ring-0 focus:ring-offset-0 focus:border-[#38a169]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#1f2937] text-white">
                {availablePeriods.map(p => (
                  <SelectItem key={p} value={p} className="focus:bg-white/10 focus:text-white">{formatPeriod(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-[#6b7280] italic">Belum ada laporan diterbitkan</p>
          )}
        </div>

        {/* Back link */}
        <div className="px-4 pt-3">
          <Link to="/investor" className="flex items-center gap-2 text-xs text-[#9ca3af] hover:text-white transition-colors">
            <ChevronLeft className="h-3 w-3" /> Kembali ke Dashboard
          </Link>
        </div>

        {/* Grouped navigation */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {filteredNavGroups.map(group => (
            <div key={group.label} className="px-3">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
              </div>
            </div>
          ))}
        </div>

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
    </>
  )

  return (
    <ResponsiveSidebarShell
      sidebar={sidebarContent}
      mobileTitle={portfolio?.brandName || portfolio?.name || 'ARUNAMI'}
    >
      <Outlet context={outletContext} />
    </ResponsiveSidebarShell>
  )
}
