import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface OccupationInfo {
  id: number
  is_mine: boolean
  status: 'occupied' | 'awaiting_pickup'
  pickup_deadline: string | null
  pickup_seconds_remaining: number
  user_display: string
  user_email: string | null
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
  layer: number | null
  layer_count: number | null
  z_pos: number
  filament_used_mm: number
  estimated_end_time: number | null
  filament_type: string | null
  occupation: OccupationInfo | null
  queue_count: number
  my_queue: QueueInfo | null
  external_print: boolean
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

const formatCountdownHM = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

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

function useEtaCountdown(unixTs: number | null): number {
  const [secs, setSecs] = useState(() =>
    unixTs ? Math.max(0, Math.floor(unixTs - Date.now() / 1000)) : 0
  )
  useEffect(() => {
    if (!unixTs) { setSecs(0); return }
    const calc = () => setSecs(Math.max(0, Math.floor(unixTs - Date.now() / 1000)))
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [unixTs])
  return secs
}

// ── WebRTC Webcam Komponente ───────────────────────────────────────────────────
function WebRtcStream({ signalingUrl }: { signalingUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [state, setState] = useState<'connecting' | 'connected' | 'error'>('connecting')

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    pcRef.current = pc

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0]
        setState('connected')
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setState('error')
      }
    }

    pc.addTransceiver('video', { direction: 'sendrecv' })

    pc.onicecandidate = (event) => {
      if (event.candidate !== null) return  // noch nicht alle gesammelt
      // Alle ICE-Kandidaten gesammelt → Offer per POST senden
      const offerPayload = btoa(JSON.stringify({
        type: 'offer',
        sdp: pc.localDescription!.sdp,
      }))
      api.post(signalingUrl, offerPayload, {
        headers: { 'Content-Type': 'plain/text' },
        transformRequest: [(d: string) => d],
      })
        .then((r) => {
          const answer = JSON.parse(atob(typeof r.data === 'string' ? r.data : JSON.stringify(r.data)))
          if (answer.type === 'answer') {
            return pc.setRemoteDescription(new RTCSessionDescription(answer))
          }
        })
        .catch(() => setState('error'))
    }

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => setState('error'))

    return () => {
      pc.close()
      pcRef.current = null
    }
  }, [signalingUrl])

  if (state === 'error') {
    return (
      <div className="bg-gray-100 aspect-video w-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Webcam nicht verfügbar</p>
      </div>
    )
  }

  return (
    <div className="bg-black aspect-video w-full overflow-hidden relative">
      {state === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-gray-400">Verbinde Webcam...</p>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function PrinterDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'power_user'

  const [printer, setPrinter] = useState<PrinterStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/printers/${id}`)
      setPrinter(r.data)
    } catch (e: any) {
      if (e.response?.status === 404) setNotFound(true)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 3_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  const pickupSecs = useCountdown(printer?.occupation?.pickup_deadline ?? null)
  const etaSecs = useEtaCountdown(printer?.estimated_end_time ?? null)

  const doAction = async (fn: () => Promise<void>) => {
    setActionError('')
    setActionLoading(true)
    try {
      await fn()
      await load()
    } catch (e: any) {
      setActionError(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setActionLoading(false)
    }
  }

  const control = (action: string) => doAction(() => api.post(`/printers/${id}/control`, { action }))
  const claim = () => doAction(() => api.post(`/printers/${id}/claim`))
  const release = () => doAction(() => api.post(`/printers/${id}/release`))
  const joinQueue = () => doAction(() => api.post(`/queue/${id}`))
  const leaveQueue = () => doAction(() => api.delete(`/queue/${id}`))
  const acknowledge = () => doAction(() => api.post(`/queue/${id}/acknowledge`))

  if (loading) return (
    <div className="text-sm text-gray-400 py-12 text-center">Verbinde mit Drucker...</div>
  )
  if (notFound) return (
    <div className="text-center py-12">
      <p className="text-gray-500">Drucker nicht gefunden.</p>
      <button onClick={() => navigate('/drucker')} className="mt-4 text-sm text-blue-600 hover:underline">
        Zurück zur Übersicht
      </button>
    </div>
  )
  if (!printer) return null

  const p = printer
  const cfg = STATE_CONFIG[p.state] ?? STATE_CONFIG.offline
  const pct = Math.round(p.progress * 100)
  const showProgress = p.online && ['printing', 'paused'].includes(p.state)

  const iAmOccupying = !!p.occupation?.is_mine
  const iAmAwaiting = iAmOccupying && p.occupation?.status === 'awaiting_pickup'
  const notified = p.my_queue?.status === 'notified'
  const canSeeDetails = isAdmin || iAmOccupying
  const canClaim = p.online && !p.occupation && !p.my_queue && ['idle', 'complete'].includes(p.state)
  const canClaimAfterNotified = notified && !p.occupation
  const canQueue = ((!!p.occupation && !p.occupation.is_mine) || p.external_print) && !p.my_queue

  // ETA Anzeige
  let etaTimeStr: string | null = null
  if (p.estimated_end_time) {
    const eta = new Date(p.estimated_end_time * 1000)
    etaTimeStr = eta.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const filamentM = p.filament_used_mm > 0 ? (p.filament_used_mm / 1000).toFixed(2) : null

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/drucker')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        ← Zurück zur Übersicht
      </button>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Externer Druck Banner */}
        {p.external_print && (
          <div className="bg-orange-50 border-b border-orange-200 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-semibold text-orange-800">Außerhalb Portal gestartet</p>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Dieser Druck wurde nicht über das Portal gestartet und ist keinem Nutzer zugeordnet.
            </p>
          </div>
        )}

        {/* "Du bist dran!" Banner */}
        {notified && (
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <p className="text-sm font-semibold text-blue-800">Du bist dran!</p>
            </div>
            <p className="text-xs text-blue-600">Du hast 5 Minuten um den Drucker zu beanspruchen.</p>
            <div className="flex gap-2">
              {canClaimAfterNotified && (
                <button onClick={claim} disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
                  Drucker beanspruchen
                </button>
              )}
              <button onClick={acknowledge} disabled={actionLoading}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg">
                Überspringen
              </button>
            </div>
          </div>
        )}

        {/* Abholen-Banner */}
        {iAmAwaiting && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-5 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📦</span>
                <p className="text-sm font-semibold text-yellow-800">Druck fertig – bitte abholen!</p>
              </div>
              {pickupSecs > 0 && (
                <span className="text-sm font-mono text-yellow-700">{formatCountdownHM(pickupSecs)}</span>
              )}
            </div>
            <button onClick={release} disabled={actionLoading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
              Drucker freigeben (Druck abgeholt)
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{p.name}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
              {iAmOccupying && !iAmAwaiting && (
                <span className="ml-1 text-sm text-blue-600 font-medium">· Du benutzt diesen Drucker</span>
              )}
            </div>
          </div>
        </div>

        {/* Webcam – WebRTC */}
        {p.webcam_path && p.online && p.state !== 'pending_setup' && (
          <WebRtcStream signalingUrl={p.webcam_path} />
        )}
        {!p.webcam_path && p.online && p.state !== 'pending_setup' && (
          <div className="bg-gray-100 aspect-video w-full flex items-center justify-center">
            <p className="text-sm text-gray-400">Kein Webcam konfiguriert</p>
          </div>
        )}

        <div className="px-5 py-5 space-y-4">

          {/* Fortschritt + ETA */}
          {showProgress && (
            <div>
              {p.occupation && !p.occupation.is_mine && (
                <p className="text-sm text-gray-600 mb-2">
                  Druckt für: <span className="font-medium text-gray-900">
                    {isAdmin ? p.occupation.user_email : p.occupation.user_display}
                  </span>
                </p>
              )}
              {p.external_print && (
                <p className="text-sm text-gray-600 mb-2">Außerhalb Portal gestartet</p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span className="text-base font-semibold text-gray-900">{pct}%</span>
                <div className="text-right">
                  {etaTimeStr && (
                    <span className="font-medium text-gray-800">Fertig um {etaTimeStr}</span>
                  )}
                  {etaSecs > 0 && (
                    <span className="text-gray-400 ml-1">(noch {formatCountdownHM(etaSecs)})</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="bg-blue-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Admin/Owner-Controls */}
          {(isAdmin || iAmOccupying) && showProgress && (
            <div className="flex gap-2 flex-wrap">
              {p.state === 'printing' && (
                <button onClick={() => control('pause')} disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium border border-yellow-300 text-yellow-700 hover:bg-yellow-50 rounded-lg disabled:opacity-50">
                  Pausieren
                </button>
              )}
              {p.state === 'paused' && (
                <button onClick={() => control('resume')} disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium border border-green-300 text-green-700 hover:bg-green-50 rounded-lg disabled:opacity-50">
                  Fortsetzen
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => setConfirmAction('cancel')} disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-50">
                    Abbrechen
                  </button>
                  <button onClick={() => setConfirmAction('emergency_stop')} disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
                    🛑 Notfall-Stopp
                  </button>
                </>
              )}
            </div>
          )}

          {/* Druckdetails – nur Admin/Owner */}
          {canSeeDetails && (showProgress || p.state === 'complete') && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-100">
              {p.filename && (
                <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500 shrink-0">Datei</span>
                  <span className="text-xs font-medium text-gray-800 truncate text-right">{p.filename}</span>
                </div>
              )}
              {p.layer != null && p.layer_count != null && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Layer</span>
                  <span className="text-xs font-medium text-gray-800">{p.layer} / {p.layer_count}</span>
                </div>
              )}
              {p.z_pos > 0 && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Z-Position</span>
                  <span className="text-xs font-medium text-gray-800">{p.z_pos} mm</span>
                </div>
              )}
              {filamentM && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Filament verbraucht</span>
                  <span className="text-xs font-medium text-gray-800">
                    {filamentM} m{p.filament_type ? ` · ${p.filament_type}` : ''}
                  </span>
                </div>
              )}
              {p.elapsed_seconds > 0 && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Laufzeit</span>
                  <span className="text-xs font-medium text-gray-800">{formatTime(p.elapsed_seconds)}</span>
                </div>
              )}
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-500">Hotend</span>
                <span className="text-xs font-medium text-gray-800">
                  {p.temp_hotend}°C
                  {p.temp_hotend_target > 0 && <span className="text-gray-400"> / {p.temp_hotend_target}°C</span>}
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-500">Bett</span>
                <span className="text-xs font-medium text-gray-800">
                  {p.temp_bed}°C
                  {p.temp_bed_target > 0 && <span className="text-gray-400"> / {p.temp_bed_target}°C</span>}
                </span>
              </div>
            </div>
          )}

          {/* Belegung von anderem Nutzer */}
          {p.occupation && !p.occupation.is_mine && !showProgress && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
              <p className="font-medium text-gray-800">Drucker belegt</p>
              <p className="text-gray-500 mt-0.5">
                von {isAdmin ? p.occupation.user_email : p.occupation.user_display}
                {p.occupation.status === 'awaiting_pickup' && ' · wartet auf Abholung'}
              </p>
            </div>
          )}

          {p.state === 'offline' && <p className="text-sm text-gray-400">Drucker nicht erreichbar.</p>}

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
              <button onClick={leaveQueue} disabled={actionLoading}
                className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
                Verlassen
              </button>
            </div>
          )}

          {actionError && <p className="text-xs text-red-600">{actionError}</p>}

          {/* Aktions-Buttons */}
          <div className="flex gap-2 pt-1">
            {canClaim && !notified && (
              <button onClick={claim} disabled={actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
                Drucker beanspruchen
              </button>
            )}
            {iAmOccupying && !iAmAwaiting && (
              <button onClick={release} disabled={actionLoading}
                className="flex-1 border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium py-2 rounded-lg disabled:opacity-50">
                Drucker freigeben
              </button>
            )}
            {canQueue && (
              <button onClick={joinQueue} disabled={actionLoading}
                className="flex-1 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium py-2 rounded-lg disabled:opacity-50">
                In Warteschlange einreihen
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Bestätigungs-Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">
              {confirmAction === 'emergency_stop' ? '🛑 Notfall-Stopp bestätigen' : 'Druck abbrechen?'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {confirmAction === 'emergency_stop'
                ? 'Der Drucker wird sofort gestoppt. Alle Bewegungen werden abgebrochen.'
                : 'Der aktuelle Druck wird abgebrochen. Das Modell muss neu gestartet werden.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { const a = confirmAction; setConfirmAction(null); control(a) }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg"
              >
                Ja, ausführen
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium py-2 rounded-lg"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
