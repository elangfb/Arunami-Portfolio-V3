import AdminInvestorDetail from '@/pages/admin/AdminInvestorDetail'

// Same investor performance detail as admin, but the back button returns to the
// Investor Relations list. Reporting lives in the dedicated "Review & Publishing"
// menu here, so it is hidden on this page.
export default function IRInvestorDetail() {
  return <AdminInvestorDetail backPath="/investor-relation" showReporting={false} showOverride={false} />
}
