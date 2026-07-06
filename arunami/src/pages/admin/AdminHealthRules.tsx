import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getAllPortfolios, getFinancialData, getHealthRules, saveHealthRules } from '@/lib/firestore'
import { computeHealth, DEFAULT_HEALTH_RULES, HEALTH_SOP } from '@/lib/health'
import { useAuthStore } from '@/store/authStore'
import { brandOf } from '@/lib/portfolioName'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { ShieldAlert, Save } from 'lucide-react'
import type { HealthRules, HealthThreshold, MonthlyDataPoint, Portfolio } from '@/types'

type SignalKey = 'latenessDays' | 'silenceDays' | 'underTargetMonths'

const SIGNALS: { key: SignalKey; label: string; unit: string }[] = [
  { key: 'latenessDays', label: 'Keterlambatan pembayaran/laporan', unit: 'hari' },
  { key: 'silenceDays', label: 'Tidak ada komunikasi', unit: 'hari' },
  { key: 'underTargetMonths', label: 'Laba < 80% target (berturut-turut)', unit: 'bulan' },
]

export default function AdminHealthRules() {
  const { user } = useAuthStore()
  const [rules, setRules] = useState<HealthRules>(DEFAULT_HEALTH_RULES)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [profitByPortfolio, setProfitByPortfolio] = useState<Record<string, MonthlyDataPoint[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [r, ports] = await Promise.all([getHealthRules(), getAllPortfolios()])
      setRules(r)
      const active = ports.filter(p => !p.archived)
      setPortfolios(active)
      // Load each active portfolio's profit series so the preview can factor in
      // the under-target streak, not just the manual lateness/silence signals.
      const entries = await Promise.all(
        active.map(async p => [p.id, (await getFinancialData(p.id))?.profitData ?? []] as const),
      )
      setProfitByPortfolio(Object.fromEntries(entries))
      setLoading(false)
    }
    load().catch(err => {
      console.error('Failed to load health rules', err)
      toast.error('Gagal memuat konfigurasi')
      setLoading(false)
    })
  }, [])

  const setThreshold = (signal: SignalKey, level: keyof HealthThreshold, value: string) => {
    setRules(prev => ({
      ...prev,
      [signal]: { ...prev[signal], [level]: Number(value) || 0 },
    }))
  }

  const preview = useMemo(
    () =>
      portfolios.map(p => ({
        portfolio: p,
        ...computeHealth({
          latenessDays: p.latenessDays,
          lastContactDate: p.lastContactDate,
          profitData: profitByPortfolio[p.id],
          rules,
        }),
      })),
    [portfolios, profitByPortfolio, rules],
  )

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await saveHealthRules(
        { latenessDays: rules.latenessDays, silenceDays: rules.silenceDays, underTargetMonths: rules.underTargetMonths },
        user.uid,
      )
      toast.success('Ambang batas kesehatan disimpan')
    } catch (err) {
      console.error('Failed to save health rules', err)
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert className="h-6 w-6 text-[#38a169]" />
          Ambang Batas Wanprestasi (SOP Siaga)
        </h1>
        <p className="text-muted-foreground">
          Tentukan kapan sebuah portofolio naik ke Siaga 3, 2, atau 1. Perubahan langsung tercermin di pratinjau.
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="space-y-6">
          {/* Threshold editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ambang Batas per Sinyal</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Sinyal</th>
                    <th className="py-2 text-center font-medium">Siaga 3</th>
                    <th className="py-2 text-center font-medium">Siaga 2</th>
                    <th className="py-2 text-center font-medium">Siaga 1</th>
                  </tr>
                </thead>
                <tbody>
                  {SIGNALS.map(({ key, label, unit }) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">dalam {unit}</p>
                      </td>
                      {(['siaga3', 'siaga2', 'siaga1'] as const).map(level => (
                        <td key={level} className="px-2 py-2 text-center">
                          <Input
                            type="number"
                            value={rules[key][level]}
                            onChange={e => setThreshold(key, level, e.target.value)}
                            className="mx-auto h-9 w-24 text-center"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-1 h-4 w-4" />
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SOP reference */}
          <Card>
            <CardHeader><CardTitle className="text-base">Referensi Eskalasi SOP</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(['siaga_3', 'siaga_2', 'siaga_1'] as const).map(level => (
                <div key={level} className="flex items-start gap-3">
                  <HealthBadge level={level} />
                  <div>
                    <p className="text-sm font-medium">{HEALTH_SOP[level].phase}</p>
                    <p className="text-xs text-muted-foreground">{HEALTH_SOP[level].action}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Live preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pratinjau Portofolio Aktif</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {preview.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada portofolio aktif.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Portofolio</th>
                      <th className="px-3 py-2 text-center font-medium">Kesehatan</th>
                      <th className="px-3 py-2 text-left font-medium">Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map(({ portfolio, level, reasons }) => (
                      <tr key={portfolio.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{brandOf(portfolio)}</p>
                          <p className="text-xs text-muted-foreground">{portfolio.code}</p>
                        </td>
                        <td className="px-3 py-2.5 text-center"><HealthBadge level={level} reasons={reasons} /></td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {reasons.length ? reasons.join(' · ') : 'Semua sinyal dalam batas aman'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
