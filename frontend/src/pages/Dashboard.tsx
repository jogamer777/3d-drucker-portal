import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore, formatBalance } from '../stores/authStore'
import api from '../lib/api'
import StatusDot from '../components/StatusDot'

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
  webcam_path?: string | null
  queue_count?: number
  my_queue_position?: number | null
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

function PrinterCardLarge({ p }: { p: PrinterStatus }) {
  const pct = Math.round(p.progress * 100)
  const isPrinting = p.state === 'printing'

  return (
    <Link
      to={`/drucker/${p.id}`}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#1a1a1a',
        border: '0.5px solid var(--border)',
        display: 'block',
        textDecoration: 'none',
        minHeight: 200,
        aspectRatio: '2.2 / 1',
      }}
    >
      {/* Webcam or grid bg */}
      {p.webcam_path ? (
        <img
          src={p.webcam_path}
          alt="Webcam"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.4,
        }} />
      )}

      {/* Gradient overlay */}
      <div className="webcam-overlay" style={{ position: 'absolute', inset: 0 }} />

      {/* LIVE badge */}
      {isPrinting && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'var(--red)',
          color: '#fff',
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: '0.04em',
        }}>
          <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
          LIVE
        </div>
      )}

      {/* Top-left info */}
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <StatusDot state={p.state} size={8} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'var(--mono)' }}>
            {STATE_LABEL[p.state] ?? p.state}
          </span>
        </div>
        <p style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
          {p.name}
        </p>
        {isPrinting && p.filename && (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'var(--mono)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.filename}
          </p>
        )}
      </div>

      {/* Percent bottom-right */}
      {isPrinting && pct > 0 && (
        <div style={{ position: 'absolute', bottom: 14, right: 14 }}>
          <span style={{ fontSize: 52, fontWeight: 900, color: 'var(--lime)', lineHeight: 1, letterSpacing: '-0.04em', fontFamily: 'var(--mono)' }}>
            {pct}%
          </span>
        </div>
      )}

      {/* ETA bottom-left */}
      {isPrinting && p.remaining_seconds != null && p.remaining_seconds > 0 && (
        <div style={{ position: 'absolute', bottom: 20, left: 14 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'var(--mono)' }}>
            noch {formatTime(p.remaining_seconds)}
          </span>
        </div>
      )}

      {/* Idle: Jetzt drucken button */}
      {p.state === 'idle' && (
        <div style={{ position: 'absolute', bottom: 14, left: 14 }}>
          <span style={{
            background: 'var(--lime)',
            color: '#111',
            fontWeight: 800,
            fontSize: 13,
            borderRadius: 8,
            padding: '6px 14px',
          }}>
            Jetzt drucken →
          </span>
        </div>
      )}

      {/* Progress bar at bottom */}
      {isPrinting && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--lime)', transition: 'width 0.5s' }} />
        </div>
      )}
    </Link>
  )
}

function PrinterCardSmall({ p }: { p: PrinterStatus }) {
  const pct = Math.round(p.progress * 100)
  const isPrinting = p.state === 'printing'

  return (
    <Link
      to={`/drucker/${p.id}`}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#1a1a1a',
        border: '0.5px solid var(--border)',
        display: 'block',
        textDecoration: 'none',
        minHeight: 160,
      }}
    >
      {p.webcam_path ? (
        <img
          src={p.webcam_path}
          alt="Webcam"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.4,
        }} />
      )}
      <div className="webcam-overlay" style={{ position: 'absolute', inset: 0 }} />

      {isPrinting && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--red)', color: '#fff', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
          LIVE
        </div>
      )}

      <div style={{ position: 'absolute', top: 12, left: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <StatusDot state={p.state} size={7} />
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: 'var(--mono)' }}>
            {STATE_LABEL[p.state] ?? p.state}
          </span>
        </div>
        <p style={{ color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          {p.name}
        </p>
      </div>

      {isPrinting && pct > 0 && (
        <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--lime)', lineHeight: 1, fontFamily: 'var(--mono)' }}>
            {pct}%
          </span>
        </div>
      )}

      {p.state === 'idle' && (
        <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
          <span style={{ background: 'var(--lime)', color: '#111', fontWeight: 800, fontSize: 11, borderRadius: 6, padding: '4px 10px' }}>
            Jetzt drucken →
          </span>
        </div>
      )}

      {isPrinting && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--lime)', transition: 'width 0.5s' }} />
        </div>
      )}
    </Link>
  )
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
    try { await api.patch(`/user/messages/${msg.id}/read`) } catch {}
    advanceOrClose()
  }

  const sendReply = async (msg: UserMessage) => {
    if (!reply.trim()) return
    setSending(true)
    try { await api.post(`/user/messages/${msg.id}/reply`, { reply: reply.trim() }) } catch {}
    setSending(false)
    advanceOrClose()
  }

  const advanceOrClose = () => {
    const next = msgIndex + 1
    if (next < messages.length) { setMsgIndex(next); setReply('') }
    else setMessages([])
  }

  const [p1, p2, ...rest] = printers
  const hasQueue = printers.some(p => (p.queue_count ?? 0) > 0 || p.my_queue_position != null)

  return (
    <div>
      {/* Heading */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Dashboard</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0 0' }}>
          Willkommen zurück, {user?.email}
        </p>
      </div>

      {/* Bento Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 12, marginBottom: 12 }}
           className="grid-cols-1 md:grid-cols-[1fr_1fr_300px]">

        {/* Printer 1 — large (col-span-2) */}
        <div style={{ gridColumn: 'span 2' }} className="col-span-1 md:col-span-2">
          {p1 ? (
            <PrinterCardLarge p={p1} />
          ) : (
            <div style={{ borderRadius: 16, background: '#fff', border: '0.5px solid var(--border)', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text3)', fontSize: 14 }}>Verbinde mit Druckern...</p>
            </div>
          )}
        </div>

        {/* Queue sidebar — spans 2 rows */}
        <div style={{ gridRow: 'span 2', borderRadius: 16, background: '#fff', border: '0.5px solid var(--border)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
             className="hidden md:flex">
          <p style={{ fontSize: 13, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Warteschlange</p>

          {printers.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Lade...</p>
          ) : printers.map(p => (
            <div
              key={p.id}
              style={{
                borderRadius: 10,
                border: '0.5px solid var(--border)',
                padding: '10px 12px',
                background: p.my_queue_position != null ? 'var(--lime-bg)' : 'var(--surface2)',
                borderColor: p.my_queue_position != null ? 'var(--lime)' : 'var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <StatusDot state={p.state} size={7} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
              </div>
              {p.my_queue_position != null ? (
                <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0, fontFamily: 'var(--mono)' }}>
                  Deine Position: #{p.my_queue_position}
                </p>
              ) : (p.queue_count ?? 0) > 0 ? (
                <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0, fontFamily: 'var(--mono)' }}>
                  {p.queue_count} in Warteschlange
                </p>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>Keine Warteschlange</p>
              )}
            </div>
          ))}

          {/* Balance quick-card */}
          <div style={{ marginTop: 'auto', borderRadius: 12, background: 'var(--surface2)', padding: '12px 14px' }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 2px' }}>Guthaben</p>
            <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
              {user ? formatBalance(user.balance_cents) : '–'}
            </p>
            <Link to="/guthaben" style={{ fontSize: 11, color: 'var(--lime-dark)', fontWeight: 700, textDecoration: 'none' }}>
              Code einlösen →
            </Link>
          </div>
        </div>

        {/* Printer 2 — small */}
        <div>
          {p2 ? (
            <PrinterCardSmall p={p2} />
          ) : (
            <div style={{ borderRadius: 16, background: '#fff', border: '0.5px solid var(--border)', minHeight: 160 }} />
          )}
        </div>

        {/* Additional printers */}
        {rest.map(p => (
          <div key={p.id}>
            <PrinterCardSmall p={p} />
          </div>
        ))}
      </div>

      {/* Mobile balance + queue (shown on mobile only) */}
      <div className="md:hidden" style={{ marginBottom: 12 }}>
        <Link to="/guthaben" style={{
          display: 'block',
          borderRadius: 14,
          background: '#fff',
          border: '0.5px solid var(--border)',
          padding: '14px 16px',
          textDecoration: 'none',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 2px' }}>Guthaben</p>
          <p style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: 'var(--text)' }}>
            {user ? formatBalance(user.balance_cents) : '–'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--lime-dark)', fontWeight: 700, marginTop: 4 }}>Code einlösen →</p>
        </Link>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { to: '/dateien',  label: 'Dateien',    sub: 'G-Code verwalten'      },
          { to: '/drucke',   label: 'Druckverlauf', sub: 'Kosten & Geschichte' },
          { to: '/guthaben', label: 'Guthaben',   sub: 'Aufladen & Verlauf'    },
          ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', sub: 'Verwaltung' }] : []),
        ].map(item => (
          <Link
            key={item.to}
            to={item.to}
            style={{
              display: 'block',
              borderRadius: 14,
              background: '#fff',
              border: '0.5px solid var(--border)',
              padding: '14px 14px 12px',
              textDecoration: 'none',
              transition: 'border-color 0.15s',
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{item.label}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '3px 0 0' }}>{item.sub}</p>
          </Link>
        ))}
      </div>

      {/* Admin-Nachrichten Modal */}
      {currentMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, border: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--text)" strokeWidth="1.5"><rect x="2" y="4" width="16" height="13" rx="2" /><path d="m2 7 8 5 8-5" /></svg>
              <h3 style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Nachricht vom Administrator</h3>
            </div>
            {currentMsg.from_admin_email && (
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>von {currentMsg.from_admin_email}</p>
            )}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {currentMsg.body}
            </div>

            {currentMsg.reply === null && (
              <>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Antwort (optional):</p>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Ihre Antwort..."
                  rows={3}
                  style={{ width: '100%', border: '0.5px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = 'var(--lime-dark)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </>
            )}

            {messages.length > 1 && (
              <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginBottom: 12 }}>
                Nachricht {msgIndex + 1} von {messages.length}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => closeMessage(currentMsg)}
                style={{ flex: 1, border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}
              >
                Schließen
              </button>
              {currentMsg.reply === null && (
                <button
                  onClick={() => sendReply(currentMsg)}
                  disabled={!reply.trim() || sending}
                  className="btn-lime"
                  style={{ flex: 1, padding: '10px', fontSize: 14 }}
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
