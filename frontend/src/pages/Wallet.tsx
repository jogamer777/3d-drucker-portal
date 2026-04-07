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

interface TopupRequest {
  id: number
  amount_cents: number
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  admin_note: string | null
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000] // cents: 5€, 10€, 20€, 50€

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

  // Aufladeantrag
  const [topupRequests, setTopupRequests] = useState<TopupRequest[]>([])
  const [topupAmount, setTopupAmount] = useState(1000)
  const [topupCustom, setTopupCustom] = useState('')
  const [topupNote, setTopupNote] = useState('')
  const [topupLoading, setTopupLoading] = useState(false)
  const [topupMsg, setTopupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadTopupRequests = () => {
    api.get('/user/topup-requests').then(r => setTopupRequests(r.data)).catch(() => {})
  }

  useEffect(() => {
    api.get('/user/transactions')
      .then(r => setTransactions(r.data))
      .finally(() => setTxLoading(false))
    loadTopupRequests()
  }, [])

  const pendingRequest = topupRequests.find(r => r.status === 'pending')

  const submitTopupRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setTopupMsg(null)
    const cents = topupCustom ? Math.round(parseFloat(topupCustom.replace(',', '.')) * 100) : topupAmount
    if (!cents || cents < 100) {
      setTopupMsg({ type: 'error', text: 'Mindestbetrag: 1,00 €' })
      return
    }
    if (cents > 20000) {
      setTopupMsg({ type: 'error', text: 'Höchstbetrag: 200,00 €' })
      return
    }
    setTopupLoading(true)
    try {
      await api.post('/user/topup-request', { amount_cents: cents, note: topupNote.trim() || null })
      setTopupMsg({ type: 'success', text: 'Aufladeantrag gestellt! Ein Admin wird ihn bearbeiten.' })
      setTopupNote('')
      setTopupCustom('')
      loadTopupRequests()
    } catch (e: any) {
      setTopupMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler' })
    } finally {
      setTopupLoading(false)
    }
  }

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

      {/* Aufladeantrag */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Aufladeantrag stellen</h2>
        <p className="text-sm text-gray-500 mb-4">
          Zahle per Überweisung oder Bar und stelle einen Antrag – ein Admin genehmigt die Gutschrift.
        </p>

        {pendingRequest ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-yellow-800">Offener Antrag</p>
            <p className="text-yellow-700 mt-0.5">
              {formatBalance(pendingRequest.amount_cents)} – wird bearbeitet
              {pendingRequest.note && <span className="text-yellow-600"> · {pendingRequest.note}</span>}
            </p>
          </div>
        ) : (
          <form onSubmit={submitTopupRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Betrag</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESET_AMOUNTS.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => { setTopupAmount(a); setTopupCustom('') }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      topupAmount === a && !topupCustom
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {formatBalance(a)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={topupCustom}
                onChange={e => setTopupCustom(e.target.value)}
                placeholder="Anderen Betrag eingeben (z.B. 15,00)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kommentar (optional)
              </label>
              <input
                type="text"
                value={topupNote}
                onChange={e => setTopupNote(e.target.value)}
                placeholder="z.B. Überweisung vom 07.04., Referenz: 12345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {topupMsg && (
              <div className={`text-sm px-3 py-2 rounded-lg ${topupMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {topupMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={topupLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {topupLoading ? 'Sende...' : 'Antrag stellen'}
            </button>
          </form>
        )}

        {topupRequests.filter(r => r.status !== 'pending').length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Frühere Anträge</p>
            <div className="space-y-1.5">
              {topupRequests.filter(r => r.status !== 'pending').slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{formatBalance(r.amount_cents)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {r.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
