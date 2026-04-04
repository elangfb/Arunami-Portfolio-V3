import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getInvestorPortfolios } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrencyCompact } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, LogOut, Briefcase } from 'lucide-react'
import type { Portfolio } from '@/types'

export default function InvestorDashboard() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      getInvestorPortfolios(user.uid).then(data => { setPortfolios(data); setLoading(false) })
    }
  }, [user])

  const handleLogout = async () => {
    await signOut(auth); setUser(null)
    navigate('/login', { replace: true })
    toast.success('Berhasil keluar')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e5f3f]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">ARUNAMI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Halo, {user?.displayName}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" />Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Portofolio Saya</h1>
          <p className="text-muted-foreground">Portofolio yang ditugaskan kepada Anda</p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : portfolios.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Belum ada portofolio yang ditugaskan kepada Anda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {portfolios.map(p => (
              <Link key={p.id} to={`/investor/portfolios/${p.id}/overview`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{p.code} · {p.stage}</p>
                      </div>
                      <span className="text-xs bg-[#1e5f3f]/10 text-[#1e5f3f] rounded-full px-2 py-0.5 font-medium">{p.periode}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Investasi Awal</span>
                      <span className="font-semibold text-[#1e5f3f]">{formatCurrencyCompact(p.investasiAwal)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
