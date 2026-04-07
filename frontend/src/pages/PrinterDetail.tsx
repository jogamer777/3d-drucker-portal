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
  file_id?: number | null
  estimated_cost_cents?: number | null
  charged_cost_cents?: number | null
}

interface GCodeFileInfo {
  id: number
  filename: string
  duration_seconds: number | null
  filament_usage: string | null
  thumbnail_b64: string | null
  size_bytes: number
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

const RATE_PER_HOUR_CENTS = 20
const RATE_PER_GRAM_CENTS = 5

function parseFilamentGrams(s: string | null): number {
  if (!s) return 0
  try {
    const d = JSON.parse(s)
    return Object.entries(d)
      .filter(([k]) => k !== 'flush')
      .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0)
  } catch { return 0 }
}

function estimateCost(dur: number | null, grams: number): number {
  let cost = 0
  if (dur && dur > 0) cost += Math.floor((dur / 3600) * RATE_PER_HOUR_CENTS)
  cost += Math.floor(grams * RATE_PER_GRAM_CENTS)
  return cost
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—'
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`
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


// ── Start Print Modal ──────────────────────────────────────────────────────────
function StartPrintModal({
  printerId,
  userBalanceCents,
  onClose,
  onStarted,
}: {
  printerId: string
  userBalanceCents: number
  onClose: () => void
  onStarted: () => void
}) {
  const [files, setFiles] = useState<GCodeFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GCodeFileInfo | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/files').then(r => setFiles(r.data)).catch(() => setError('Dateien konnten nicht geladen werden.')).finally(() => setLoading(false))
  }, [])

  const doStart = async () => {
    if (!selected) return
    setStarting(true)
    setError('')
    try {
      await api.post(`/printers/${printerId}/start`, { file_id: selected.id })
      onStarted()
    } catch (e: any) {
      const detail = e.response?.data?.detail ?? 'Fehler beim Starten'
      setError(detail)
    } finally {
      setStarting(false)
    }
  }

  const selectedGrams = selected ? parseFilamentGrams(selected.filament_usage) : 0
  const selectedCost = selected ? estimateCost(selected.duration_seconds, selectedGrams) : 0
  const canAfford = userBalanceCents >= selectedCost

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Druck starten</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {loading && <div className="p-6 text-center text-sm text-gray-400">Lade Dateien...</div>}
        {!loading && files.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            Keine G-Code-Dateien vorhanden.<br />
            <a href="/dateien" className="text-blue-600 hover:underline text-xs mt-1 inline-block">Dateien hochladen →</a>
          </div>
        )}

        {!loading && files.length > 0 && (
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {files.map(f => {
              const grams = parseFilamentGrams(f.filament_usage)
              const cost = estimateCost(f.duration_seconds, grams)
              const isSelected = selected?.id === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setSelected(isSelected ? null : f)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                >
                  {f.thumbnail_b64 ? (
                    <img src={f.thumbnail_b64} alt="" className="w-12 h-12 object-cover rounded shrink-0 border border-gray-200" />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-xl">◻</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{f.filename}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDuration(f.duration_seconds)}
                      {grams > 0 && <span> · {grams.toFixed(1)} g</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${cost === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                      {cost === 0 ? 'kostenlos' : `${(cost / 100).toFixed(2)} €`}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          {selected && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Ausgewählt:</span>
                <span className="font-medium text-gray-900 truncate max-w-[200px]">{selected.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Kosten:</span>
                <span className="font-medium text-gray-900">{selectedCost === 0 ? 'kostenlos' : `${(selectedCost / 100).toFixed(2)} €`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guthaben danach:</span>
                <span className={`font-medium ${canAfford ? 'text-gray-900' : 'text-red-600'}`}>
                  {((userBalanceCents - selectedCost) / 100).toFixed(2)} €
                </span>
              </div>
            </div>
          )}

          {selected && !canAfford && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
              Guthaben zu gering. Bitte Gutschein einlösen.
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={doStart}
            disabled={!selected || starting || !canAfford}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {starting ? 'Startet...' : 'Druck starten'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Webcam Komponente (MJPEG) ─────────────────────────────────────────────────
function WebcamView({ src, name }: { src: string; name: string }) {
  const [error, setError] = useState(false)
  if (error) return (
    <div className="bg-gray-100 aspect-video w-full flex items-center justify-center">
      <p className="text-sm text-gray-400">Webcam nicht verfügbar</p>
    </div>
  )
  return (
    <div className="bg-black aspect-video w-full overflow-hidden">
      <img
        src={src}
        alt={`${name} Webcam`}
        className="w-full h-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function PrinterDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, setAuth, accessToken } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'power_user'

  const [printer, setPrinter] = useState<PrinterStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)
  const [lastMaintenance, setLastMaintenance] = useState<{ action: string; notes: string | null; created_at: string } | null>(null)
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
    // Letzte Wartung einmalig laden
    api.get(`/printers/${id}/maintenance/last`).then(r => setLastMaintenance(r.data)).catch(() => {})
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

        {/* Webcam – MJPEG via go2rtc */}
        {p.webcam_path && p.online && p.state !== 'pending_setup' && (
          <WebcamView src={p.webcam_path} name={p.name} />
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
          <div className="flex gap-2 pt-1 flex-wrap">
            {canClaim && !notified && (
              <button onClick={claim} disabled={actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
                Drucker beanspruchen
              </button>
            )}
            {iAmOccupying && !iAmAwaiting && !['printing', 'paused'].includes(p.state) && (
              <button onClick={() => setShowStartModal(true)} disabled={actionLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
                Druck starten
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

      {/* Letzte Wartung */}
      {lastMaintenance && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">🔧</span>
          <div>
            <p className="text-xs font-medium text-gray-500">Letzte Wartung</p>
            <p className="text-sm text-gray-800 font-medium">{lastMaintenance.action}</p>
            {lastMaintenance.notes && (
              <p className="text-xs text-gray-500">{lastMaintenance.notes}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(lastMaintenance.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}

      {/* Druck-Start-Modal */}
      {showStartModal && (
        <StartPrintModal
          printerId={id!}
          userBalanceCents={user?.balance_cents ?? 0}
          onClose={() => setShowStartModal(false)}
          onStarted={async () => {
            setShowStartModal(false)
            load()
            // Guthaben im Store aktualisieren
            try {
              const r = await api.get('/user/me')
              if (accessToken && user) setAuth(accessToken, r.data)
            } catch {}
          }}
        />
      )}

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
