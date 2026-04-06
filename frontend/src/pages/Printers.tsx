import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../lib/api'

interface OccupationInfo {
  id: number
  is_mine: boolean
  status: 'occupied' | 'awaiting_pickup'
  pickup_deadline: string | null
  pickup_seconds_remaining: number
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
  occupation: OccupationInfo | null
  queue_count: number
  my_queue: QueueInfo | null
}

const STATE_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  idle:          { label: 'Bereit',            dot: 'bg-green-500',  text: 'text-green-700' },
  printing:      { label: 'Druckt',            dot: 'bg-blue-500',   text: 'text-blue-700' },
  paused:        { label: 'Pausiert',          dot: 'bg-yellow-500', text: 'text-yellow-700' },
  error:         { label: 'Fehler',            dot: 'bg-red-500',    text: 'text-red-700' },
  complete:      { label: 'Druck fertig',      dot: 'bg-green-400',  text: 'text-green-600' },
  offline:       { label: 'Offline',           dot: 'bg-gray-400',   text: 'text-gray-500' },
  pending_setup: { label: 'Einrichtung läuft', dot: 'bg-gray-300',   text: 'text-gray-500' },
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const formatCountdown = (s: number) => {
  if (s <= 0) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}:${String(ss).padStart(2, '0')}`
}

// Live-Countdown aus ISO-Datum
function useCountdown(isoDate: string | null): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!isoDate) { setSecs(0); return }
    const calc = () => setSecs(Math.max(0, Math.floor((new Date(isoDate).getTime() - Date.now()) / 1000)))
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [isoDate])
  return secs
}

// ── PrinterCard ────────────────────────────────────────────────────────────────
function PrinterCard({ p, onRefresh }: { p: PrinterStatus; onRefresh: () => void }) {
  const cfg = STATE_CONFIG[p.state] ?? STATE_CONFIG.offline
  const showProgress = p.online && ['printing', 'paused'].includes(p.state)
  const showTemps = p.online && p.state !== 'pending_setup'
  const pct = Math.round(p.progress * 100)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const pickupSecs = useCountdown(p.occupation?.pickup_deadline ?? null)

  const notified = p.my_queue?.status === 'notified'
  const iAmOccupying = !!p.occupation?.is_mine
  const iAmAwaiting = iAmOccupying && p.occupation?.status === 'awaiting_pickup'

  // Kann beanspruchen: frei + niemand belegt + ich nicht in Queue (oder gerade notified)
  const canClaim = p.online && !p.occupation && !p.my_queue && ['idle', 'complete'].includes(p.state)
  const canClaimAfterNotified = notified && !p.occupation

  // Kann in Warteschlange: Drucker belegt, ich nicht drin, keine eigene Belegung
  const canQueue = !!p.occupation && !p.occupation.is_mine && !p.my_queue

  const doAction = async (fn: () => Promise<void>) => {
    setError('')
    setLoading(true)
    try {
      await fn()
      onRefresh()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  const claim = () => doAction(() => api.post(`/printers/${p.id}/claim`))
  const release = () => doAction(() => api.post(`/printers/${p.id}/release`))
  const joinQueue = () => doAction(() => api.post(`/queue/${p.id}`))
  const leaveQueue = () => doAction(() => api.delete(`/queue/${p.id}`))
  const acknowledge = () => doAction(() => api.post(`/queue/${p.id}/acknowledge`))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* "Du bist dran!" Banner */}
      {notified && (
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔔</span>
            <p className="text-sm font-semibold text-blue-800">Du bist dran!</p>
          </div>
          <p className="text-xs text-blue-600">
            Du hast 5 Minuten um den Drucker zu beanspruchen.
          </p>
          <div className="flex gap-2">
            {canClaimAfterNotified && (
              <button
                onClick={claim}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg"
              >
                Drucker beanspruchen
              </button>
            )}
            <button
              onClick={acknowledge}
              disabled={loading}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg"
            >
              Überspringen
            </button>
          </div>
        </div>
      )}

      {/* "Druck fertig – abholen" Banner */}
      {iAmAwaiting && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📦</span>
              <p className="text-sm font-semibold text-yellow-800">Druck fertig – bitte abholen!</p>
            </div>
            {pickupSecs > 0 && (
              <span className="text-sm font-mono text-yellow-700">{formatCountdown(pickupSecs)}</span>
            )}
          </div>
          <p className="text-xs text-yellow-600">
            Du hast 24 Stunden deinen Druck abzuholen. Danach wird der Drucker automatisch freigegeben.
          </p>
          <button
            onClick={release}
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg"
          >
            Drucker freigeben (Druck abgeholt)
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <h2 className="font-semibold text-gray-900">{p.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
            {iAmOccupying && !iAmAwaiting && (
              <span className="ml-1 text-xs text-blue-600 font-medium">· Du benutzt diesen Drucker</span>
            )}
          </div>
        </div>
        {showTemps && (
          <div className="text-right text-xs text-gray-500 space-y-0.5">
            <p>
              Hotend <span className="font-medium text-gray-800">{p.temp_hotend}°C</span>
              {p.temp_hotend_target > 0 && <span className="text-gray-400"> / {p.temp_hotend_target}°C</span>}
            </p>
            <p>
              Bett <span className="font-medium text-gray-800">{p.temp_bed}°C</span>
              {p.temp_bed_target > 0 && <span className="text-gray-400"> / {p.temp_bed_target}°C</span>}
            </p>
          </div>
        )}
      </div>

      {/* Webcam */}
      {p.webcam_path && p.online && (
        <div className="bg-black aspect-video w-full overflow-hidden">
          <img src={p.webcam_path} alt={`${p.name} Webcam`} className="w-full h-full object-contain" />
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
            {p.filename && <p className="text-sm text-gray-700 font-medium truncate mb-2">{p.filename}</p>}
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
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Offline / Einrichtung */}
        {p.state === 'offline' && <p className="text-sm text-gray-400">Drucker nicht erreichbar.</p>}
        {p.state === 'pending_setup' && (
          <div className="text-sm text-gray-500">
            <p>OctoPrint noch nicht eingerichtet.</p>
            <p className="text-xs text-gray-400 mt-0.5">Nach dem aktuellen Druck OctoPrint-Setup starten.</p>
          </div>
        )}

        {/* Belegung von anderem Nutzer */}
        {p.occupation && !p.occupation.is_mine && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
            <p className="font-medium text-gray-800">Drucker belegt</p>
            {p.occupation.status === 'awaiting_pickup' && (
              <p className="text-gray-500 mt-0.5">Druck fertig, Nutzer holt ab.</p>
            )}
          </div>
        )}

        {/* Warteschlange */}
        {p.queue_count > 0 && (
          <p className="text-xs text-gray-500">
            {p.queue_count} {p.queue_count === 1 ? 'Person' : 'Personen'} in der Warteschlange
          </p>
        )}

        {/* Eigene Queue-Position */}
        {p.my_queue && p.my_queue.status === 'waiting' && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-700">
              <span className="font-medium">Position {p.my_queue.position}</span> in der Warteschlange
            </p>
            <button onClick={leaveQueue} disabled={loading} className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
              Verlassen
            </button>
          </div>
        )}

        {/* Fehler */}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Aktions-Buttons */}
        <div className="flex gap-2 pt-1">
          {(canClaim && !notified) && (
            <button
              onClick={claim}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg"
            >
              Drucker beanspruchen
            </button>
          )}
          {iAmOccupying && !iAmAwaiting && (
            <button
              onClick={release}
              disabled={loading}
              className="flex-1 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium py-2 rounded-lg disabled:opacity-50"
            >
              Drucker freigeben
            </button>
          )}
          {canQueue && (
            <button
              onClick={joinQueue}
              disabled={loading}
              className="flex-1 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium py-2 rounded-lg disabled:opacity-50"
            >
              In Warteschlange einreihen
            </button>
          )}
        </div>
      </div>
    </div>
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Drucker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live-Status aller 3D-Drucker</p>
        </div>
        {lastUpdate && (
          <p className="text-xs text-gray-400">Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Verbinde mit Druckern...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {printers.map(p => <PrinterCard key={p.id} p={p} onRefresh={load} />)}
        </div>
      )}
    </div>
  )
}
