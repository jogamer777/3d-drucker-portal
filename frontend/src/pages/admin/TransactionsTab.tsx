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

function typeBadge(type: string) {
  if (type === 'topup') return { background: 'var(--emerald-bg)', color: 'var(--emerald)' }
  if (type === 'refund') return { background: 'var(--blue-bg)', color: 'var(--blue)' }
  return { background: 'var(--red-bg)', color: 'var(--red)' }
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

  const pillBtn = (active: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: active ? '#111' : 'var(--surface2)', color: active ? '#fff' : 'var(--text2)', fontWeight: active ? 700 : 500 }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {pillBtn(filter === 'all', () => setFilter('all'), `Alle (${transactions.length})`)}
          {pillBtn(filter === 'topup', () => setFilter('topup'), `Aufladungen (${transactions.filter(t => t.type === 'topup').length})`)}
          {pillBtn(filter === 'charge', () => setFilter('charge'), `Abbuchungen (${transactions.filter(t => t.type === 'charge').length})`)}
          {pillBtn(filter === 'refund', () => setFilter('refund'), `Erstattungen (${transactions.filter(t => t.type === 'refund').length})`)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => window.open('/api/admin/transactions/export', '_blank')} className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>CSV exportieren</button>
          <button onClick={load} style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Aktualisieren</button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Laden...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Keine Transaktionen vorhanden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Datum', 'Nutzer', 'Art', 'Betrag', 'Beschreibung / Code'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{formatDate(t.created_at)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{t.user_email}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, ...typeBadge(t.type) }}>
                      {TYPE_LABELS[t.type]}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'var(--mono)', color: t.amount_cents >= 0 ? 'var(--emerald)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                    {formatAmount(t.amount_cents)}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>
                    {t.description}
                    {t.related_voucher_code && (
                      <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>({t.related_voucher_code})</span>
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
