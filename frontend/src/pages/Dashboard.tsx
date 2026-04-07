import { useState, useEffect, useRef } from 'react'
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

interface PrinterStatus {
  id: string
  name: string
  online: boolean
  state: string
  filename: string | null
  progress: number
  remaining_seconds: number | null
}

const STATE_DOT: Record<string, string> = {
  idle:          'bg-green-500',
  printing:      'bg-blue-500',
  paused:        'bg-yellow-500',
  error:         'bg-red-500',
  complete:      'bg-green-400',
  offline:       'bg-gray-300',
  pending_setup: 'bg-gray-300',
}
const STATE_LABEL: Record<string, string> = {
  idle:          'Bereit',
  printing:      'Druckt',
  paused:        'Pausiert',
  error:         'Fehler',
  complete:      'Fertig',
  offline:       'Offline',
  pending_setup: 'Einrichtung',
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<UserMessage[]>([])
  const [msgIndex, setMsgIndex] = useState(0)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [printers, setPrinters] = useState<PrinterStatus[]>([])
  const printerInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get('/user/messages?unread=true').then(r => {
      if (r.data.length > 0) {
        setMessages(r.data)
        setMsgIndex(0)
        setReply('')
      }
    }).catch(() => {})

    const loadPrinters = () =>
      api.get('/printers').then(r => setPrinters(r.data)).catch(() => {})
    loadPrinters()
    printerInterval.current = setInterval(loadPrinters, 30_000)
    return () => {
      if (printerInterval.current) clearInterval(printerInterval.current)
    }
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

        {/* Drucker-Status-Karten */}
        {printers.length === 0 ? (
          <>
            {['K2 Plus Combo', 'CR-X Pro'].map(name => (
              <div key={name} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{name}</p>
                <p className="text-sm text-gray-400 mt-1">Verbinde...</p>
              </div>
            ))}
          </>
        ) : (
          printers.map(p => (
            <Link
              key={p.id}
              to="/drucker"
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 transition-colors block"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${STATE_DOT[p.state] ?? 'bg-gray-300'}`} />
                <p className="text-sm text-gray-500">{p.name}</p>
              </div>
              <p className="text-base font-semibold text-gray-900">
                {STATE_LABEL[p.state] ?? p.state}
              </p>
              {p.state === 'printing' && p.progress > 0 && (
                <>
                  {p.filename && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{p.filename}</p>
                  )}
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {Math.round(p.progress * 100)}%
                    {p.remaining_seconds != null && p.remaining_seconds > 0 && (
                      <> · {formatTime(p.remaining_seconds)} verbleibend</>
                    )}
                  </p>
                </>
              )}
              <p className="text-xs text-blue-600 mt-2">Details →</p>
            </Link>
          ))
        )}
      </div>

      {/* Schnell-Links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/drucker', icon: '🖨️', label: 'Drucker', sub: 'Status & Drucken' },
          { to: '/dateien', icon: '📁', label: 'Meine Dateien', sub: 'G-Code verwalten' },
          { to: '/drucke', icon: '📋', label: 'Meine Drucke', sub: 'Druckverlauf & Kosten' },
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
