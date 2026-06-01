import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPeriod } from '@/lib/dateUtils'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

// Personal Reports (1-on-1 investor communications) are handled offline by
// Investor Relations — not generated or listed in this view.

export default function InvestorReportPage() {
  const { portfolio, publishedReports, selectedPeriod, availablePeriods } =
    useOutletContext<InvestorPortfolioOutletContext>()

  const selected = useMemo(
    () => publishedReports.find(r => r.period === selectedPeriod) ?? null,
    [publishedReports, selectedPeriod],
  )

  if (availablePeriods.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="font-medium">Belum ada laporan yang diterbitkan.</p>
            <p className="mt-1 text-sm">
              Laporan akan muncul di sini setelah analyst mempublikasikan laporan untuk akun Anda.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h2 className="text-xl font-bold">Laporan Saya</h2>
      <p className="text-xs text-muted-foreground">
        Pilih periode pada dropdown di sidebar untuk mengganti laporan.
      </p>

      {selected ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {(portfolio?.brandName || selected.portfolioName)} — {formatPeriod(selected.period)}
              </CardTitle>
              <span className="rounded-full bg-[#38a169]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1e5f3f]">
                {selected.reportType === 'quarterly' ? 'Kuartalan' : 'Bulanan'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.portfolioName} · Laporan ini bersifat view-only. Unduhan tidak tersedia.
            </p>
          </CardHeader>
          <CardContent>
            <iframe
              title={`Report ${selected.id}`}
              srcDoc={selected.htmlContent}
              sandbox=""
              className="w-full min-h-[800px] rounded-md border bg-white"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Tidak ada laporan untuk periode yang dipilih.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
