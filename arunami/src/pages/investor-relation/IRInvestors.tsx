import AdminInvestors from '@/pages/admin/AdminInvestors'

// Investor Relations sees the same all-investors list as admin, but read-only
// and routed within the /investor-relation area.
export default function IRInvestors() {
  return <AdminInvestors detailBase="/investor-relation/investors" />
}
