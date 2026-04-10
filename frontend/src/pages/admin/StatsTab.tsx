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
  <div style={{ background: '#fff', borderRadius: 12, border: `0.5px solid ${highlight ? 'var(--lime)' : 'var(--border)'}`, padding: '16px 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{label}</span>
    </div>
    <p style={{ fontSize: 22, fontWeight: 800, color: highlight ? 'var(--lime-dark)' : 'var(--text)', margin: 0 }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</p>}
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
      <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--red)', margin: 0 }}>Finanzdaten zurücksetzen</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>Lade Vorschau...</p>}

          {!loading && error && <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>}

          {!loading && preview && !done && (
            <>
              <div style={{ background: 'var(--red-bg)', border: '0.5px solid var(--red)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--red)' }}>
                <p style={{ fontWeight: 700, margin: '0 0 6px' }}>Folgendes wird zurückgesetzt:</p>
                <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
                  <li><strong>{preview.users_affected}</strong> Nutzer-Guthaben werden auf 0€ gesetzt</li>
                  <li><strong>{preview.transactions_deleted}</strong> Transaktionen werden gelöscht</li>
                  <li><strong>{preview.vouchers_reset}</strong> eingelöste Voucher werden zurückgesetzt</li>
                  <li><strong>{preview.topup_requests_deleted}</strong> Auflade-Anfragen werden gelöscht</li>
                </ul>
              </div>

              {preview.active_occupations_untouched > 0 && (
                <div style={{ background: 'var(--amber-bg)', border: '0.5px solid var(--amber)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--amber)' }}>
                  <strong>{preview.active_occupations_untouched}</strong> laufende Druckvorgänge bleiben unberührt.
                </div>
              )}

              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>
                Diese Aktion kann nicht rückgängig gemacht werden. Alle Guthaben und Finanzdaten werden dauerhaft gelöscht.
              </div>

              <button
                onClick={execute}
                disabled={executing}
                style={{ width: '100%', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: executing ? 'not-allowed' : 'pointer', opacity: executing ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                {executing ? 'Wird zurückgesetzt...' : 'Ja, alle Finanzdaten zurücksetzen'}
              </button>
            </>
          )}

          {done && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald)' }}>Finanzdaten erfolgreich zurückgesetzt.</p>
              <button onClick={onClose} style={{ marginTop: 12, fontSize: 13, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Schließen</button>
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

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Statistiken...</div>
  if (!stats) return <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', padding: '32px 0' }}>Fehler beim Laden.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Portal-Statistiken</h2>
        <button onClick={load} style={{ fontSize: 13, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Aktualisieren</button>
      </div>

      {/* Live-Status */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Live-Status</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <StatCard icon="🖨️" label="Aktive Belegungen" value={String(stats.active_occupations)} sub="Drucker aktuell in Benutzung" highlight={stats.active_occupations > 0} />
          <StatCard icon="⏳" label="Warteschlange" value={String(stats.pending_queue_entries)} sub="Nutzer warten auf Drucker" />
        </div>
      </div>

      {/* Umsatz */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Umsatz</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <StatCard icon="💰" label="Umsatz diesen Monat" value={formatEur(stats.revenue_this_month_cents)} sub="Druckkosten abgerechnet" highlight />
          <StatCard icon="📈" label="Umsatz gesamt" value={formatEur(stats.revenue_all_time_cents)} sub="Seit Portalbeginn" />
        </div>
      </div>

      {/* Nutzung */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Nutzung</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <StatCard icon="👥" label="Registrierte Nutzer" value={String(stats.users_total)} />
          <StatCard icon="✅" label="Abgeschlossene Drucke" value={String(stats.prints_completed)} sub="Über das Portal gestartet" />
          <StatCard icon="💾" label="Belegter Speicher" value={formatBytes(stats.storage_used_total_bytes)} sub="G-Code-Dateien gesamt" />
        </div>
      </div>

      {/* Diagramme */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Diagramme</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                  fontFamily: 'inherit', border: 'none',
                  background: chartPeriod === p ? '#111' : 'var(--surface2)',
                  color: chartPeriod === p ? '#fff' : 'var(--text2)',
                  fontWeight: chartPeriod === p ? 700 : 500,
                }}
              >
                {p === '7d' ? '7 Tage' : p === '30d' ? '30 Tage' : '90 Tage'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '0 0 10px' }}>Umsatz (€)</p>
            <SimpleBarChart
              data={(chartData?.revenue_by_day ?? []).map(d => ({ label: d.date.slice(5), value: d.cents }))}
              color="var(--lime-dark)"
              formatValue={v => `${(v / 100).toFixed(0)}€`}
              emptyText="Kein Umsatz in diesem Zeitraum"
            />
          </div>
          <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '0 0 10px' }}>Drucke pro Tag</p>
            <SimpleBarChart
              data={(chartData?.prints_by_day ?? []).map(d => ({ label: d.date.slice(5), value: d.count }))}
              color="var(--emerald)"
              formatValue={v => String(v)}
              emptyText="Keine Drucke in diesem Zeitraum"
            />
          </div>
        </div>
      </div>

      {/* CSV-Exporte */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Datenexport</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['/admin/transactions/export', 'Transaktionen (CSV)'],
            ['/admin/occupations/export', 'Druckjobs (CSV)'],
            ['/admin/users/export', 'Nutzer (CSV)'],
          ].map(([url, label]) => (
            <button
              key={url}
              onClick={() => downloadCsv(url)}
              className="btn-secondary"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ border: '0.5px solid var(--red)', borderRadius: 12, padding: '14px 16px', background: 'var(--red-bg)' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Danger Zone</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', margin: '0 0 2px' }}>Finanzdaten zurücksetzen</p>
            <p style={{ fontSize: 12, color: 'var(--red)', margin: 0, opacity: 0.8 }}>
              Setzt alle Guthaben auf 0€ und löscht alle Transaktionen, Voucher-Einlösungen und Topup-Anfragen.
            </p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            style={{ flexShrink: 0, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
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
