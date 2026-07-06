import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getCovenants, getMilestones } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Scale, Target } from 'lucide-react'
import type { Covenant, Milestone, MilestoneStatus } from '@/types'
import type { InvestorPortfolioOutletContext } from './InvestorPortfolioLayout'

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: 'Pending', on_track: 'On Track', achieved: 'Tercapai', delayed: 'Tertunda', missed: 'Terlewat',
}
const STATUS_VARIANT: Record<MilestoneStatus, 'default' | 'secondary' | 'success' | 'warning' | 'danger'> = {
  pending: 'secondary', on_track: 'default', achieved: 'success', delayed: 'warning', missed: 'danger',
}

export default function InvestorGovernancePage() {
  const { portfolioId } = useOutletContext<InvestorPortfolioOutletContext>()
  const [covenants, setCovenants] = useState<Covenant[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!portfolioId) return
    Promise.all([getCovenants(portfolioId), getMilestones(portfolioId)]).then(([c, m]) => {
      setCovenants(c.sort((a, b) => (b.period || '').localeCompare(a.period || '')))
      setMilestones(m.sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || '')))
      setLoading(false)
    })
  }, [portfolioId])

  const failed = useMemo(() => covenants.filter(c => c.result === 'fail'), [covenants])

  if (loading) return <div className="p-8"><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl font-bold">Covenant & Milestone</h2>

      {failed.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-900">{failed.length} covenant tidak terpenuhi</p>
            <p className="text-sm text-red-700">{failed.map(c => c.name).join(', ')}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Scale className="h-4 w-4" />Covenants</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {covenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data covenant.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Covenant</th>
                  <th className="py-2 text-left font-medium">Syarat</th>
                  <th className="py-2 text-left font-medium">Aktual</th>
                  <th className="py-2 text-left font-medium">Periode</th>
                  <th className="py-2 text-center font-medium">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {covenants.map(c => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-muted-foreground">{c.requirement || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.actual || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.period || '—'}</td>
                    <td className="py-2 text-center">
                      <Badge variant={c.result === 'pass' ? 'success' : 'danger'}>{c.result === 'pass' ? 'Pass' : 'Gagal'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4" />Milestones</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data milestone.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Milestone</th>
                  <th className="py-2 text-left font-medium">Target</th>
                  <th className="py-2 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2">
                      <p className="font-medium">{m.title}</p>
                      {m.successCriteria && <p className="text-xs text-muted-foreground">{m.successCriteria}</p>}
                    </td>
                    <td className="py-2 text-muted-foreground">{m.targetDate || '—'}</td>
                    <td className="py-2 text-center"><Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
