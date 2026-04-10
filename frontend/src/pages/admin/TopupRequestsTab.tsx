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

function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === 'pending') return { background: 'var(--amber-bg)', color: 'var(--amber)' }
  if (status === 'approved') return { background: 'var(--emerald-bg)', color: 'var(--emerald)' }
  return { background: 'var(--red-bg)', color: 'var(--red)' }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Offen',
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

  const pillBtn = (active: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{ padding: '5px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: active ? '#111' : 'var(--surface2)', color: active ? '#fff' : 'var(--text2)', fontWeight: active ? 700 : 500 }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {pillBtn(filter === 'pending', () => setFilter('pending'), `Offen${pendingCount > 0 ? ` (${pendingCount})` : ''}`)}
          {pillBtn(filter === 'all', () => setFilter('all'), 'Alle')}
        </div>
        <button onClick={() => load(filter === 'pending' ? 'pending' : undefined)} style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Anträge...</div>
      ) : requests.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>
          {filter === 'pending' ? 'Keine offenen Anträge.' : 'Keine Anträge vorhanden.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Nutzer', 'Betrag', 'Kommentar', 'Datum', 'Status', 'Aktionen'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{req.user_email}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text)' }}>{formatEur(req.amount_cents)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', maxWidth: 200 }} title={req.note ?? ''}>{req.note ?? '–'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{formatDate(req.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, ...statusBadgeStyle(req.status) }}>
                      {STATUS_LABEL[req.status]}
                    </span>
                    {req.admin_note && (
                      <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>{req.admin_note}</p>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {req.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => approve(req)}
                          disabled={actionId === req.id}
                          className="btn-lime"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          ✓ Genehmigen
                        </button>
                        <button
                          onClick={() => { setRejectModal(req); setRejectNote('') }}
                          disabled={actionId === req.id}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}
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
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Antrag ablehnen</h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 14px' }}>
              {rejectModal.user_email} – {formatEur(rejectModal.amount_cents)}
            </p>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Grund (optional)</label>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={2}
              placeholder="z.B. Zahlung nicht eingegangen"
              className="input-lime"
              style={{ resize: 'none', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRejectModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button
                onClick={reject}
                disabled={actionId !== null}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: actionId !== null ? 0.6 : 1 }}
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
