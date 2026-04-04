import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { getUser } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, TrendingUp } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, data.email, data.password)
      const appUser = await getUser(cred.user.uid)
      if (!appUser) throw new Error('Akun tidak ditemukan')
      setUser(appUser)
      navigate(`/${appUser.role}`, { replace: true })
    } catch {
      toast.error('Email atau password salah')
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#0d1f17] p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#38a169]">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">ARUNAMI</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Platform Manajemen<br />
            <span className="text-[#38a169]">Portofolio Investasi</span>
          </h1>
          <p className="text-[#9ca3af] text-lg leading-relaxed">
            Kelola laporan keuangan, analisis performa portofolio, dan pantau return investor dalam satu platform terpadu.
          </p>
          <div className="flex flex-col gap-3">
            {['Laporan PnL berbasis AI', 'Dashboard analisis finansial real-time', 'Manajemen return investor otomatis'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-[#d1fae5]">
                <div className="h-1.5 w-1.5 rounded-full bg-[#38a169]" />
                <span className="text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[#6b7280] text-sm">© 2024 Arunami. All rights reserved.</p>
      </div>

      {/* Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-2 lg:hidden mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e5f3f]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">ARUNAMI</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Selamat Datang</h2>
            <p className="text-muted-foreground">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="nama@perusahaan.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password"
                  className="pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Masuk...' : 'Masuk'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
