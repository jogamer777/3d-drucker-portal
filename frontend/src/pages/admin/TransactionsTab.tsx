import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface AdminTransaction {
  id: number
  user_email: string
  type: 'topup' | 'charge' | 'refund'
  amount_cents: number
  description: string
  created_at: string
  related_voucher_code: string | null
}

const TYPE_LABELS: Record<string, string> = {
  topup: 'Aufladung',
  charge: 'Abbuchung',
  refund: 'Erstattung',
}

const TYPE_COLORS: Record<string, string> = {
  topup: 'bg-green-100 text-green-700',
  charge: 'bg-red-100 text-red-700',
  refund: 'bg-blue-100 text-blue-700',
}

export default function TransactionsTab() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'topup' | 'charge' | 'refund'>('all')

  const load = () => {
    setLoading(true)
    api.get('/admin/transactions').then(r => setTransactions(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const formatAmount = (cents: number) => {
    const sign = cents >= 0 ? '+' : ''
    return sign + (cents / 100).toFixed(2) + ' €'
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {([
            ['all', `Alle (${transactions.length})`],
            ['topup', `Aufladungen (${transactions.filter(t => t.type === 'topup').length})`],
            ['charge', `Abbuchungen (${transactions.filter(t => t.type === 'charge').length})`],
            ['refund', `Erstattungen (${transactions.filter(t => t.type === 'refund').length})`],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open('/api/admin/transactions/export', '_blank')}
            className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
          >
            CSV exportieren
          </button>
          <button onClick={load} className="text-sm text-blue-600 hover:underline">Aktualisieren</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Laden...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Keine Transaktionen vorhanden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Datum</th>
                <th className="pb-2 font-medium">Nutzer</th>
                <th className="pb-2 font-medium">Art</th>
                <th className="pb-2 font-medium">Betrag</th>
                <th className="pb-2 font-medium">Beschreibung / Code</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                  <td className="py-2 text-gray-800 font-medium">{t.user_email}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[t.type]}`}>
                      {TYPE_LABELS[t.type]}
                    </span>
                  </td>
                  <td className={`py-2 font-medium ${t.amount_cents >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatAmount(t.amount_cents)}
                  </td>
                  <td className="py-2 text-gray-600">
                    {t.description}
                    {t.related_voucher_code && (
                      <span className="ml-2 font-mono text-xs text-gray-400">({t.related_voucher_code})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
