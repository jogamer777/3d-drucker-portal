import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../lib/api'

interface ReservationInfo {
  id: number
  is_mine: boolean
  expires_at: string
  seconds_remaining: number
  minutes_remaining: number
}

interface QueueInfo {
  id: number
  position: number
  status: 'waiting' | 'notified' | 'skipped'
  notified_at: string | null
}

interface PrinterStatus {
  id: string
  name: string
  online: boolean
  state: 'idle' | 'printing' | 'paused' | 'error' | 'complete' | 'offline' | 'pending_setup'
  filename: string | null
  progress: number
  elapsed_seconds: number
  remaining_seconds: number | null
  temp_hotend: number
  temp_hotend_target: number
  temp_bed: number
  temp_bed_target: number
  webcam_path: string | null
  reservation: ReservationInfo | null
  queue_count: number
  my_queue: QueueInfo | null
}

const STATE_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  idle:          { label: 'Bereit',            dot: 'bg-green-500',  text: 'text-green-700' },
  printing:      { label: 'Druckt',            dot: 'bg-blue-500',   text: 'text-blue-700' },
  paused:        { label: 'Pausiert',          dot: 'bg-yellow-500', text: 'text-yellow-700' },
  error:         { label: 'Fehler',            dot: 'bg-red-500',    text: 'text-red-700' },
  complete:      { label: 'Abgeschlossen',     dot: 'bg-green-400',  text: 'text-green-600' },
  offline:       { label: 'Offline',           dot: 'bg-gray-400',   text: 'text-gray-500' },
  pending_setup: { label: 'Einrichtung läuft', dot: 'bg-gray-300',   text: 'text-gray-500' },
}

const formatSecs = (s: number) => {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Countdown-Hook ─────────────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!expiresAt) { setSecs(0); return }
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecs(diff)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  return secs
}

// ── PrinterCard ────────────────────────────────────────────────────────────────
function PrinterCard({ p, onRefresh }: { p: PrinterStatus; onRefresh: () => void }) {
  const cfg = STATE_CONFIG[p.state] ?? STATE_CONFIG.offline
  const showProgress = p.online && ['printing', 'paused'].includes(p.state)
  const showTemps = p.online && p.state !== 'pending_setup'
  const pct = Math.round(p.progress * 100)

  const [showReserveModal, setShowReserveModal] = useState(false)
  const [reserving, setReserving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  const secsLeft = useCountdown(p.reservation?.expires_at ?? null)
  const isExpiringSoon = p.reservation?.is_mine && secsLeft > 0 && secsLeft <= 120

  // "Du bist dran!" Modal
  const notified = p.my_queue?.status === 'notified'

  const reserve = async (minutes: 15 | 30) => {
    setReserving(true)
    setError('')
    try {
      await api.post('/reservations', { printer_id: p.id, duration_minutes: minutes })
      onRefresh()
      setShowReserveModal(false)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler beim Reservieren')
    } finally {
      setReserving(false)
    }
  }

  const cancelReservation = async () => {
    if (!p.reservation) return
    setActionLoading(true)
    try {
      await api.delete(`/reservations/${p.reservation.id}`)
      onRefresh()
    } catch {}
    setActionLoading(false)
  }

  const joinQueue = async () => {
    setActionLoading(true)
    setError('')
    try {
      await api.post(`/queue/${p.id}`)
      onRefresh()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setActionLoading(false)
    }
  }

  const leaveQueue = async () => {
    setActionLoading(true)
    try {
      await api.delete(`/queue/${p.id}`)
      onRefresh()
    } catch {}
    setActionLoading(false)
  }

  const acknowledgeQueue = async () => {
    setActionLoading(true)
    try {
      await api.post(`/queue/${p.id}/acknowledge`)
      onRefresh()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setActionLoading(false)
    }
  }

  const canReserve = p.online && !p.reservation && !p.my_queue &&
    ['idle', 'complete'].includes(p.state)

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 2-Min-Warnung */}
        {isExpiringSoon && (
          <div className="bg-orange-50 border-b border-orange-200 px-5 py-2 flex items-center gap-2">
            <span className="text-orange-500">⚠</span>
            <p className="text-xs font-medium text-orange-700">
              Reservierung läuft in {formatSecs(secsLeft)} ab!
            </p>
          </div>
        )}

        {/* "Du bist dran!" Banner */}
        {notified && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔔</span>
              <p className="text-sm font-semibold text-blue-800">Du bist dran!</p>
            </div>
            <p className="text-xs text-blue-600">
              Bestätige innerhalb von 5 Minuten, sonst wirst du übersprungen.
            </p>
            <div className="flex gap-2">
              <button
                onClick={acknowledgeQueue}
                disabled={actionLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg"
              >
                Reservierung annehmen
              </button>
              <button
                onClick={leaveQueue}
                disabled={actionLoading}
                className="text-xs text-gray-500 hover:text-gray-700 px-2"
              >
                Überspringen
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 className="font-semibold text-gray-900">{p.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
            </div>
          </div>
          {showTemps && (
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              <p>
                Hotend{' '}
                <span className="font-medium text-gray-800">{p.temp_hotend}°C</span>
                {p.temp_hotend_target > 0 && (
                  <span className="text-gray-400"> / {p.temp_hotend_target}°C</span>
                )}
              </p>
              <p>
                Bett{' '}
                <span className="font-medium text-gray-800">{p.temp_bed}°C</span>
                {p.temp_bed_target > 0 && (
                  <span className="text-gray-400"> / {p.temp_bed_target}°C</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Webcam */}
        {p.webcam_path && p.online && (
          <div className="bg-black aspect-video w-full overflow-hidden">
            <img
              src={p.webcam_path}
              alt={`${p.name} Webcam`}
              className="w-full h-full object-contain"
            />
          </div>
        )}
        {!p.webcam_path && p.online && p.state !== 'pending_setup' && (
          <div className="bg-gray-100 aspect-video w-full flex items-center justify-center">
            <p className="text-sm text-gray-400">Kein Webcam konfiguriert</p>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Druckfortschritt */}
          {showProgress && (
            <div>
              {p.filename && (
                <p className="text-sm text-gray-700 font-medium truncate mb-2">{p.filename}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{pct}%</span>
                <span>
                  {p.elapsed_seconds > 0 && <>{formatTime(p.elapsed_seconds)} vergangen</>}
                  {p.remaining_seconds != null && p.remaining_seconds > 0 && (
                    <> · {formatTime(p.remaining_seconds)} verbleibend</>
                  )}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {p.state === 'complete' && p.filename && (
            <p className="text-sm text-gray-600">
              Druck abgeschlossen: <span className="font-medium">{p.filename}</span>
            </p>
          )}
          {p.state === 'offline' && (
            <p className="text-sm text-gray-400">Drucker nicht erreichbar.</p>
          )}
          {p.state === 'pending_setup' && (
            <div className="text-sm text-gray-500 space-y-1">
              <p>OctoPrint noch nicht eingerichtet.</p>
              <p className="text-xs text-gray-400">Nach dem aktuellen Druck OctoPrint-Setup starten.</p>
            </div>
          )}

          {/* Reservierungs-Status */}
          {p.reservation && (
            <div className={`rounded-lg px-3 py-2 text-xs ${p.reservation.is_mine ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
              {p.reservation.is_mine ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-green-800">Deine Reservierung</p>
                    <p className="text-green-600 font-mono text-sm mt-0.5">{formatSecs(secsLeft)}</p>
                  </div>
                  <button
                    onClick={cancelReservation}
                    disabled={actionLoading}
                    className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Freigeben
                  </button>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-blue-800">Reserviert</p>
                  <p className="text-blue-600 mt-0.5">Noch {formatSecs(secsLeft)}</p>
                </div>
              )}
            </div>
          )}

          {/* Warteschlange */}
          {p.queue_count > 0 && (
            <p className="text-xs text-gray-500">
              {p.queue_count} {p.queue_count === 1 ? 'Person' : 'Personen'} in der Warteschlange
            </p>
          )}

          {/* Eigene Queue-Position (waiting) */}
          {p.my_queue && p.my_queue.status === 'waiting' && (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <p className="text-xs text-gray-700">
                <span className="font-medium">Position {p.my_queue.position}</span> in der Warteschlange
              </p>
              <button
                onClick={leaveQueue}
                disabled={actionLoading}
                className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                Verlassen
              </button>
            </div>
          )}

          {/* Fehler */}
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          {/* Aktions-Buttons */}
          <div className="flex gap-2 pt-1">
            {canReserve && (
              <button
                onClick={() => { setShowReserveModal(true); setError('') }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg"
              >
                Reservieren
              </button>
            )}
            {p.reservation && !p.reservation.is_mine && !p.my_queue && (
              <button
                onClick={joinQueue}
                disabled={actionLoading}
                className="flex-1 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium py-2 rounded-lg disabled:opacity-50"
              >
                In Warteschlange
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reservieren-Modal */}
      {showReserveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">
              {p.name} reservieren
            </h3>
            <p className="text-sm text-gray-500 mb-5">Wie lange möchtest du reservieren?</p>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="space-y-2 mb-4">
              <button
                onClick={() => reserve(15)}
                disabled={reserving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm"
              >
                15 Minuten
              </button>
              <button
                onClick={() => reserve(30)}
                disabled={reserving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm"
              >
                30 Minuten
              </button>
            </div>
            <button
              onClick={() => setShowReserveModal(false)}
              className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function Printers() {
  const [printers, setPrinters] = useState<PrinterStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/printers')
      setPrinters(r.data)
      setLastUpdate(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Drucker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live-Status aller 3D-Drucker</p>
        </div>
        {lastUpdate && (
          <p className="text-xs text-gray-400">
            Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Verbinde mit Druckern...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {printers.map(p => (
            <PrinterCard key={p.id} p={p} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  )
}
