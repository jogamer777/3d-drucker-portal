import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import BalanceChip from './BalanceChip'
import BottomNav from './BottomNav'

const PrinterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="12" height="5" rx="1" />
    <rect x="4" y="12" width="12" height="6" rx="1" />
    <path d="M3 7h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="15.5" cy="10.5" r="0.75" fill="#111" />
  </svg>
)

const NAV_ITEMS = [
  { to: '/',         label: 'Dashboard' },
  { to: '/dateien',  label: 'Dateien'   },
  { to: '/drucke',   label: 'Drucke'    },
  { to: '/guthaben', label: 'Guthaben'  },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  const navItems = [
    ...NAV_ITEMS,
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  const initial = user?.email?.charAt(0).toUpperCase() ?? '?'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '0.5px solid var(--border)' }}>
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '0 20px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Logo */}
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'var(--lime)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PrinterIcon />
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              3D-Portal
            </span>
          </Link>

          {/* Pill Nav — desktop only */}
          {user && (
            <nav
              className="hidden md:flex"
              style={{
                alignItems: 'center',
                gap: 2,
                background: 'var(--surface2)',
                borderRadius: 24,
                padding: 4,
              }}
            >
              {navItems.map(item => {
                const active = isActive(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      textDecoration: 'none',
                      background: active ? '#111' : 'transparent',
                      color: active ? '#fff' : 'var(--text2)',
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}

          {/* Right side */}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <BalanceChip balance_cents={user.balance_cents} />

              {/* Avatar circle → Einstellungen */}
              <Link
                to="/einstellungen"
                title="Einstellungen"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#111',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                {initial}
              </Link>

              {/* Logout — desktop only */}
              <button
                onClick={handleLogout}
                className="hidden md:block"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text2)',
                  background: 'transparent',
                  border: '0.5px solid var(--border)',
                  borderRadius: 10,
                  padding: '5px 11px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Abmelden
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main
        style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px' }}
        className="pb-20 md:pb-6"
      >
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
