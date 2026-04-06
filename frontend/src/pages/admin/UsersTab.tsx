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
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [resetModal, setResetModal] = useState<{ userId: number; email: string } | null>(null)
  const [tempPw, setTempPw] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // Löschen-Modal
  const [deleteModal, setDeleteModal] = useState<{ userId: number; email: string } | null>(null)

  // Guthaben-Modal
  const [balanceModal, setBalanceModal] = useState<AdminUser | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceNote, setBalanceNote] = useState('')

  // Nachrichten-Modal
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

  // Prüfe ob Nutzer eine ungelesene Antwort hat
  const getUserReply = (userId: number): AdminMessage | undefined =>
    messages.find(m => {
      const u = users.find(u => u.email === m.to_user_email)
      return u?.id === userId && m.reply !== null
    })

  const formatBalance = (cents: number) => (cents / 100).toFixed(2) + ' €'
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

  if (loading) return <p className="text-sm text-gray-400 p-4">Laden...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{users.length} Nutzer gesamt</p>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">Aktualisieren</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">E-Mail</th>
              <th className="pb-2 font-medium">Rolle</th>
              <th className="pb-2 font-medium">Guthaben</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Letzter Login</th>
              <th className="pb-2 font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const reply = getUserReply(u.id)
              return (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-900">{u.email}</td>
                  <td className="py-2">
                    <select
                      value={u.role}
                      onChange={e => updateUser(u.id, { role: e.target.value })}
                      disabled={actionLoading === u.id}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                    >
                      <option value="normal">Normal</option>
                      <option value="power_user">Power-User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-2 text-gray-700">{formatBalance(u.balance_cents)}</td>
                  <td className="py-2">
                    {u.is_blocked ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Gesperrt</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Aktiv</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-500">{formatDate(u.last_login_at)}</td>
                  <td className="py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => updateUser(u.id, { is_blocked: !u.is_blocked })}
                        disabled={actionLoading === u.id}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          u.is_blocked
                            ? 'border-green-300 text-green-700 hover:bg-green-50'
                            : 'border-red-300 text-red-700 hover:bg-red-50'
                        }`}
                      >
                        {u.is_blocked ? 'Entsperren' : 'Sperren'}
                      </button>
                      <button
                        onClick={() => { setResetModal({ userId: u.id, email: u.email }); setTempPw('') }}
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        PW Reset
                      </button>
                      <button
                        onClick={() => { setBalanceModal(u); setBalanceAmount(''); setBalanceNote('') }}
                        className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                      >
                        Guthaben
                      </button>
                      <button
                        onClick={() => openMsgModal(u)}
                        className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 flex items-center gap-1"
                      >
                        Nachricht{reply ? ' 💬' : ''}
                      </button>
                      <button
                        onClick={() => setDeleteModal({ userId: u.id, email: u.email })}
                        disabled={actionLoading === u.id}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Guthaben anpassen</h3>
            <p className="text-sm text-gray-500 mb-1">{balanceModal.email}</p>
            <p className="text-sm font-medium text-gray-700 mb-4">
              Aktuell: <span className="text-green-700">{formatBalance(balanceModal.balance_cents)}</span>
            </p>
            <label className="block text-xs text-gray-500 mb-1">Betrag (€)</label>
            <input
              type="number"
              value={balanceAmount}
              onChange={e => setBalanceAmount(e.target.value)}
              min="0.01" step="0.01" placeholder="5.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="block text-xs text-gray-500 mb-1">Grund (Pflicht)</label>
            <input
              type="text"
              value={balanceNote}
              onChange={e => setBalanceNote(e.target.value)}
              placeholder="z.B. Rückerstattung Druck #42"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setBalanceModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
              >Abbrechen</button>
              <button
                onClick={() => adjustBalance('sub')}
                disabled={!balanceAmount || !balanceNote.trim() || parseFloat(balanceAmount) <= 0 || actionLoading === balanceModal.id}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium"
              >Abziehen</button>
              <button
                onClick={() => adjustBalance('add')}
                disabled={!balanceAmount || !balanceNote.trim() || parseFloat(balanceAmount) <= 0 || actionLoading === balanceModal.id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium"
              >Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Passwort-Reset Modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Passwort zurücksetzen</h3>
            <p className="text-sm text-gray-600 mb-4">{resetModal.email}</p>
            {!tempPw ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Ein neues temporäres Passwort wird generiert. Der Nutzer muss es beim nächsten Login ändern.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setResetModal(null)}
                    className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={resetPassword}
                    disabled={actionLoading === resetModal.userId}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg py-2 text-sm"
                  >
                    Reset durchführen
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-2">Temporäres Passwort (bitte notieren!):</p>
                <code className="block bg-gray-100 rounded-lg px-4 py-3 text-lg font-mono text-center tracking-widest mb-4 select-all">
                  {tempPw}
                </code>
                <button
                  onClick={() => setResetModal(null)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm"
                >
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Nutzer löschen</h3>
            <p className="text-sm text-gray-600 mb-3">{deleteModal.email}</p>
            <p className="text-sm text-red-600 mb-5">
              Alle Transaktionen und Nachrichten dieses Nutzers werden mitgelöscht. Diese Aktion ist nicht rückgängig zu machen!
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={deleteUser}
                disabled={actionLoading === deleteModal.userId}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-medium"
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Nachricht senden</h3>
            <p className="text-sm text-gray-500 mb-4">{msgModal.email}</p>

            {/* Vorherige Antwort anzeigen */}
            {(() => {
              const reply = getUserReply(msgModal.userId)
              if (!reply) return null
              return (
                <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
                  <p className="font-medium text-blue-700 mb-1">Antwort des Nutzers:</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{reply.reply}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(reply.replied_at)}</p>
                  <hr className="my-2 border-blue-100"/>
                  <p className="text-xs text-gray-500">Ihre ursprüngliche Nachricht: {reply.body}</p>
                </div>
              )
            })()}

            {msgSent ? (
              <>
                <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3 mb-4">
                  Nachricht wurde gesendet. Sie erscheint beim nächsten Login des Nutzers.
                </p>
                <button
                  onClick={() => setMsgModal(null)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm"
                >
                  Schließen
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  placeholder="Nachricht eingeben..."
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMsgModal(null)}
                    className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!msgBody.trim() || actionLoading === msgModal.userId}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium"
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
