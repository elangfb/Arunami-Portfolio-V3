import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getUser, getAllocationsForInvestor, getPortfolioConfig, getFinancialData,
  getCommunicationsForInvestor, updateAllocation, getPortfolio,
} from '@/lib/firestore'
import { calculateDistribution } from '@/lib/distributionStrategies'
import { formatCurrencyCompact, formatCurrencyExact, formatPercent, MONTH_NAMES_ID } from '@/lib/utils'
import { formatPeriod } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Wallet, TrendingUp, Briefcase, BarChart3, Pencil, FileText, Search } from 'lucide-react'
import InvestorReportGenerator from './components/InvestorReportGenerator'
import type {
  AppUser, InvestorAllocation, FinancialData as FinancialDataType,
  PortfolioConfig, SlotBasedConfig, InvestorCommunication, Portfolio,
} from '@/types'

interface PortfolioEnriched {
  allocation: InvestorAllocation
  financial: FinancialDataType | null
  config: PortfolioConfig | null
  portfolio: Portfolio | null
  earnings: number
  monthlyROI: number
  netProfit: number
  periodLabel: string
}

export default function AdminInvestorDetail() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()

  const [investor, setInvestor] = useState<AppUser | null>(null)
  const [portfolios, setPortfolios] = useState<PortfolioEnriched[]>([])
  const [communications, setCommunications] = useState<InvestorCommunication[]>([])
  const [loading, setLoading] = useState(true)

  // Inline edit
  const [editAllocId, setEditAllocId] = useState<string | null>(null)
  const [editSlots, setEditSlots] = useState(1)

  // Report dialog
  const [reportOpen, setReportOpen] = useState(false)

  // Communication filters
  const [commsSearch, setCommsSearch] = useState('')
  const [commsTypeFilter, setCommsTypeFilter] = useState<'all' | 'report' | 'message'>('all')

  const loadData = async () => {
    if (!uid) return

    const [user, allocations, comms] = await Promise.all([
      getUser(uid),
      getAllocationsForInvestor(uid),
      getCommunicationsForInvestor(uid),
    ])

    if (!user) {
      toast.error('Investor tidak ditemukan')
      navigate('/admin/investors')
      return
    }

    setInvestor(user)
    setCommunications(comms)

    // Enrich each allocation with financial data
    const enriched = await Promise.all(
      allocations.map(async (allocation) => {
        const [config, financial, ptf] = await Promise.all([
          getPortfolioConfig(allocation.portfolioId),
          getFinancialData(allocation.portfolioId),
          getPortfolio(allocation.portfolioId),
        ])

        let earnings = 0
        let monthlyROI = 0
        let netProfit = 0
        let periodLabel = 'Bulan Ini'

        if (financial && config?.investorConfig && ptf) {
          const latestActual = [...financial.profitData].reverse().find(r => r.aktual > 0)
          const latestRevenue = [...financial.revenueData].reverse().find(r => r.aktual > 0)
          const latestActualPeriod = latestActual?.month ?? financial.profitData.at(-1)?.month
          netProfit = latestActual?.aktual ?? financial.profitData.at(-1)?.aktual ?? 0
          if (latestActualPeriod) periodLabel = formatPeriod(latestActualPeriod)

          const result = calculateDistribution({
            reportData: {
              period: latestActualPeriod ?? '',
              revenue: latestRevenue?.aktual ?? 0,
              netProfit,
              grossProfit: 0,
            },
            config: config.investorConfig,
            allocation,
            portfolio: ptf,
            isArunamiTeam: user?.isArunamiTeam,
          })
          earnings = result.perInvestorAmount
          monthlyROI = result.roiPercent
        }

        return { allocation, financial, config, portfolio: ptf, earnings, monthlyROI, netProfit, periodLabel }
      }),
    )

    setPortfolios(enriched)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [uid])

  const totalInvested = portfolios.reduce((s, p) => s + p.allocation.investedAmount, 0)
  const totalEarnings = portfolios.reduce((s, p) => s + p.earnings, 0)
  const portfolioCount = portfolios.length
  const avgROI = portfolios.length > 0
    ? portfolios.reduce((s, p) => s + p.monthlyROI, 0) / portfolios.length
    : 0

  const handleUpdateSlots = async (p: PortfolioEnriched) => {
    if (!p.config?.investorConfig || p.config.investorConfig.type !== 'slot_based') return
    const sc = p.config.investorConfig as SlotBasedConfig

    if (editSlots <= 0 || editSlots > sc.totalSlots) {
      toast.error(`Slot tidak valid. Maksimal ${sc.totalSlots} slot.`)
      return
    }

    try {
      await updateAllocation(
        p.allocation.id,
        { slots: editSlots, investedAmount: editSlots * sc.nominalPerSlot },
        p.allocation.portfolioId,
        sc.totalSlots,
      )
      toast.success('Alokasi berhasil diperbarui')
      setEditAllocId(null)
      loadData()
    } catch {
      toast.error('Gagal memperbarui alokasi')
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!investor) return null

  const formatCommsDate = (comm: InvestorCommunication) => {
    if (!comm.createdAt?.toDate) return '—'
    const d = comm.createdAt.toDate()
    return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`
  }

  const channelLabel: Record<string, string> = {
    clipboard: 'Clipboard',
    download: 'Cetak/Unduh',
    email: 'Email',
  }

  const filteredComms = communications.filter(comm => {
    if (commsTypeFilter !== 'all' && comm.type !== commsTypeFilter) return false
    if (commsSearch && !comm.subject.toLowerCase().includes(commsSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/investors')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{investor.displayName}</h1>
            <Badge variant="outline">Investor</Badge>
            {investor.isArunamiTeam && (
              <Badge variant="outline" className="border-green-600 text-green-700">Tim Arunami</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{investor.email}</p>
        </div>
        <Button onClick={() => setReportOpen(true)}>
          <FileText className="mr-2 h-4 w-4" />
          Buat Laporan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <Wallet className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Investasi</p>
                <p className="text-lg font-bold">{formatCurrencyCompact(totalInvested)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <TrendingUp className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Earning</p>
                <p className="text-lg font-bold">{formatCurrencyCompact(totalEarnings)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <Briefcase className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jumlah Portofolio</p>
                <p className="text-lg font-bold">{portfolioCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e5f3f]/10">
                <BarChart3 className="h-5 w-5 text-[#1e5f3f]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rata-rata ROI</p>
                <p className="text-lg font-bold">{formatPercent(avgROI)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Allocations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alokasi Portofolio</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada alokasi portofolio
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Portofolio</th>
                    <th className="text-center py-2.5 px-3 font-medium">Slot</th>
                    <th className="text-right py-2.5 px-3 font-medium">Investasi</th>
                    <th className="text-right py-2.5 px-3 font-medium">Earning Terakhir</th>
                    <th className="text-right py-2.5 px-3 font-medium">ROI Bulanan</th>
                    <th className="text-right py-2.5 px-3 font-medium w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {portfolios.map(p => {
                    const sc = p.config?.investorConfig?.type === 'slot_based'
                      ? (p.config.investorConfig as SlotBasedConfig)
                      : null

                    return (
                      <tr key={p.allocation.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3">
                          <p className="font-medium">{p.allocation.portfolioName}</p>
                          <p className="text-xs text-muted-foreground">{p.allocation.portfolioCode}</p>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {editAllocId === p.allocation.id ? (
                            <Input
                              type="number"
                              min={1}
                              max={sc?.totalSlots ?? 100}
                              value={editSlots}
                              onChange={e => setEditSlots(Number(e.target.value))}
                              className="w-20 mx-auto h-8 text-center"
                            />
                          ) : (
                            <Badge variant="secondary">{p.allocation.slots}</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {editAllocId === p.allocation.id && sc
                            ? formatCurrencyCompact(editSlots * sc.nominalPerSlot)
                            : formatCurrencyCompact(p.allocation.investedAmount)
                          }
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatCurrencyExact(p.earnings)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatPercent(p.monthlyROI)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {editAllocId === p.allocation.id ? (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditAllocId(null)}>
                                Batal
                              </Button>
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateSlots(p)}>
                                Simpan
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => { setEditAllocId(p.allocation.id); setEditSlots(p.allocation.slots) }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-medium">
                    <td className="py-2.5 px-3">Total</td>
                    <td className="py-2.5 px-3 text-center">
                      {portfolios.reduce((s, p) => s + p.allocation.slots, 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatCurrencyCompact(totalInvested)}</td>
                    <td className="py-2.5 px-3 text-right">{formatCurrencyExact(totalEarnings)}</td>
                    <td className="py-2.5 px-3 text-right">{formatPercent(avgROI)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Communication History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">Riwayat Komunikasi ({filteredComms.length})</CardTitle>
            {communications.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border">
                  {([['all', 'Semua'], ['report', 'Laporan'], ['message', 'Pesan']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setCommsTypeFilter(value)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        commsTypeFilter === value
                          ? 'bg-[#1e5f3f] text-white'
                          : 'hover:bg-muted/50'
                      } ${value === 'all' ? 'rounded-l-md' : value === 'message' ? 'rounded-r-md' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari subjek..."
                    value={commsSearch}
                    onChange={e => setCommsSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {communications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada riwayat komunikasi
            </p>
          ) : filteredComms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada komunikasi yang cocok
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Tanggal</th>
                    <th className="text-left py-2.5 px-3 font-medium">Tipe</th>
                    <th className="text-left py-2.5 px-3 font-medium">Subjek</th>
                    <th className="text-left py-2.5 px-3 font-medium">Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredComms.map(comm => (
                    <tr key={comm.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3">{formatCommsDate(comm)}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="capitalize">{comm.type === 'report' ? 'Laporan' : 'Pesan'}</Badge>
                      </td>
                      <td className="py-2.5 px-3">{comm.subject}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="secondary">{channelLabel[comm.channel] ?? comm.channel}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Generator Dialog */}
      <InvestorReportGenerator
        open={reportOpen}
        onOpenChange={setReportOpen}
        investor={investor}
        portfolioData={portfolios.map(p => ({
          allocation: p.allocation,
          financial: p.financial,
          config: p.config,
          portfolio: p.portfolio,
        }))}
      />
    </div>
  )
}
