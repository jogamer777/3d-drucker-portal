import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useAuthStore, formatBalance } from '../stores/authStore'

interface Transaction {
  id: number
  type: 'topup' | 'charge' | 'refund'
  amount_cents: number
  description: string
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  topup: 'Aufladung',
  charge: 'Abbuchung',
  refund: 'Rückerstattung',
}

export default function Wallet() {
  const { user, setAuth, accessToken } = useAuthStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(true)

  useEffect(() => {
    api.get('/user/transactions')
      .then(r => setTransactions(r.data))
      .finally(() => setTxLoading(false))
  }, [])

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await api.post('/vouchers/redeem', { code: code.trim().toUpperCase() })
      setSuccess(`Gutschein eingelöst! ${formatBalance(res.data.value_cents)} wurden gutgeschrieben.`)
      setCode('')
      // Guthaben im Store aktualisieren
      if (user) {
        const meRes = await api.get('/user/me')
        setAuth(accessToken!, meRes.data)
      }
      // Transaktionen neu laden
      const txRes = await api.get('/user/transactions')
      setTransactions(txRes.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Fehler beim Einlösen')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Guthaben</h1>

      {/* Guthaben-Anzeige */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Aktuelles Guthaben</p>
          <p className="text-4xl font-bold text-gray-900 mt-1">
            {user ? formatBalance(user.balance_cents) : '–'}
          </p>
        </div>
        <div className="text-5xl">💳</div>
      </div>

      {/* Code einlösen */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Gutschein-Code einlösen</h2>
        <form onSubmit={handleRedeem} className="flex gap-3">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={14}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
          />
          <button
            type="submit"
            disabled={loading || code.length < 3}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? '...' : 'Einlösen'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
      </div>

      {/* Transaktionshistorie */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Transaktionshistorie</h2>
        {txLoading ? (
          <p className="text-sm text-gray-400">Laden...</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Transaktionen.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Datum</th>
                <th className="pb-2 font-medium">Art</th>
                <th className="pb-2 font-medium">Beschreibung</th>
                <th className="pb-2 font-medium text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-500">{formatDate(tx.created_at)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.type === 'topup' ? 'bg-green-100 text-green-700' :
                      tx.type === 'refund' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {TYPE_LABEL[tx.type]}
                    </span>
                  </td>
                  <td className="py-2 text-gray-700">{tx.description}</td>
                  <td className={`py-2 text-right font-medium ${tx.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount_cents >= 0 ? '+' : ''}{formatBalance(tx.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
