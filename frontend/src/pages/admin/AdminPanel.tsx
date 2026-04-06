import { useState } from 'react'
import UsersTab from './UsersTab'
import VouchersTab from './VouchersTab'
import TransactionsTab from './TransactionsTab'
import ActivityTab from './ActivityTab'

type Tab = 'users' | 'vouchers' | 'transactions' | 'activity'

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Admin-Panel</h1>

      {/* Tab-Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          ['users', 'Nutzer'],
          ['vouchers', 'Gutscheine'],
          ['transactions', 'Finanzen'],
          ['activity', 'Aktivität'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {tab === 'users' && <UsersTab />}
        {tab === 'vouchers' && <VouchersTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </div>
  )
}
