import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface TopupRequest {
  id: number
  user_id: number
  user_email: string
  amount_cents: number
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  processed_at: string | null
  admin_note: string | null
}

function formatEur(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  pending:  'Offen',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
}

export default function TopupRequestsTab() {
  const [requests, setRequests] = useState<TopupRequest[]>([])
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [rejectModal, setRejectModal] = useState<TopupRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const load = (status?: string) => {
    setLoading(true)
    const url = status ? `/admin/topup-requests?status=${status}` : '/admin/topup-requests'
    api.get(url)
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(filter === 'pending' ? 'pending' : undefined)
  }, [filter])

  const approve = async (req: TopupRequest) => {
    setActionId(req.id)
    try {
      await api.post(`/admin/topup-requests/${req.id}/approve`)
      load(filter === 'pending' ? 'pending' : undefined)
    } catch (e: any) {
      alert(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setActionId(null)
    }
  }

  const reject = async () => {
    if (!rejectModal) return
    setActionId(rejectModal.id)
    try {
      await api.post(`/admin/topup-requests/${rejectModal.id}/reject`, { admin_note: rejectNote || null })
      setRejectModal(null)
      setRejectNote('')
      load(filter === 'pending' ? 'pending' : undefined)
    } catch (e: any) {
      alert(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setActionId(null)
    }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['pending', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'pending' ? `Offen${pendingCount > 0 ? ` (${pendingCount})` : ''}` : 'Alle'}
            </button>
          ))}
        </div>
        <button onClick={() => load(filter === 'pending' ? 'pending' : undefined)} className="text-sm text-blue-600 hover:underline">
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Lade Anträge...</div>
      ) : requests.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">
          {filter === 'pending' ? 'Keine offenen Anträge.' : 'Keine Anträge vorhanden.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium pr-4">Nutzer</th>
                <th className="pb-2 font-medium pr-4">Betrag</th>
                <th className="pb-2 font-medium pr-4">Kommentar</th>
                <th className="pb-2 font-medium pr-4">Datum</th>
                <th className="pb-2 font-medium pr-4">Status</th>
                <th className="pb-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(req => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 text-gray-700">{req.user_email}</td>
                  <td className="py-2.5 pr-4 font-semibold text-gray-900">{formatEur(req.amount_cents)}</td>
                  <td className="py-2.5 pr-4 text-gray-500 max-w-xs truncate" title={req.note ?? ''}>
                    {req.note ?? '–'}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{formatDate(req.created_at)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[req.status]}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                    {req.admin_note && (
                      <p className="text-xs text-gray-400 mt-0.5">{req.admin_note}</p>
                    )}
                  </td>
                  <td className="py-2.5">
                    {req.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(req)}
                          disabled={actionId === req.id}
                          className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg"
                        >
                          ✓ Genehmigen
                        </button>
                        <button
                          onClick={() => { setRejectModal(req); setRejectNote('') }}
                          disabled={actionId === req.id}
                          className="text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg"
                        >
                          ✗ Ablehnen
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ablehnen-Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Antrag ablehnen</h3>
            <p className="text-sm text-gray-500 mb-3">
              {rejectModal.user_email} – {formatEur(rejectModal.amount_cents)}
            </p>
            <label className="block text-sm text-gray-600 mb-1">Grund (optional)</label>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={2}
              placeholder="z.B. Zahlung nicht eingegangen"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={reject}
                disabled={actionId !== null}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium"
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
