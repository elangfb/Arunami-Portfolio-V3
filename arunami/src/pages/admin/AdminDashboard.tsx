import { useEffect, useState } from 'react'
import { getAllUsers, getAllPortfolios } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Briefcase, UserCheck, BarChart2 } from 'lucide-react'
import type { AppUser, Portfolio } from '@/types'

export default function AdminDashboard() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAllUsers(), getAllPortfolios()]).then(([u, p]) => {
      setUsers(u)
      setPortfolios(p)
      setLoading(false)
    })
  }, [])

  const analysts = users.filter(u => u.role === 'analyst')
  const investors = users.filter(u => u.role === 'investor')

  const stats = [
    { label: 'Total Pengguna', value: users.length, icon: Users, color: 'text-blue-600' },
    { label: 'Total Portofolio', value: portfolios.length, icon: Briefcase, color: 'text-[#38a169]' },
    { label: 'Analis', value: analysts.length, icon: BarChart2, color: 'text-purple-600' },
    { label: 'Investor', value: investors.length, icon: UserCheck, color: 'text-orange-600' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-muted-foreground">Selamat datang di panel administrasi ARUNAMI</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-5 w-5 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar Portofolio</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada portofolio</p>
            ) : (
              <div className="space-y-3">
                {portfolios.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · {p.stage}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{p.assignedInvestors.length} investor</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengguna Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pengguna</p>
            ) : (
              <div className="space-y-3">
                {users.slice(0, 6).map(u => (
                  <div key={u.uid} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e5f3f]/10 text-[#1e5f3f] text-xs font-bold">
                      {u.displayName?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
