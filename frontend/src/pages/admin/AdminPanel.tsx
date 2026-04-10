import { useState } from 'react'
import StatsTab from './StatsTab'
import UsersTab from './UsersTab'
import VouchersTab from './VouchersTab'
import TransactionsTab from './TransactionsTab'
import ActivityTab from './ActivityTab'
import FilesTab from './FilesTab'
import PrintersTab from './PrintersTab'
import TopupRequestsTab from './TopupRequestsTab'
import EmailConfigTab from './EmailConfigTab'
import PortalSettingsTab from './PortalSettingsTab'
import FilamentTab from './FilamentTab'
import SlicerProfilesTab from './SlicerProfilesTab'

type Tab = 'stats' | 'users' | 'vouchers' | 'topup' | 'transactions' | 'activity' | 'files' | 'printers' | 'filament' | 'profiles' | 'email' | 'settings'

const TABS: [Tab, string][] = [
  ['stats',        'Statistik'     ],
  ['users',        'Nutzer'        ],
  ['vouchers',     'Gutscheine'    ],
  ['topup',        'Aufladung'     ],
  ['transactions', 'Finanzen'      ],
  ['activity',     'Aktivität'     ],
  ['files',        'Dateien'       ],
  ['printers',     'Drucker'       ],
  ['filament',     'Filament'      ],
  ['profiles',     'Slicer-Profile'],
  ['email',        'E-Mail'        ],
  ['settings',     'Einstellungen' ],
]

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('stats')

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 16px' }}>Admin-Panel</h1>

      {/* Pill tab bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: 'var(--surface2)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: tab === key ? 700 : 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: tab === key ? '#111' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text2)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: 24 }}>
        {tab === 'stats'        && <StatsTab />}
        {tab === 'users'        && <UsersTab />}
        {tab === 'vouchers'     && <VouchersTab />}
        {tab === 'topup'        && <TopupRequestsTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'activity'     && <ActivityTab />}
        {tab === 'files'        && <FilesTab />}
        {tab === 'printers'     && <PrintersTab />}
        {tab === 'filament'     && <FilamentTab />}
        {tab === 'profiles'     && <SlicerProfilesTab />}
        {tab === 'email'        && <EmailConfigTab />}
        {tab === 'settings'     && <PortalSettingsTab />}
      </div>
    </div>
  )
}
