import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface AdminUser {
  id: number
  email: string
  role: 'admin' | 'power_user' | 'normal'
  balance_cents: number
  is_blocked: boolean
  failed_login_attempts: number
  created_at: string
  last_login_at: string | null
}

interface AdminMessage {
  id: number
  from_admin_email: string | null
  to_user_email: string
  body: string
  created_at: string
  read_at: string | null
  reply: string | null
  replied_at: string | null
}

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [resetModal, setResetModal] = useState<{ userId: number; email: string } | null>(null)
  const [tempPw, setTempPw] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const [deleteModal, setDeleteModal] = useState<{ userId: number; email: string } | null>(null)
  const [balanceModal, setBalanceModal] = useState<AdminUser | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceNote, setBalanceNote] = useState('')
  const [msgModal, setMsgModal] = useState<{ userId: number; email: string } | null>(null)
  const [msgBody, setMsgBody] = useState('')
  const [msgSent, setMsgSent] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/admin/users'),
      api.get('/admin/messages'),
    ]).then(([uRes, mRes]) => {
      setUsers(uRes.data)
      setMessages(mRes.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const updateUser = async (id: number, patch: object) => {
    setActionLoading(id)
    try {
      await api.patch(`/admin/users/${id}`, patch)
      load()
    } finally {
      setActionLoading(null)
    }
  }

  const resetPassword = async () => {
    if (!resetModal) return
    setActionLoading(resetModal.userId)
    try {
      const res = await api.post(`/admin/users/${resetModal.userId}/reset-password`)
      setTempPw(res.data.temp_password)
    } finally {
      setActionLoading(null)
    }
  }

  const deleteUser = async () => {
    if (!deleteModal) return
    setActionLoading(deleteModal.userId)
    try {
      await api.delete(`/admin/users/${deleteModal.userId}`)
      setUsers(prev => prev.filter(u => u.id !== deleteModal.userId))
      setDeleteModal(null)
    } finally {
      setActionLoading(null)
    }
  }

  const sendMessage = async () => {
    if (!msgModal || !msgBody.trim()) return
    setActionLoading(msgModal.userId)
    try {
      await api.post(`/admin/users/${msgModal.userId}/message`, { body: msgBody.trim() })
      setMsgSent(true)
      load()
    } finally {
      setActionLoading(null)
    }
  }

  const adjustBalance = async (direction: 'add' | 'sub') => {
    if (!balanceModal) return
    const delta = Math.round(parseFloat(balanceAmount) * 100)
    if (!delta || delta <= 0) return
    const newBalance = direction === 'add'
      ? balanceModal.balance_cents + delta
      : balanceModal.balance_cents - delta
    setActionLoading(balanceModal.id)
    try {
      await api.patch(`/admin/users/${balanceModal.id}`, {
        balance_cents: newBalance,
        balance_note: balanceNote.trim() || undefined,
      })
      setBalanceModal(null)
      setBalanceAmount('')
      setBalanceNote('')
      load()
    } finally {
      setActionLoading(null)
    }
  }

  const openMsgModal = (user: AdminUser) => {
    setMsgModal({ userId: user.id, email: user.email })
    setMsgBody('')
    setMsgSent(false)
  }

  const getUserReply = (userId: number): AdminMessage | undefined =>
    messages.find(m => {
      const u = users.find(u => u.email === m.to_user_email)
      return u?.id === userId && m.reply !== null
    })

  const formatBalance = (cents: number) => (cents / 100).toFixed(2) + ' €'
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

  if (loading) return <p style={{ fontSize: 13, color: 'var(--text3)', padding: 16 }}>Laden...</p>

  const modalStyle = { background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }
  const labelStyle = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>{users.length} Nutzer gesamt</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="E-Mail suchen..."
            className="input-lime"
            style={{ fontSize: 12, width: 180 }}
          />
          <button
            onClick={() => window.open('/api/admin/users/export', '_blank')}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            CSV exportieren
          </button>
          <button onClick={load} style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Aktualisieren</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
              {['E-Mail', 'Rolle', 'Guthaben', 'Status', 'Letzter Login', 'Aktionen'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase())).map(u => {
              const reply = getUserReply(u.id)
              return (
                <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{u.email}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <select
                      value={u.role}
                      onChange={e => updateUser(u.id, { role: e.target.value })}
                      disabled={actionLoading === u.id}
                      style={{ border: '0.5px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 11, background: '#fff', fontFamily: 'inherit' }}
                    >
                      <option value="normal">Normal</option>
                      <option value="power_user">Power-User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{formatBalance(u.balance_cents)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {u.is_blocked ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)' }}>Gesperrt</span>
                    ) : (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--emerald-bg)', color: 'var(--emerald)' }}>Aktiv</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>{formatDate(u.last_login_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => updateUser(u.id, { is_blocked: !u.is_blocked })}
                        disabled={actionLoading === u.id}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: u.is_blocked ? '0.5px solid var(--emerald)' : '0.5px solid var(--red)', background: 'transparent', color: u.is_blocked ? 'var(--emerald)' : 'var(--red)' }}
                      >
                        {u.is_blocked ? 'Entsperren' : 'Sperren'}
                      </button>
                      <button
                        onClick={() => { setResetModal({ userId: u.id, email: u.email }); setTempPw('') }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}
                      >
                        PW Reset
                      </button>
                      <button
                        onClick={() => { setBalanceModal(u); setBalanceAmount(''); setBalanceNote('') }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--emerald)', background: 'transparent', color: 'var(--emerald)' }}
                      >
                        Guthaben
                      </button>
                      <button
                        onClick={() => openMsgModal(u)}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--blue)', background: 'transparent', color: 'var(--blue)' }}
                      >
                        Nachricht{reply ? ' 💬' : ''}
                      </button>
                      <button
                        onClick={() => setDeleteModal({ userId: u.id, email: u.email })}
                        disabled={actionLoading === u.id}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Guthaben-Modal */}
      {balanceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={modalStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Guthaben anpassen</h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 4px' }}>{balanceModal.email}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 0 16px' }}>
              Aktuell: <span style={{ color: 'var(--emerald)' }}>{formatBalance(balanceModal.balance_cents)}</span>
            </p>
            <label style={labelStyle}>Betrag (€)</label>
            <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} min="0.01" step="0.01" placeholder="5.00" className="input-lime" style={{ marginBottom: 10 }} />
            <label style={labelStyle}>Grund (Pflicht)</label>
            <input type="text" value={balanceNote} onChange={e => setBalanceNote(e.target.value)} placeholder="z.B. Rückerstattung Druck #42" className="input-lime" style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBalanceModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button
                onClick={() => adjustBalance('sub')}
                disabled={!balanceAmount || !balanceNote.trim() || parseFloat(balanceAmount) <= 0 || actionLoading === balanceModal.id}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!balanceAmount || !balanceNote.trim()) ? 0.4 : 1 }}
              >Abziehen</button>
              <button
                onClick={() => adjustBalance('add')}
                disabled={!balanceAmount || !balanceNote.trim() || parseFloat(balanceAmount) <= 0 || actionLoading === balanceModal.id}
                className="btn-lime"
                style={{ flex: 1, padding: '9px 0' }}
              >Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Passwort-Reset Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={modalStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Passwort zurücksetzen</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px' }}>{resetModal.email}</p>
            {!tempPw ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                  Ein neues temporäres Passwort wird generiert. Der Nutzer muss es beim nächsten Login ändern.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setResetModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
                  <button
                    onClick={resetPassword}
                    disabled={actionLoading === resetModal.userId}
                    style={{ flex: 1, background: 'var(--amber)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Reset durchführen
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Temporäres Passwort (bitte notieren!):</p>
                <code style={{ display: 'block', background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px', fontSize: 20, fontFamily: 'var(--mono)', textAlign: 'center', letterSpacing: '0.1em', marginBottom: 16 }}>
                  {tempPw}
                </code>
                <button onClick={() => setResetModal(null)} className="btn-lime" style={{ width: '100%', padding: '10px 0' }}>
                  Schließen
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Löschen-Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={modalStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Nutzer löschen</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 10px' }}>{deleteModal.email}</p>
            <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 20 }}>
              Alle Transaktionen und Nachrichten dieses Nutzers werden mitgelöscht. Diese Aktion ist nicht rückgängig zu machen!
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button
                onClick={deleteUser}
                disabled={actionLoading === deleteModal.userId}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nachrichten-Modal */}
      {msgModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={{ ...modalStyle, maxWidth: 460 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Nachricht senden</h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>{msgModal.email}</p>

            {(() => {
              const reply = getUserReply(msgModal.userId)
              if (!reply) return null
              return (
                <div style={{ background: 'var(--blue-bg)', border: '0.5px solid var(--blue)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
                  <p style={{ fontWeight: 700, color: 'var(--blue)', margin: '0 0 4px' }}>Antwort des Nutzers:</p>
                  <p style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap', margin: '0 0 4px' }}>{reply.reply}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 6px' }}>{formatDate(reply.replied_at)}</p>
                  <hr style={{ borderColor: 'var(--border)', margin: '6px 0' }} />
                  <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>Ihre ursprüngliche Nachricht: {reply.body}</p>
                </div>
              )
            })()}

            {msgSent ? (
              <>
                <div style={{ background: 'var(--emerald-bg)', border: '0.5px solid var(--emerald)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--emerald)', marginBottom: 14 }}>
                  Nachricht wurde gesendet. Sie erscheint beim nächsten Login des Nutzers.
                </div>
                <button onClick={() => setMsgModal(null)} className="btn-lime" style={{ width: '100%', padding: '10px 0' }}>Schließen</button>
              </>
            ) : (
              <>
                <textarea
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  placeholder="Nachricht eingeben..."
                  rows={4}
                  className="input-lime"
                  style={{ resize: 'none', marginBottom: 14 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setMsgModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
                  <button
                    onClick={sendMessage}
                    disabled={!msgBody.trim() || actionLoading === msgModal.userId}
                    className="btn-lime"
                    style={{ flex: 1, padding: '9px 0' }}
                  >
                    Senden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
