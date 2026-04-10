import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Wallet from './pages/Wallet'
import Files from './pages/Files'
import AdminPanel from './pages/admin/AdminPanel'
import PrinterDetail from './pages/PrinterDetail'
import Prints from './pages/Prints'
import Settings from './pages/Settings'
import PrintFlow from './pages/PrintFlow'
import PrintSuccess from './pages/PrintSuccess'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuthStore()
  if (!accessToken) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuthStore()
  if (!accessToken) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registrieren" element={<Register />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/guthaben" element={<Wallet />} />
          <Route path="/drucker/:id" element={<PrinterDetail />} />
          <Route path="/drucker/:id/drucken" element={<PrintFlow />} />
          <Route path="/drucker/:id/drucken/success" element={<PrintSuccess />} />
          <Route path="/dateien" element={<Files />} />
          <Route path="/drucke" element={<Prints />} />
          <Route path="/einstellungen" element={<Settings />} />
        </Route>

        <Route element={<AdminRoute><Layout /></AdminRoute>}>
          <Route path="/admin" element={<AdminPanel />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
