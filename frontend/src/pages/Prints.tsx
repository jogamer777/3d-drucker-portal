import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

interface PrintHistory {
  id: number
  printer_id: string
  filename: string | null
  claimed_at: string
  completed_at: string | null
  charged_cost_cents: number | null
  status: string
}

const PRINTER_NAMES: Record<string, string> = {
  k2: 'K2 Plus Combo',
  crx: 'CR-X Pro',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '–'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatCost(cents: number | null): string {
  if (cents === null || cents === undefined) return '–'
  return (Math.abs(cents) / 100).toFixed(2).replace('.', ',') + ' €'
}

export default function Prints() {
  const [prints, setPrints] = useState<PrintHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/user/prints')
      .then(r => setPrints(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Meine Drucke</h1>
          <p className="text-sm text-gray-500 mt-0.5">Verlauf aller abgeschlossenen Druckaufträge</p>
        </div>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Lade Druckverlauf...</div>
      ) : prints.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-3">🖨️</p>
          <p className="text-gray-500 font-medium">Noch keine Drucke</p>
          <p className="text-sm text-gray-400 mt-1">Abgeschlossene Druckaufträge erscheinen hier.</p>
          <Link to="/drucker" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
            Zu den Druckern →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Datum</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Drucker</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Datei</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dauer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kosten</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prints.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatDate(p.claimed_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {PRINTER_NAMES[p.printer_id] ?? p.printer_id}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={p.filename ?? ''}>
                    {p.filename ?? '–'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatDuration(p.claimed_at, p.completed_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                    {formatCost(p.charged_cost_cents)}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'released' ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Abgeholt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        Abholbereit
                      </span>
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
