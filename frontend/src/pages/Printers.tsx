import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'

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
}

const STATE_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  idle:          { label: 'Bereit',             dot: 'bg-green-500',  text: 'text-green-700' },
  printing:      { label: 'Druckt',             dot: 'bg-blue-500',   text: 'text-blue-700' },
  paused:        { label: 'Pausiert',           dot: 'bg-yellow-500', text: 'text-yellow-700' },
  error:         { label: 'Fehler',             dot: 'bg-red-500',    text: 'text-red-700' },
  complete:      { label: 'Abgeschlossen',      dot: 'bg-green-400',  text: 'text-green-600' },
  offline:       { label: 'Offline',            dot: 'bg-gray-400',   text: 'text-gray-500' },
  pending_setup: { label: 'Einrichtung läuft',  dot: 'bg-gray-300',   text: 'text-gray-500' },
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function PrinterCard({ p }: { p: PrinterStatus }) {
  const cfg = STATE_CONFIG[p.state] ?? STATE_CONFIG.offline
  const showProgress = p.online && ['printing', 'paused'].includes(p.state)
  const showTemps = p.online && p.state !== 'pending_setup'
  const pct = Math.round(p.progress * 100)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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

      {/* Kein Webcam Placeholder */}
      {!p.webcam_path && p.online && p.state !== 'pending_setup' && (
        <div className="bg-gray-100 aspect-video w-full flex items-center justify-center">
          <p className="text-sm text-gray-400">Kein Webcam konfiguriert</p>
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Dateiname + Fortschritt */}
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

        {/* Abgeschlossen */}
        {p.state === 'complete' && p.filename && (
          <p className="text-sm text-gray-600">
            Druck abgeschlossen: <span className="font-medium">{p.filename}</span>
          </p>
        )}

        {/* Offline */}
        {p.state === 'offline' && (
          <p className="text-sm text-gray-400">Drucker nicht erreichbar.</p>
        )}

        {/* Einrichtung ausstehend */}
        {p.state === 'pending_setup' && (
          <div className="text-sm text-gray-500 space-y-1">
            <p>OctoPrint noch nicht eingerichtet.</p>
            <p className="text-xs text-gray-400">
              Nach dem aktuellen Druck OctoPrint-Setup starten.
            </p>
          </div>
        )}

        {/* Idle */}
        {p.state === 'idle' && (
          <p className="text-sm text-gray-400">Bereit für neuen Druck.</p>
        )}
      </div>
    </div>
  )
}

export default function Printers() {
  const [printers, setPrinters] = useState<PrinterStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const r = await api.get('/printers')
      setPrinters(r.data)
      setLastUpdate(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

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
            <PrinterCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}
