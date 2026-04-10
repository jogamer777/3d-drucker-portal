import { useState, useEffect } from 'react'
import api from '../../lib/api'
import SimpleBarChart from '../../components/SimpleBarChart'

interface Stats {
  users_total: number
  revenue_all_time_cents: number
  revenue_this_month_cents: number
  prints_completed: number
  active_occupations: number
  pending_queue_entries: number
  storage_used_total_bytes: number
}

interface ChartData {
  period: string
  revenue_by_day: { date: string; cents: number }[]
  prints_by_day: { date: string; count: number }[]
}

interface ResetPreview {
  dry_run: boolean
  users_affected: number
  transactions_deleted: number
  vouchers_reset: number
  topup_requests_deleted: number
  active_occupations_untouched: number
}

function formatEur(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const StatCard = ({
  icon, label, value, sub, highlight,
}: {
  icon: string; label: string; value: string; sub?: string; highlight?: boolean
}) => (
  <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-blue-200' : 'border-gray-200'}`}>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-2xl">{icon}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
    <p className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
)

function FinancialResetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.post('/admin/financial-reset', { confirm: false })
      .then(r => setPreview(r.data))
      .catch(() => setError('Vorschau konnte nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  const execute = async () => {
    setExecuting(true)
    setError('')
    try {
      await api.post('/admin/financial-reset', { confirm: true })
      setDone(true)
      onDone()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler beim Zurücksetzen')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-red-700">Finanzdaten zurücksetzen</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading && <p className="text-sm text-gray-400 text-center py-4">Lade Vorschau...</p>}

          {!loading && error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && preview && !done && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 space-y-1">
                <p className="font-semibold">Folgendes wird zurückgesetzt:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 mt-1">
                  <li><strong>{preview.users_affected}</strong> Nutzer-Guthaben werden auf 0€ gesetzt</li>
                  <li><strong>{preview.transactions_deleted}</strong> Transaktionen werden gelöscht</li>
                  <li><strong>{preview.vouchers_reset}</strong> eingelöste Voucher werden zurückgesetzt</li>
                  <li><strong>{preview.topup_requests_deleted}</strong> Auflade-Anfragen werden gelöscht</li>
                </ul>
              </div>

              {preview.active_occupations_untouched > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-xs text-yellow-800">
                  <strong>{preview.active_occupations_untouched}</strong> laufende Druckvorgänge bleiben unberührt.
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600">
                Diese Aktion kann nicht rückgängig gemacht werden. Alle Guthaben und Finanzdaten werden dauerhaft gelöscht.
              </div>

              <button
                onClick={execute}
                disabled={executing}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {executing ? 'Wird zurückgesetzt...' : 'Ja, alle Finanzdaten zurücksetzen'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <p className="text-green-700 font-semibold">Finanzdaten erfolgreich zurückgesetzt.</p>
              <button onClick={onClose} className="mt-3 text-sm text-blue-600 hover:underline">Schließen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function downloadCsv(url: string) {
  const a = document.createElement('a')
  a.href = `/api${url}`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showResetModal, setShowResetModal] = useState(false)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('7d')

  const load = () => {
    setLoading(true)
    api.get('/admin/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadChart = (period: '7d' | '30d' | '90d') => {
    api.get(`/admin/stats/chart?period=${period}`)
      .then(r => setChartData(r.data))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadChart(chartPeriod) }, [chartPeriod])

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Lade Statistiken...</div>
  if (!stats) return <div className="text-sm text-red-500 py-8 text-center">Fehler beim Laden.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Portal-Statistiken</h2>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">Aktualisieren</button>
      </div>

      {/* Live-Status */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Live-Status</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            icon="🖨️"
            label="Aktive Belegungen"
            value={String(stats.active_occupations)}
            sub="Drucker aktuell in Benutzung"
            highlight={stats.active_occupations > 0}
          />
          <StatCard
            icon="⏳"
            label="Warteschlange"
            value={String(stats.pending_queue_entries)}
            sub="Nutzer warten auf Drucker"
          />
        </div>
      </div>

      {/* Umsatz */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Umsatz</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            icon="💰"
            label="Umsatz diesen Monat"
            value={formatEur(stats.revenue_this_month_cents)}
            sub="Druckkosten abgerechnet"
            highlight
          />
          <StatCard
            icon="📈"
            label="Umsatz gesamt"
            value={formatEur(stats.revenue_all_time_cents)}
            sub="Seit Portalbeginn"
          />
        </div>
      </div>

      {/* Nutzung */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Nutzung</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon="👥"
            label="Registrierte Nutzer"
            value={String(stats.users_total)}
          />
          <StatCard
            icon="✅"
            label="Abgeschlossene Drucke"
            value={String(stats.prints_completed)}
            sub="Über das Portal gestartet"
          />
          <StatCard
            icon="💾"
            label="Belegter Speicher"
            value={formatBytes(stats.storage_used_total_bytes)}
            sub="G-Code-Dateien gesamt"
          />
        </div>
      </div>

      {/* Diagramme */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Diagramme</p>
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  chartPeriod === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === '7d' ? '7 Tage' : p === '30d' ? '30 Tage' : '90 Tage'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-600 mb-3">Umsatz (€)</p>
            <SimpleBarChart
              data={(chartData?.revenue_by_day ?? []).map(d => ({
                label: d.date.slice(5),  // MM-DD
                value: d.cents,
              }))}
              color="#2563eb"
              formatValue={v => `${(v / 100).toFixed(0)}€`}
              emptyText="Kein Umsatz in diesem Zeitraum"
            />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-600 mb-3">Drucke pro Tag</p>
            <SimpleBarChart
              data={(chartData?.prints_by_day ?? []).map(d => ({
                label: d.date.slice(5),
                value: d.count,
              }))}
              color="#16a34a"
              formatValue={v => String(v)}
              emptyText="Keine Drucke in diesem Zeitraum"
            />
          </div>
        </div>
      </div>

      {/* CSV-Exporte */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Datenexport</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv('/admin/transactions/export')}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Transaktionen (CSV)
          </button>
          <button
            onClick={() => downloadCsv('/admin/occupations/export')}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Druckjobs (CSV)
          </button>
          <button
            onClick={() => downloadCsv('/admin/users/export')}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Nutzer (CSV)
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 rounded-xl p-4 bg-red-50">
        <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Danger Zone</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-red-800">Finanzdaten zurücksetzen</p>
            <p className="text-xs text-red-600 mt-0.5">
              Setzt alle Guthaben auf 0€ und löscht alle Transaktionen, Voucher-Einlösungen und Topup-Anfragen.
              Laufende Drucke werden nicht abgebrochen.
            </p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      {showResetModal && (
        <FinancialResetModal
          onClose={() => setShowResetModal(false)}
          onDone={() => { setShowResetModal(false); load() }}
        />
      )}
    </div>
  )
}
