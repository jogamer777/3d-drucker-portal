import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore, formatBalance } from '../stores/authStore'
import api from '../lib/api'

interface UserMessage {
  id: number
  from_admin_email: string | null
  body: string
  created_at: string
  read_at: string | null
  reply: string | null
  replied_at: string | null
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<UserMessage[]>([])
  const [msgIndex, setMsgIndex] = useState(0)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.get('/user/messages?unread=true').then(r => {
      if (r.data.length > 0) {
        setMessages(r.data)
        setMsgIndex(0)
        setReply('')
      }
    }).catch(() => {})
  }, [])

  const currentMsg = messages[msgIndex] ?? null

  const closeMessage = async (msg: UserMessage) => {
    try {
      await api.patch(`/user/messages/${msg.id}/read`)
    } catch {}
    advanceOrClose()
  }

  const sendReply = async (msg: UserMessage) => {
    if (!reply.trim()) return
    setSending(true)
    try {
      await api.post(`/user/messages/${msg.id}/reply`, { reply: reply.trim() })
    } catch {}
    setSending(false)
    advanceOrClose()
  }

  const advanceOrClose = () => {
    const next = msgIndex + 1
    if (next < messages.length) {
      setMsgIndex(next)
      setReply('')
    } else {
      setMessages([])
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Willkommen, {user?.email}</p>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {/* Guthaben */}
        <Link to="/guthaben" className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 transition-colors block">
          <p className="text-sm text-gray-500">Mein Guthaben</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {user ? formatBalance(user.balance_cents) : '–'}
          </p>
          <p className="text-xs text-blue-600 mt-2">Code einlösen →</p>
        </Link>

        {/* K2 Combo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">K2 Plus Combo</p>
          <p className="text-base font-medium text-gray-400 mt-1">Wird verbunden...</p>
          <p className="text-xs text-gray-400 mt-1">Phase 4</p>
        </div>

        {/* CR-X Pro */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">CR-X Pro</p>
          <p className="text-base font-medium text-gray-400 mt-1">Wird verbunden...</p>
          <p className="text-xs text-gray-400 mt-1">Phase 4</p>
        </div>
      </div>

      {/* Schnell-Links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/drucker', icon: '🖨️', label: 'Drucker', sub: 'Status & Drucken' },
          { to: '/dateien', icon: '📁', label: 'Meine Dateien', sub: 'G-Code verwalten' },
          { to: '/guthaben', icon: '💳', label: 'Guthaben', sub: 'Aufladen & Verlauf' },
          ...(user?.role === 'admin' ? [{ to: '/admin', icon: '⚙️', label: 'Admin', sub: 'Nutzer & Gutscheine' }] : []),
        ].map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">{item.icon}</span>
            <p className="font-medium text-gray-900 mt-2 text-sm">{item.label}</p>
            <p className="text-xs text-gray-400">{item.sub}</p>
          </Link>
        ))}
      </div>

      {/* Nachrichten-Modal */}
      {currentMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📬</span>
              <h3 className="font-semibold text-gray-900">Nachricht vom Administrator</h3>
            </div>
            {currentMsg.from_admin_email && (
              <p className="text-xs text-gray-400 mb-3">von {currentMsg.from_admin_email}</p>
            )}
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-800 whitespace-pre-wrap">
              {currentMsg.body}
            </div>

            {currentMsg.reply === null && (
              <>
                <p className="text-xs text-gray-500 mb-1">Antwort (optional):</p>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Ihre Antwort..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                />
              </>
            )}

            {messages.length > 1 && (
              <p className="text-xs text-gray-400 mb-3 text-center">
                Nachricht {msgIndex + 1} von {messages.length}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => closeMessage(currentMsg)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Schließen
              </button>
              {currentMsg.reply === null && (
                <button
                  onClick={() => sendReply(currentMsg)}
                  disabled={!reply.trim() || sending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium"
                >
                  Antworten & Schließen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
