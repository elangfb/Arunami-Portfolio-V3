import type { ReturnModelType } from '@/types'

/**
 * Return models where the investor's payout does NOT depend on the
 * portfolio's actual P&L performance (fixed % of principal, scheduled
 * payouts, or legacy fixed_return). For these projects, the investor view
 * is slimmed down to just the published reports — operational pages
 * (Overview, Costs, etc.) are noise because they don't influence the return.
 */
const FIXED_RETURN_MODELS: ReturnModelType[] = [
  'fixed_yield',
  'fixed_schedule',
  'fixed_return',
]

export function isFixedReturnModel(returnModel?: ReturnModelType | null): boolean {
  return !!returnModel && FIXED_RETURN_MODELS.includes(returnModel)
}

/**
 * Investor sub-routes that should remain visible for fixed-return projects.
 * Everything else (overview/revenue/costs/returns/management/notes) is hidden.
 */
export const FIXED_RETURN_VISIBLE_ROUTES = new Set(['report', 'resume', 'contract', 'documents'])
