import { BrowserRouter, Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AdminApps } from '../pages/admin/AdminApps'
import { AdminClients } from '../pages/admin/AdminClients'
import { AdminDashboard } from '../pages/admin/AdminDashboard'
import { AdminPlaceholder } from '../pages/admin/AdminPlaceholder'
import { AdminSerpro } from '../pages/admin/AdminSerpro'
import { AdminSettings } from '../pages/admin/AdminSettings'
import { AppHome } from '../pages/apps/AppHome'
import { PremiumApp } from '../pages/apps/PremiumApp'
import { AccountingDocuments } from '../pages/accounting/AccountingDocuments'
import { ClientManagement } from '../pages/accounting/ClientManagement'
import { CnpjConsultation } from '../pages/accounting/CnpjConsultation'
import { FiscalModule } from '../pages/accounting/FiscalModule'
import { Integrations } from '../pages/accounting/Integrations'
import { ObligationsTaxes } from '../pages/accounting/ObligationsTaxes'
import { Ecac } from '../pages/accounting/gov/Ecac'
import { Sefaz } from '../pages/accounting/gov/Sefaz'
import { AccountingSettings } from '../pages/accounting/settings/AccountingSettings'
import { RevenueFederalSettings } from '../pages/accounting/settings/RevenueFederalSettings'
import { ForgotPassword } from '../pages/auth/ForgotPassword'
import { Login } from '../pages/auth/Login'
import { ResetPassword } from '../pages/auth/ResetPassword'
import { Register } from '../pages/auth/Register'
import { Dashboard } from '../pages/dashboard/Dashboard'
import { Home } from '../pages/home/Home'
import { MiniCrm } from '../pages/miniCrm/MiniCrm'
import { Omnichannel } from '../pages/omnichannel/Omnichannel'
import { ClientPortal } from '../pages/portal/ClientPortal'
import { Payments } from '../pages/settings/Payments'
import { WebsiteBuilder } from '../pages/website/WebsiteBuilder'
import { AdminRoute } from './AdminRoute'
import { PaidAppRoute } from './PaidAppRoute'
import { ProtectedRoute } from './ProtectedRoute'
import { useRole } from '../hooks/useRole'

function HomeRedirect() {
  const { isAuthenticated, isLoading } = useAuth()
  const { isAdmin, isLoading: isRoleLoading } = useRole()

  if (isLoading || (isAuthenticated && isRoleLoading)) {
    return null
  }

  return <Navigate replace to={isAuthenticated ? (isAdmin ? '/admin' : '/aplicativos') : '/'} />
}

function AccountingDashboardRoute() {
  const { isAdmin, isLoading } = useRole()
  const [searchParams] = useSearchParams()

  if (isLoading) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
  }

  return isAdmin && !searchParams.has('organization') ? <Navigate replace to="/admin" /> : <Dashboard />
}

function AccountingClientAreaRoute() {
  const { isAdmin, isLoading } = useRole()
  const [searchParams] = useSearchParams()

  if (isLoading) {
    return <div aria-hidden="true" className="min-h-screen bg-slate-50" />
  }

  return isAdmin && !searchParams.has('organization') ? <Navigate replace to="/admin" /> : <Outlet />
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Home />} path="/" />
        <Route element={<Login />} path="/login" />
        <Route element={<Register />} path="/cadastro" />
        <Route element={<ForgotPassword />} path="/esqueci-senha" />
        <Route element={<ResetPassword />} path="/redefinir-senha" />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppHome />} path="/aplicativos" />
          <Route
            element={<PaidAppRoute applicationId="crie-seu-site"><WebsiteBuilder /></PaidAppRoute>}
            path="/aplicativos/crie-seu-site"
          />
          <Route
            element={<PremiumApp applicationId="psicologa-ia" />}
            path="/aplicativos/psicologa-ia"
          />
          <Route element={<PaidAppRoute applicationId="mini-crm"><MiniCrm /></PaidAppRoute>} path="/mini-crm" />
          <Route element={<PaidAppRoute applicationId="omnichannel"><Omnichannel /></PaidAppRoute>} path="/omnichannel" />
          <Route element={<Payments />} path="/configuracoes/pagamentos" />
          <Route element={<PaidAppRoute applicationId="gestao-contabil"><AccountingClientAreaRoute /></PaidAppRoute>}>
            <Route element={<AccountingDashboardRoute />} path="/dashboard" />
            <Route element={<ClientManagement key="cadastros" />} path="/gestao-clientes" />
            <Route element={<CnpjConsultation />} path="/consulta-cnpj" />
            <Route element={<AccountingDocuments />} path="/documentos-contabeis" />
            <Route element={<ObligationsTaxes />} path="/obrigacoes-impostos" />
            <Route element={<FiscalModule />} path="/fiscal" />
            <Route
              element={<ClientManagement initialTab="pagamentos" key="pagamentos" />}
              path="/gestao-financeira"
            />
            <Route element={<Sefaz />} path="/gov/sefaz" />
            <Route element={<Ecac />} path="/gov/ecac" />
            <Route element={<RevenueFederalSettings />} path="/gov/receita-federal" />
            <Route element={<Integrations />} path="/integracoes" />
            <Route element={<AccountingSettings />} path="/configuracoes-contabeis" />
          </Route>
          <Route element={<ClientPortal />} path="/portal" />
          <Route element={<AdminRoute />}>
            <Route element={<AdminDashboard />} path="/admin" />
            <Route
              element={<AdminClients />}
              path="/admin/clientes"
            />
            <Route
              element={<AdminApps />}
              path="/admin/aplicativos"
            />
            <Route
              element={<AdminPlaceholder description="Area gerencial para acompanhar assinaturas, cartao, Pix, inadimplencia e liberacao de acesso." title="Pagamentos" />}
              path="/admin/pagamentos"
            />
            <Route
              element={<AdminSerpro />}
              path="/admin/integracoes/serpro"
            />
            <Route
              element={<Navigate replace to="/admin/configuracoes?aba=pagina-inicial" />}
              path="/admin/pagina-inicial"
            />
            <Route
              element={<AdminSettings />}
              path="/admin/configuracoes"
            />
          </Route>
        </Route>
        <Route element={<HomeRedirect />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}
