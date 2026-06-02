import AdminInvestorDetail from '@/pages/admin/AdminInvestorDetail'

// Same investor performance detail + report generator as admin, but the back
// button returns to the Investor Relations list.
export default function IRInvestorDetail() {
  return <AdminInvestorDetail backPath="/investor-relation" />
}
