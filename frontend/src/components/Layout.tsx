import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, formatBalance } from '../stores/authStore'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`text-sm transition-colors ${
        location.pathname === to
          ? 'text-blue-600 font-medium'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-gray-900">
            <span className="text-xl">🖨️</span>
            <span className="hidden sm:inline">3D-Drucker-Portal</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLink('/drucker', 'Drucker')}
            {navLink('/dateien', 'Meine Dateien')}
            {navLink('/guthaben', 'Guthaben')}
            {user?.role === 'admin' && navLink('/admin', 'Admin')}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <Link
                  to="/guthaben"
                  className="text-sm font-medium bg-green-100 text-green-800 px-2.5 py-1 rounded-full hover:bg-green-200 transition-colors"
                >
                  {formatBalance(user.balance_cents)}
                </Link>
                <span className="text-sm text-gray-500 hidden sm:block truncate max-w-32">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Abmelden
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
