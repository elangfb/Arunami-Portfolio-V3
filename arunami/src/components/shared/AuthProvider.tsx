import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUser } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const appUser = await getUser(firebaseUser.uid)
        setUser(appUser)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [setUser, setLoading])

  return <>{children}</>
}
