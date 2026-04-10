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
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '–'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatCost(cents: number | null): string {
  if (cents === null || cents === undefined) return '–'
  return (Math.abs(cents) / 100).toFixed(2).replace('.', ',') + ' €'
}

export default function Prints() {
  const [prints, setPrints] = useState<PrintHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/user/prints').then(r => setPrints(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Meine Drucke</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>Verlauf aller abgeschlossenen Druckaufträge</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>Lade Druckverlauf...</p>
      ) : prints.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: '48px 24px', textAlign: 'center' }}>
          <svg style={{ margin: '0 auto 12px', display: 'block' }} width="36" height="36" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.2"><rect x="2" y="5" width="16" height="12" rx="2" /><path d="M2 9h16M6 13h4" /></svg>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', margin: '0 0 4px' }}>Noch keine Drucke</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 14px' }}>Abgeschlossene Druckaufträge erscheinen hier.</p>
          <Link to="/" style={{ fontSize: 13, color: 'var(--lime-dark)', fontWeight: 700, textDecoration: 'none' }}>
            Zum Dashboard →
          </Link>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)' }}>
                {['Datum', 'Drucker', 'Datei', 'Dauer', 'Kosten', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--surface2)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prints.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < prints.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text2)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {formatDate(p.claimed_at)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                    {PRINTER_NAMES[p.printer_id] ?? p.printer_id}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.filename ?? ''}>
                    {p.filename ?? '–'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text2)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {formatDuration(p.claimed_at, p.completed_at)}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 800, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                    {formatCost(p.charged_cost_cents)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {p.status === 'released' ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--emerald-bg)', color: 'var(--emerald)', fontWeight: 700 }}>Abgeholt</span>
                    ) : (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--amber-bg)', color: 'var(--amber)', fontWeight: 700 }}>Abholbereit</span>
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
