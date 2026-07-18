import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getCovenants, getMilestones } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Covenant</TableHead>
                  <TableHead>Syarat</TableHead>
                  <TableHead>Aktual</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-center">Hasil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {covenants.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.requirement || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.actual || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.period || '—'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={c.result === 'pass' ? 'success' : 'danger'}>{c.result === 'pass' ? 'Pass' : 'Gagal'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4" />Milestones</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data milestone.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <p className="font-medium">{m.title}</p>
                      {m.successCriteria && <p className="text-xs text-muted-foreground">{m.successCriteria}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.targetDate || '—'}</TableCell>
                    <TableCell className="text-center"><Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
