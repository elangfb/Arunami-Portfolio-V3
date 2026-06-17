import { useEffect, useState } from 'react'
import { getNotificationsForInvestor } from '@/lib/firestore'
import type { InvestorNotification } from '@/types'

export function useTransferProofNotifications(uid: string | undefined) {
  const [data, setData] = useState<InvestorNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getNotificationsForInvestor(uid)
      .then(rows => { if (!cancelled) setData(rows) })
      .catch(() => { /* surfaced by hook consumer via data=[] */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uid, reload])

  return { notifications: data, loading, reload: () => setReload(x => x + 1) }
}