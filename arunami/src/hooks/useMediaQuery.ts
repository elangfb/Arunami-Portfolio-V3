import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query. SSR-safe (defaults to `false` until mounted).
 * Tailwind v4 `lg` breakpoint is 1024px → use '(min-width: 1024px)'.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
