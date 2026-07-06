import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/components/shared/AuthProvider'
import { AuthGuard } from '@/components/shared/AuthGuard'
import { useAuthStore } from '@/store/authStore'
import { roleHome } from '@/lib/roles'

// Pages
import LoginPage from '@/pages/LoginPage'

// Admin
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminPortfolios from '@/pages/admin/AdminPortfolios'
import AdminInvestors from '@/pages/admin/AdminInvestors'
import AdminInvestorDetail from '@/pages/admin/AdminInvestorDetail'
import AdminPortfolioOverride from '@/pages/admin/AdminPortfolioOverride'
import AdminInvestorOverride from '@/pages/admin/AdminInvestorOverride'
import AdminAuditLog from '@/pages/admin/AdminAuditLog'
import AdminHealthRules from '@/pages/admin/AdminHealthRules'
import PortfolioSetupWizard from '@/pages/admin/setup/PortfolioSetupWizard'

// Analyst
import AnalystDashboard from '@/pages/analyst/AnalystDashboard'
import AnalystRenewals from '@/pages/analyst/AnalystRenewals'
import AnalystPortfolioLayout from '@/pages/analyst/portfolio/AnalystPortfolioLayout'
import OverviewPage from '@/pages/analyst/portfolio/OverviewPage'
import PnLPage from '@/pages/analyst/portfolio/PnLPage'
import ProjectionsPage from '@/pages/analyst/portfolio/ProjectionsPage'
import RevenuePage from '@/pages/analyst/portfolio/RevenuePage'
import CostsPage from '@/pages/analyst/portfolio/CostsPage'
import InvestorsPage from '@/pages/analyst/portfolio/InvestorsPage'
import ManagementPage from '@/pages/analyst/portfolio/ManagementPage'
import PublishingPage from '@/pages/analyst/portfolio/PublishingPage'
import NotesPage from '@/pages/analyst/portfolio/NotesPage'
import MilestonesPage from '@/pages/analyst/portfolio/MilestonesPage'
import CovenantsPage from '@/pages/analyst/portfolio/CovenantsPage'
import ProfitSharingPage from '@/pages/analyst/portfolio/ProfitSharingPage'

// Investor
import InvestorDashboard from '@/pages/investor/InvestorDashboard'
import InvestorReportsPage from '@/pages/investor/InvestorReportsPage'
import InvestorContractsPage from '@/pages/investor/InvestorContractsPage'
import InvestorPortfolioLayout from '@/pages/investor/portfolio/InvestorPortfolioLayout'
import InvestorOverviewPage from '@/pages/investor/portfolio/InvestorOverviewPage'
import InvestorContractPage from '@/pages/investor/portfolio/InvestorContractPage'
import InvestorGovernancePage from '@/pages/investor/portfolio/InvestorGovernancePage'
import InvestorReturnsPage from '@/pages/investor/portfolio/InvestorReturnsPage'
import InvestorBagiHasilResumePage from '@/pages/investor/portfolio/InvestorBagiHasilResumePage'
import InvestorReportPage from '@/pages/investor/portfolio/InvestorReportPage'
import InvestorManagementPage from '@/pages/investor/portfolio/InvestorManagementPage'
import InvestorNotesPage from '@/pages/investor/portfolio/InvestorNotesPage'

// Investor Relation
import InvestorRelationLayout from '@/pages/investor-relation/InvestorRelationLayout'
import IRInvestors from '@/pages/investor-relation/IRInvestors'
import IRInvestorDetail from '@/pages/investor-relation/IRInvestorDetail'
import IRReporting from '@/pages/investor-relation/IRReporting'
import IRTransferProofs from '@/pages/investor-relation/IRTransferProofs'

function RootRedirect() {
  const { user, loading } = useAuthStore()
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1e5f3f] border-t-transparent" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(user.role)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster richColors position="top-right" />
        <Routes>
          {/* Root */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <AuthGuard allowedRoles={['admin']}>
                <AdminLayout />
              </AuthGuard>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="portfolios" element={<AdminPortfolios />} />
            <Route path="portfolios/new" element={<PortfolioSetupWizard />} />
            <Route path="portfolios/:id/override" element={<AdminPortfolioOverride />} />
            <Route path="investors" element={<AdminInvestors />} />
            <Route path="investors/:uid" element={<AdminInvestorDetail />} />
            <Route path="investors/:uid/override" element={<AdminInvestorOverride />} />
            <Route path="audit-log" element={<AdminAuditLog />} />
            <Route path="health-rules" element={<AdminHealthRules />} />
          </Route>

          {/* Analyst routes */}
          <Route
            path="/analyst"
            element={
              <AuthGuard allowedRoles={['admin', 'analyst']}>
                <AnalystDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/analyst/renewals"
            element={
              <AuthGuard allowedRoles={['admin', 'analyst']}>
                <AnalystRenewals />
              </AuthGuard>
            }
          />
          <Route
            path="/analyst/portfolios/:id"
            element={
              <AuthGuard allowedRoles={['admin', 'analyst']}>
                <AnalystPortfolioLayout />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="pnl" element={<PnLPage />} />
            <Route path="projections" element={<ProjectionsPage />} />
            <Route path="revenue" element={<RevenuePage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="investors" element={<InvestorsPage />} />
            <Route path="management" element={<ManagementPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="milestones" element={<MilestonesPage />} />
            <Route path="covenants" element={<CovenantsPage />} />
            <Route path="publishing" element={<PublishingPage />} />
            <Route path="settings/profit-sharing" element={<ProfitSharingPage />} />
          </Route>

          {/* Investor Relation routes */}
          <Route
            path="/investor-relation"
            element={
              <AuthGuard allowedRoles={['admin', 'investor_relation']}>
                <InvestorRelationLayout />
              </AuthGuard>
            }
          >
            <Route index element={<IRInvestors />} />
            <Route path="reports" element={<IRReporting />} />
            <Route path="transfer-proofs" element={<IRTransferProofs />} />
            <Route path="investors/:uid" element={<IRInvestorDetail />} />
          </Route>

          {/* Investor routes */}
          <Route
            path="/investor"
            element={
              <AuthGuard allowedRoles={['investor']}>
                <InvestorDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/investor/reports"
            element={
              <AuthGuard allowedRoles={['investor']}>
                <InvestorReportsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/investor/contracts"
            element={
              <AuthGuard allowedRoles={['investor']}>
                <InvestorContractsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/investor/portfolios/:id"
            element={
              <AuthGuard allowedRoles={['investor']}>
                <InvestorPortfolioLayout />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<InvestorOverviewPage />} />
            <Route path="revenue" element={<RevenuePage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="returns" element={<InvestorReturnsPage />} />
            <Route path="resume" element={<InvestorBagiHasilResumePage />} />
            <Route path="management" element={<InvestorManagementPage />} />
            <Route path="notes" element={<InvestorNotesPage />} />
            <Route path="report" element={<InvestorReportPage />} />
            <Route path="contract" element={<InvestorContractPage />} />
            <Route path="governance" element={<InvestorGovernancePage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
