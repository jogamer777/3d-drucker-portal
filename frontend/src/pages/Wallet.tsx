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

const PRESET_AMOUNTS = [500, 1000, 2000, 5000]

const TYPE_LABEL: Record<string, string> = {
  topup: 'Aufladung',
  charge: 'Abbuchung',
  refund: 'Erstattung',
}

export default function Wallet() {
  const { user, setAuth, accessToken } = useAuthStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(true)
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
    api.get('/user/transactions').then(r => setTransactions(r.data)).finally(() => setTxLoading(false))
    loadTopupRequests()
  }, [])

  const pendingRequest = topupRequests.find(r => r.status === 'pending')

  const submitTopupRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setTopupMsg(null)
    const cents = topupCustom ? Math.round(parseFloat(topupCustom.replace(',', '.')) * 100) : topupAmount
    if (!cents || cents < 100) { setTopupMsg({ type: 'error', text: 'Mindestbetrag: 1,00 €' }); return }
    if (cents > 20000) { setTopupMsg({ type: 'error', text: 'Höchstbetrag: 200,00 €' }); return }
    setTopupLoading(true)
    try {
      await api.post('/user/topup-request', { amount_cents: cents, note: topupNote.trim() || null })
      setTopupMsg({ type: 'success', text: 'Aufladeantrag gestellt! Ein Admin wird ihn bearbeiten.' })
      setTopupNote(''); setTopupCustom('')
      loadTopupRequests()
    } catch (e: any) {
      setTopupMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler' })
    } finally {
      setTopupLoading(false)
    }
  }

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)
    try {
      const res = await api.post('/vouchers/redeem', { code: code.trim().toUpperCase() })
      setSuccess(`Gutschein eingelöst! ${formatBalance(res.data.value_cents)} wurden gutgeschrieben.`)
      setCode('')
      if (user) {
        const meRes = await api.get('/user/me')
        setAuth(accessToken!, meRes.data)
      }
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
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Guthaben</h1>
      </div>

      {/* Top grid: balance card + voucher + topup */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, marginBottom: 12 }}
           className="grid-cols-1 md:grid-cols-[260px_1fr]">

        {/* Balance card */}
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: '24px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em' }}>Guthaben</p>
          <p style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.05em', margin: 0, lineHeight: 1.1 }}>
            {user ? formatBalance(user.balance_cents) : '–'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Voucher */}
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '16px 18px' }}>
            <p style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px' }}>Gutschein-Code einlösen</p>
            <form onSubmit={handleRedeem} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX" maxLength={14}
                className="input-lime"
                style={{ fontFamily: 'var(--mono)', fontSize: 13, flex: 1 }}
              />
              <button type="submit" disabled={loading || code.length < 3} className="btn-lime" style={{ padding: '9px 16px', fontSize: 13, flexShrink: 0 }}>
                {loading ? '...' : 'Einlösen'}
              </button>
            </form>
            {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
            {success && <p style={{ fontSize: 12, color: 'var(--emerald)', marginTop: 6 }}>{success}</p>}
          </div>

          {/* Topup request */}
          <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '16px 18px' }}>
            <p style={{ fontSize: 13, fontWeight: 800, margin: '0 0 4px' }}>Aufladeantrag stellen</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>Zahle per Überweisung oder Bar – ein Admin genehmigt die Gutschrift.</p>

            {pendingRequest ? (
              <div style={{ background: 'var(--amber-bg)', border: '0.5px solid var(--amber)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                <p style={{ fontWeight: 700, color: 'var(--amber)', margin: '0 0 2px' }}>Offener Antrag</p>
                <p style={{ color: 'var(--text2)', margin: 0 }}>
                  {formatBalance(pendingRequest.amount_cents)} – wird bearbeitet
                  {pendingRequest.note && <span> · {pendingRequest.note}</span>}
                </p>
              </div>
            ) : (
              <form onSubmit={submitTopupRequest} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESET_AMOUNTS.map(a => (
                    <button key={a} type="button" onClick={() => { setTopupAmount(a); setTopupCustom('') }}
                      style={{
                        padding: '5px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        border: topupAmount === a && !topupCustom ? '1.5px solid var(--lime)' : '0.5px solid var(--border)',
                        background: topupAmount === a && !topupCustom ? 'var(--lime-bg)' : 'transparent',
                        fontWeight: topupAmount === a && !topupCustom ? 800 : 500,
                      }}>
                      {formatBalance(a)}
                    </button>
                  ))}
                </div>
                <input type="text" value={topupCustom} onChange={e => setTopupCustom(e.target.value)} placeholder="Anderen Betrag (z.B. 15,00)" className="input-lime" style={{ fontSize: 13 }} />
                <input type="text" value={topupNote} onChange={e => setTopupNote(e.target.value)} placeholder="Kommentar (optional)" className="input-lime" style={{ fontSize: 13 }} />
                {topupMsg && (
                  <div style={{ borderRadius: 8, padding: '8px 12px', fontSize: 12, background: topupMsg.type === 'success' ? 'var(--emerald-bg)' : 'var(--red-bg)', color: topupMsg.type === 'success' ? 'var(--emerald)' : 'var(--red)' }}>
                    {topupMsg.text}
                  </div>
                )}
                <button type="submit" disabled={topupLoading} className="btn-lime" style={{ padding: '9px 16px', fontSize: 13, alignSelf: 'flex-start' }}>
                  {topupLoading ? 'Sende...' : 'Antrag stellen'}
                </button>
              </form>
            )}

            {topupRequests.filter(r => r.status !== 'pending').length > 0 && (
              <div style={{ marginTop: 12, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Frühere Anträge</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topupRequests.filter(r => r.status !== 'pending').slice(0, 5).map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>{formatBalance(r.amount_cents)}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: r.status === 'approved' ? 'var(--emerald-bg)' : 'var(--red-bg)', color: r.status === 'approved' ? 'var(--emerald)' : 'var(--red)' }}>
                        {r.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Transaktionshistorie</p>
        </div>
        {txLoading ? (
          <p style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 18px' }}>Laden...</p>
        ) : transactions.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 18px' }}>Noch keine Transaktionen.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Datum', 'Art', 'Beschreibung', 'Betrag'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Betrag' ? 'right' : 'left', padding: '9px 14px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr key={tx.id} style={{ borderBottom: i < transactions.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '9px 14px', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatDate(tx.created_at)}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                      background: tx.type === 'topup' ? 'var(--emerald-bg)' : tx.type === 'refund' ? 'var(--blue-bg)' : 'var(--red-bg)',
                      color: tx.type === 'topup' ? 'var(--emerald)' : tx.type === 'refund' ? 'var(--blue)' : 'var(--red)',
                    }}>
                      {TYPE_LABEL[tx.type]}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--text2)' }}>{tx.description}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--mono)', color: tx.amount_cents >= 0 ? 'var(--emerald)' : 'var(--red)' }}>
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
