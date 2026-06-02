import type { UserRole } from '@/types'

/** Human-readable label per role (Indonesian UI). */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  analyst: 'Analis',
  investor: 'Investor',
  investor_relation: 'Investor Relations',
}

/**
 * Landing path for a role. Most roles map to `/<role>`, but `investor_relation`
 * uses a hyphenated URL (`/investor-relation`) for readability.
 */
export function roleHome(role: UserRole): string {
  return role === 'investor_relation' ? '/investor-relation' : `/${role}`
}
