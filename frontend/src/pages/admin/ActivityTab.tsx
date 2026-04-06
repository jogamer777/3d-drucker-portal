import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface ActivityLog {
  id: number
  actor_email: string | null
  action: string
  details: string | null
  created_at: string
}

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  register:       { label: 'Registrierung', color: 'bg-blue-100 text-blue-700' },
  login:          { label: 'Login',          color: 'bg-green-100 text-green-700' },
  login_failed:   { label: 'Login fehlgesch.', color: 'bg-red-100 text-red-700' },
  voucher_redeem: { label: 'Code eingelöst', color: 'bg-purple-100 text-purple-700' },
}

type Filter = 'all' | 'register' | 'login' | 'login_failed' | 'voucher_redeem'

export default function ActivityTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/admin/activity').then(r => setLogs(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.action !== filter) return false
    if (search && !l.actor_email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const count = (action: string) => logs.filter(l => l.action === action).length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Filter-Buttons */}
        <div className="flex flex-wrap gap-2">
          {([
            ['all', `Alle (${logs.length})`],
            ['register', `Registrierung (${count('register')})`],
            ['login', `Login (${count('login')})`],
            ['login_failed', `Fehlschlag (${count('login_failed')})`],
            ['voucher_redeem', `Code eingelöst (${count('voucher_redeem')})`],
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

        {/* Suche */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="E-Mail suchen..."
          className="ml-auto border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <button onClick={load} className="text-sm text-blue-600 hover:underline">Aktualisieren</button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Laden...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Keine Einträge gefunden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Datum & Uhrzeit</th>
                <th className="pb-2 font-medium">Nutzer</th>
                <th className="pb-2 font-medium">Aktion</th>
                <th className="pb-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="py-2 font-medium text-gray-800">{log.actor_email ?? '–'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{log.details ?? '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
