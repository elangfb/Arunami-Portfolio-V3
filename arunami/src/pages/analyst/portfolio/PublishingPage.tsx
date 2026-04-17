import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getReports, getManagementReports, getNotes,
  getAllocationsForPortfolio, getPortfolioConfigOrDefault,
  getInvestorReportsForPortfolio,
  upsertInvestorReportDraft, publishInvestorReport, publishAllInvestorReports,
  unpublishInvestorReport, unpublishAllInvestorReports,
  getAllUsers,
} from '@/lib/firestore'
import { buildInvestorReportHtml } from '@/lib/reportHtml'
import { formatPeriod, comparePeriods } from '@/lib/dateUtils'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Send, Upload, FileCheck2, CheckCircle2, Undo2 } from 'lucide-react'
import type {
  Portfolio, PortfolioConfig, InvestorAllocation, PortfolioReport,
  PnLExtractedData, ProjectionExtractedData, ManagementReport, Note,
  InvestorReportDoc, AppUser,
} from '@/types'

interface Context { portfolio: Portfolio | null; portfolioId: string | undefined }

export default function PublishingPage() {
  const { portfolio, portfolioId } = useOutletContext<Context>()
  const { user } = useAuthStore()

  // Source data
  const [pnlReports, setPnlReports] = useState<PortfolioReport[]>([])
  const [projReports, setProjReports] = useState<PortfolioReport[]>([])
  const [mgmtReports, setMgmtReports] = useState<ManagementReport[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [allocations, setAllocations] = useState<InvestorAllocation[]>([])
  const [investorSharePercent, setInvestorSharePercent] = useState<number>(0)
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null)
  const [loading, setLoading] = useState(true)

  // Publishing state
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [selectedInvestorUid, setSelectedInvestorUid] = useState<string>('')
  const [existingReports, setExistingReports] = useState<InvestorReportDoc[]>([])
  const [publishing, setPublishing] = useState(false)
  const [investors, setInvestors] = useState<AppUser[]>([])

  // Load base data once per portfolio
  useEffect(() => {
    if (!portfolioId) return
    ;(async () => {
      const [pnls, projs, mgmts, n, allocs, config, usrs] = await Promise.all([
        getReports(portfolioId, 'pnl'),
        getReports(portfolioId, 'projection'),
        getManagementReports(portfolioId),
        getNotes(portfolioId),
        getAllocationsForPortfolio(portfolioId),
        getPortfolioConfigOrDefault(portfolioId),
        getAllUsers(),
      ])
      setPnlReports(pnls)
      setProjReports(projs)
      setMgmtReports(mgmts)
      setNotes(n)
      setAllocations(allocs)
      setPortfolioConfig(config)
      setInvestors(usrs)
      setInvestorSharePercent(config.investorConfig.investorSharePercent)
      // Auto-pick latest period that has a P&L, fall back to latest projection
      const allPeriods = [...new Set([...pnls, ...projs].map(r => r.period))]
        .sort((a, b) => comparePeriods(b, a))
      if (allPeriods.length > 0) setSelectedPeriod(allPeriods[0])
      if (allocs.length > 0) setSelectedInvestorUid(allocs[0].investorUid)
      setLoading(false)
    })()
  }, [portfolioId])

  // Load existing publish state for the selected period
  const refreshExisting = async () => {
    if (!portfolioId || !selectedPeriod) {
      setExistingReports([])
      return
    }
    const existing = await getInvestorReportsForPortfolio(portfolioId, selectedPeriod)
    setExistingReports(existing)
  }

  useEffect(() => { refreshExisting() }, [portfolioId, selectedPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  const availablePeriods = useMemo(
    () => [...new Set([...pnlReports, ...projReports].map(r => r.period))]
      .sort((a, b) => comparePeriods(b, a)),
    [pnlReports, projReports],
  )

  const selectedAllocation = allocations.find(a => a.investorUid === selectedInvestorUid) ?? null

  // Generate preview HTML client-side
  const previewHtml = useMemo(() => {
    if (!portfolio || !selectedAllocation || !selectedPeriod) return ''
    const investorUser = investors.find(u => u.uid === selectedAllocation.investorUid)
    return buildInvestorReportHtml({
      portfolio,
      config: portfolioConfig ?? undefined,
      allocation: selectedAllocation,
      investorSharePercent,
      isArunamiTeam: investorUser?.isArunamiTeam,
      period: selectedPeriod,
      pnlReports: pnlReports.map(r => r.extractedData as PnLExtractedData),
      projectionReports: projReports.map(r => r.extractedData as ProjectionExtractedData),
      managementReports: mgmtReports,
      notes,
    })
  }, [portfolio, portfolioConfig, selectedAllocation, investorSharePercent, selectedPeriod, pnlReports, projReports, mgmtReports, notes])

  const statusFor = (uid: string) =>
    existingReports.find(r => r.investorUid === uid)?.status ?? null

  const handlePublishIndividual = async () => {
    if (!portfolio || !portfolioId || !selectedAllocation || !selectedPeriod || !user) return
    setPublishing(true)
    try {
      const reportId = await upsertInvestorReportDraft({
        portfolioId,
        portfolioName: portfolio.name,
        investorUid: selectedAllocation.investorUid,
        investorName: selectedAllocation.investorName,
        period: selectedPeriod,
        htmlContent: previewHtml,
      })
      await publishInvestorReport({ portfolioId, reportId, publishedBy: user.uid })
      toast.success(`Dipublikasikan ke ${selectedAllocation.investorName}`)
      await refreshExisting()
    } catch (err) {
      console.error(err)
      toast.error('Gagal mempublikasikan laporan')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublishIndividual = async () => {
    if (!portfolioId || !selectedAllocation || !selectedPeriod) return
    const existing = existingReports.find(r => r.investorUid === selectedAllocation.investorUid)
    if (!existing || existing.status !== 'published') return
    if (!window.confirm(`Tarik laporan ${formatPeriod(selectedPeriod)} dari ${selectedAllocation.investorName}?`)) return
    setPublishing(true)
    try {
      await unpublishInvestorReport({ portfolioId, reportId: existing.id })
      toast.success(`Laporan ${selectedAllocation.investorName} ditarik`)
      await refreshExisting()
    } catch (err) {
      console.error(err)
      toast.error('Gagal menarik laporan')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublishAll = async () => {
    if (!portfolioId || !selectedPeriod) return
    const publishedCount = existingReports.filter(r => r.status === 'published').length
    if (publishedCount === 0) {
      toast.error('Belum ada laporan yang diterbitkan untuk periode ini.')
      return
    }
    if (!window.confirm(`Tarik ${publishedCount} laporan ${formatPeriod(selectedPeriod)} dari semua investor?`)) return
    setPublishing(true)
    try {
      const n = await unpublishAllInvestorReports({ portfolioId, period: selectedPeriod })
      toast.success(`${n} laporan ditarik`)
      await refreshExisting()
    } catch (err) {
      console.error(err)
      toast.error('Gagal menarik semua laporan')
    } finally {
      setPublishing(false)
    }
  }

  const handlePublishAll = async () => {
    if (!portfolio || !portfolioId || !selectedPeriod || !user) return
    if (allocations.length === 0) {
      toast.error('Belum ada investor di portofolio ini.')
      return
    }
    if (!window.confirm(`Publikasikan laporan ${formatPeriod(selectedPeriod)} ke semua ${allocations.length} investor?`)) {
      return
    }
    setPublishing(true)
    try {
      const reports = allocations.map(alloc => {
        const investorUser = investors.find(u => u.uid === alloc.investorUid)
        return {
          portfolioName: portfolio.name,
          investorUid: alloc.investorUid,
          investorName: alloc.investorName,
          htmlContent: buildInvestorReportHtml({
            portfolio,
            config: portfolioConfig ?? undefined,
            allocation: alloc,
            investorSharePercent,
            isArunamiTeam: investorUser?.isArunamiTeam,
            period: selectedPeriod,
            pnlReports: pnlReports.map(r => r.extractedData as PnLExtractedData),
            projectionReports: projReports.map(r => r.extractedData as ProjectionExtractedData),
            managementReports: mgmtReports,
            notes,
          }),
        }
      })
      await publishAllInvestorReports({
        portfolioId,
        period: selectedPeriod,
        reports,
        publishedBy: user.uid,
      })
      toast.success(`${reports.length} laporan dipublikasikan`)
      await refreshExisting()
    } catch (err) {
      console.error(err)
      toast.error('Gagal mempublikasikan semua laporan')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
  }

  const publishedCount = existingReports.filter(r => r.status === 'published').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Review &amp; Publishing</h2>
          <p className="text-sm text-muted-foreground">
            Periksa laporan per investor sebelum dipublikasikan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Pilih periode" />
            </SelectTrigger>
            <SelectContent>
              {availablePeriods.map(p => (
                <SelectItem key={p} value={p}>{formatPeriod(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleUnpublishAll}
            disabled={publishing || !selectedPeriod || existingReports.every(r => r.status !== 'published')}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Unpublish Semua
          </Button>
          <Button
            variant="outline"
            onClick={handlePublishAll}
            disabled={publishing || !selectedPeriod || allocations.length === 0}
          >
            <Upload className="mr-2 h-4 w-4" />
            Publish ke Semua Investor
          </Button>
        </div>
      </div>

      {availablePeriods.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Belum ada data P&amp;L atau proyeksi untuk dipublikasikan.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Investor list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Investor ({publishedCount}/{allocations.length} terbit)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Belum ada alokasi investor.
                </p>
              ) : (
                <ul className="divide-y">
                  {allocations.map(alloc => {
                    const status = statusFor(alloc.investorUid)
                    const isSelected = alloc.investorUid === selectedInvestorUid
                    return (
                      <li key={alloc.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedInvestorUid(alloc.investorUid)}
                          className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40 ${
                            isSelected ? 'bg-muted/60' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{alloc.investorName}</p>
                            {alloc.investorEmail && (
                              <p className="text-xs text-muted-foreground truncate">{alloc.investorEmail}</p>
                            )}
                          </div>
                          {status === 'published' ? (
                            <Badge variant="success" className="shrink-0">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Published
                            </Badge>
                          ) : status === 'draft' ? (
                            <Badge variant="outline" className="shrink-0">Draft</Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 text-muted-foreground">—</Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">
                  {selectedAllocation
                    ? `Preview — ${selectedAllocation.investorName}`
                    : 'Preview'}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatPeriod(selectedPeriod)}
                </p>
              </div>
              <div className="flex gap-2">
                {statusFor(selectedInvestorUid) === 'published' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnpublishIndividual}
                    disabled={publishing || !selectedAllocation}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Unpublish
                  </Button>
                )}
                <Button
                  onClick={handlePublishIndividual}
                  disabled={publishing || !selectedAllocation}
                  size="sm"
                >
                  {statusFor(selectedInvestorUid) === 'published' ? (
                    <><FileCheck2 className="mr-2 h-4 w-4" /> Re-publish</>
                  ) : (
                    <><Send className="mr-2 h-4 w-4" /> Publish ke Investor Ini</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {previewHtml ? (
                <iframe
                  title="investor-report-preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="w-full min-h-[720px] rounded-md border bg-white"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Pilih investor untuk melihat preview.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
