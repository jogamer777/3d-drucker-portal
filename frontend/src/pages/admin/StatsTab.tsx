import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface Stats {
  users_total: number
  revenue_all_time_cents: number
  revenue_this_month_cents: number
  prints_completed: number
  active_occupations: number
  pending_queue_entries: number
  storage_used_total_bytes: number
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

export default function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.get('/admin/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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
    </div>
  )
}
