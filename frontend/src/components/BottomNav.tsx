import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const TABS = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L10 3l7 6.5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" fill={active ? 'currentColor' : 'none'} />
      </svg>
    ),
  },
  {
    to: '/dateien',
    label: 'Dateien',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4a2 2 0 0 1 2-2h5l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" fill={active ? 'currentColor' : 'none'} />
        <path d="M11 2v5h5" />
      </svg>
    ),
  },
  {
    to: '/guthaben',
    label: 'Guthaben',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="16" height="12" rx="2" fill={active ? 'currentColor' : 'none'} />
        <path d="M2 9h16" strokeWidth={active ? 2 : 1.5} stroke={active ? '#fff' : 'currentColor'} />
      </svg>
    ),
  },
  {
    to: '/drucke',
    label: 'Drucke',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2" fill={active ? 'currentColor' : 'none'} />
        <path d="M7 8h6M7 11h4" stroke={active ? '#fff' : 'currentColor'} />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const location = useLocation()
  const { user } = useAuthStore()

  const tabs = [
    ...TABS,
    ...(user?.role === 'admin'
      ? [{
          to: '/admin',
          label: 'Admin',
          icon: (active: boolean) => (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="3" fill={active ? 'currentColor' : 'none'} />
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l-1.42 1.42M5.64 14.36l-1.42 1.42" />
            </svg>
          ),
        }]
      : []),
  ]

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#fff',
        borderTop: '0.5px solid var(--border)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(tab => {
        const active = isActive(tab.to)
        return (
          <Link
            key={tab.to}
            to={tab.to}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 4px',
              textDecoration: 'none',
              color: active ? 'var(--text)' : 'var(--text3)',
              fontSize: 10,
              fontWeight: active ? 700 : 400,
            }}
          >
            {tab.icon(active)}
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
