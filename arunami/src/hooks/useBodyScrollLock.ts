import { useEffect } from 'react'

/**
 * Locks body scroll while `locked` is true (e.g. when a mobile drawer is open),
 * restoring the previous overflow value on unlock/unmount.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}
