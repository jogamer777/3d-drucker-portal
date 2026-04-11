import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import GCodeLayerPreview from '../components/GCodeLayerPreview'
import StatusDot from '../components/StatusDot'

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

interface SlotInfo {
  slot_index: number
  printer_id: string
  filament_name: string | null
  material: string | null
  color_hex: string | null
  remaining_weight_g: number | null
  initial_weight_g: number | null
  low_spool: boolean
  print_temp_min?: number | null
  print_temp_max?: number | null
  bed_temp?: number | null
  cooling_percent?: number | null
  print_speed_mms?: number | null
  notes?: string | null
}

interface SlicerProfileInfo {
  id: number
  name: string
  description: string | null
  printer_id: string | null
  slicer_type: string
  filename_orig: string
}

const SLICER_LABELS: Record<string, string> = {
  orca: 'OrcaSlicer', prusa: 'PrusaSlicer', cura: 'Cura',
  bambu: 'Bambu Studio', creality: 'Creality Print', other: 'Sonstiger',
}

const STATE_CONFIG: Record<string, { label: string }> = {
  idle:          { label: 'Bereit'           },
  printing:      { label: 'Druckt'           },
  paused:        { label: 'Pausiert'         },
  error:         { label: 'Fehler'           },
  complete:      { label: 'Druck fertig'     },
  offline:       { label: 'Offline'          },
  pending_setup: { label: 'Einrichtung'      },
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

function WebcamView({ src, name }: { src: string; name: string }) {
  const [error, setError] = useState(false)
  if (error) return (
    <div style={{ background: '#111', aspectRatio: '16/9', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text3)', fontSize: 13 }}>Webcam nicht verfügbar</p>
    </div>
  )
  return (
    <div style={{ background: '#000', aspectRatio: '16/9', width: '100%', overflow: 'hidden' }}>
      <img src={src} alt={`${name} Webcam`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setError(true)} />
    </div>
  )
}

function SlotCard({ s }: { s: SlotInfo }) {
  const [expanded, setExpanded] = useState(false)
  const pct = s.remaining_weight_g != null && s.initial_weight_g
    ? Math.max(0, Math.min(100, (s.remaining_weight_g / s.initial_weight_g) * 100))
    : null
  const barColor = pct == null ? 'var(--border)' : pct > 25 ? 'var(--emerald)' : pct > 10 ? 'var(--amber)' : 'var(--red)'

  const hasParams = s.print_temp_min || s.print_temp_max || s.bed_temp || s.cooling_percent || s.print_speed_mms || s.notes

  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {s.color_hex ? (
          <div style={{ width: 16, height: 16, borderRadius: 4, background: s.color_hex, border: '0.5px solid var(--border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--border)', flexShrink: 0 }} />
        )}
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{s.filament_name}</p>
        {s.material && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{s.material}</span>
        )}
        {s.low_spool && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 600, flexShrink: 0 }}>Wenig</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto', flexShrink: 0 }}>#{s.slot_index + 1}</span>
      </div>

      {pct != null && (
        <div style={{ marginBottom: s.remaining_weight_g != null ? 4 : 0 }}>
          <div style={{ background: 'var(--border)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.5s' }} />
          </div>
          {s.remaining_weight_g != null && (
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '3px 0 0', fontFamily: 'var(--mono)' }}>
              {s.remaining_weight_g} g
            </p>
          )}
        </div>
      )}

      {hasParams && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 11, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0', fontFamily: 'inherit', fontWeight: 600 }}
          >
            {expanded ? '▾' : '▸'} Parameter anzeigen
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(s.print_temp_min || s.print_temp_max) && (
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 1px' }}>Drucktemp.</p>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', margin: 0 }}>
                    {s.print_temp_min ?? '?'}–{s.print_temp_max ?? '?'} °C
                  </p>
                </div>
              )}
              {s.bed_temp && (
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 1px' }}>Betttemp.</p>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', margin: 0 }}>{s.bed_temp} °C</p>
                </div>
              )}
              {s.cooling_percent != null && (
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 1px' }}>Kühlung</p>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', margin: 0 }}>{s.cooling_percent}%</p>
                </div>
              )}
              {s.print_speed_mms != null && (
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 1px' }}>Geschw.</p>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', margin: 0 }}>{s.print_speed_mms} mm/s</p>
                </div>
              )}
              {s.notes && (
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 8px', gridColumn: 'span 2' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 1px' }}>Notizen</p>
                  <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0 }}>{s.notes}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

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
  const [refundCents, setRefundCents] = useState<number | null>(null)
  const [lastMaintenance, setLastMaintenance] = useState<{ action: string; notes: string | null; created_at: string } | null>(null)
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [slicerProfiles, setSlicerProfiles] = useState<SlicerProfileInfo[]>([])
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
    api.get(`/printers/${id}/maintenance/last`).then(r => setLastMaintenance(r.data)).catch(() => {})
    api.get('/filament/slots').then(r => {
      setSlots((r.data as SlotInfo[]).filter(s => s.printer_id === id))
    }).catch(() => {})
    api.get('/slicer-profiles').then(r => {
      setSlicerProfiles((r.data as SlicerProfileInfo[]).filter(p => !p.printer_id || p.printer_id === id))
    }).catch(() => {})
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
    <p style={{ color: 'var(--text3)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>Verbinde mit Drucker...</p>
  )
  if (notFound) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <p style={{ color: 'var(--text2)', marginBottom: 12 }}>Drucker nicht gefunden.</p>
      <Link to="/" style={{ fontSize: 13, color: 'var(--lime-dark)', fontWeight: 700 }}>← Zum Dashboard</Link>
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

  let etaTimeStr: string | null = null
  if (p.estimated_end_time) {
    const eta = new Date(p.estimated_end_time * 1000)
    etaTimeStr = eta.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const filamentM = p.filament_used_mm > 0 ? (p.filament_used_mm / 1000).toFixed(2) : null

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link to="/" style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Dashboard</Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-[14px] items-start">

        {/* LEFT: Webcam + progress + details */}
        <div className="order-2 md:order-1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Webcam card */}
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '0.5px solid var(--border)', background: '#111', position: 'relative' }}>
            {p.webcam_path && p.online && p.state !== 'pending_setup' ? (
              <>
                <WebcamView src={p.webcam_path} name={p.name} />
                {showProgress && (
                  <>
                    {/* Percent overlay */}
                    <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
                      <span style={{ fontSize: 48, fontWeight: 900, color: 'var(--lime)', lineHeight: 1, fontFamily: 'var(--mono)' }}>
                        {pct}%
                      </span>
                    </div>
                    {/* LIVE badge */}
                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'var(--red)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                      LIVE
                    </div>
                    {/* Progress bar */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.2)' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--lime)', transition: 'width 1s' }} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ background: '#111', aspectRatio: '16/9', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"><rect x="2" y="4" width="16" height="12" rx="2" /><circle cx="10" cy="10" r="3" /></svg>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                  {!p.online ? 'Offline' : 'Kein Webcam'}
                </p>
              </div>
            )}
          </div>

          {/* Progress bar (non-webcam view) */}
          {showProgress && !p.webcam_path && (
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: 'var(--mono)' }}>{pct}%</span>
                <div style={{ textAlign: 'right' }}>
                  {etaTimeStr && <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Fertig um {etaTimeStr}</p>}
                  {etaSecs > 0 && <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, fontFamily: 'var(--mono)' }}>noch {formatCountdownHM(etaSecs)}</p>}
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--lime)', transition: 'width 1s' }} />
              </div>
            </div>
          )}

          {/* ETA (webcam view) */}
          {showProgress && p.webcam_path && (etaTimeStr || etaSecs > 0) && (
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid var(--border)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {etaTimeStr && <span style={{ fontSize: 13, fontWeight: 700 }}>Fertig um {etaTimeStr}</span>}
              {etaSecs > 0 && <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>noch {formatCountdownHM(etaSecs)}</span>}
            </div>
          )}

          {/* Stats grid (only for Admin/Owner) */}
          {canSeeDetails && (showProgress || p.state === 'complete') && (
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Druckdetails</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[
                  { label: 'Hotend', val: `${p.temp_hotend}°C${p.temp_hotend_target > 0 ? ` / ${p.temp_hotend_target}°C` : ''}` },
                  { label: 'Bett', val: `${p.temp_bed}°C${p.temp_bed_target > 0 ? ` / ${p.temp_bed_target}°C` : ''}` },
                  ...(p.layer != null && p.layer_count != null ? [{ label: 'Layer', val: `${p.layer} / ${p.layer_count}` }] : []),
                  ...(p.z_pos > 0 ? [{ label: 'Z-Pos', val: `${p.z_pos} mm` }] : []),
                  ...(filamentM ? [{ label: 'Filament', val: `${filamentM} m${p.filament_type ? ` · ${p.filament_type}` : ''}` }] : []),
                  ...(p.elapsed_seconds > 0 ? [{ label: 'Laufzeit', val: formatTime(p.elapsed_seconds) }] : []),
                ].map(({ label, val }) => (
                  <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                    <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 2px' }}>{label}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', margin: 0 }}>{val}</p>
                  </div>
                ))}
              </div>

              {p.filename && (
                <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                  {p.filename}
                </p>
              )}

              {/* GCode Layer Preview */}
              {iAmOccupying && p.occupation?.file_id && showProgress && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                  <GCodeLayerPreview fileId={p.occupation.file_id} currentLayer={p.layer} layerCount={p.layer_count} />
                </div>
              )}
            </div>
          )}

          {/* Admin controls */}
          {(isAdmin || iAmOccupying) && showProgress && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.state === 'printing' && (
                <button onClick={() => control('pause')} disabled={actionLoading}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '0.5px solid var(--amber)', color: 'var(--amber)', borderRadius: 10, background: 'var(--amber-bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Pausieren
                </button>
              )}
              {p.state === 'paused' && (
                <button onClick={() => control('resume')} disabled={actionLoading}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '0.5px solid var(--emerald)', color: 'var(--emerald)', borderRadius: 10, background: 'var(--emerald-bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Fortsetzen
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => setConfirmAction('cancel')} disabled={actionLoading}
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '0.5px solid var(--red)', color: 'var(--red)', borderRadius: 10, background: 'var(--red-bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Abbrechen
                  </button>
                  <button onClick={() => setConfirmAction('emergency_stop')} disabled={actionLoading}
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: 'var(--red)', color: '#fff', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Notfall-Stopp
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Status + actions + sidebar */}
        <div className="order-1 md:order-2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* "Du bist dran!" Banner */}
          {notified && (
            <div style={{ background: 'var(--blue-bg)', border: '0.5px solid var(--blue)', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue)', margin: '0 0 4px' }}>Du bist dran!</p>
              <p style={{ fontSize: 12, color: 'var(--blue)', margin: '0 0 10px', opacity: 0.8 }}>5 Minuten um den Drucker zu beanspruchen.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {canClaimAfterNotified && (
                  <button onClick={claim} disabled={actionLoading} className="btn-lime" style={{ flex: 1, padding: '8px', fontSize: 13 }}>
                    Beanspruchen
                  </button>
                )}
                <button onClick={acknowledge} disabled={actionLoading} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 13 }}>
                  Überspringen
                </button>
              </div>
            </div>
          )}

          {/* Abholen Banner */}
          {iAmAwaiting && (
            <div style={{ background: 'var(--amber-bg)', border: '0.5px solid var(--amber)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber)', margin: 0 }}>Druck fertig – abholen!</p>
                {pickupSecs > 0 && (
                  <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{formatCountdownHM(pickupSecs)}</span>
                )}
              </div>
              <button onClick={release} disabled={actionLoading}
                style={{ width: '100%', background: 'var(--amber)', color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 10, border: 'none', padding: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Freigeben (Abgeholt)
              </button>
            </div>
          )}

          {/* Externer Druck Banner */}
          {p.external_print && (
            <div style={{ background: 'var(--amber-bg)', border: '0.5px solid var(--amber)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', margin: '0 0 2px' }}>Außerhalb Portal gestartet</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>Dieser Druck ist keinem Nutzer zugeordnet.</p>
            </div>
          )}

          {/* Status card */}
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <StatusDot state={p.state} size={10} />
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{cfg.label}</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{p.name}</p>
            {iAmOccupying && !iAmAwaiting && (
              <p style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, margin: '4px 0 0' }}>Du nutzt diesen Drucker</p>
            )}
            {p.occupation && !p.occupation.is_mine && (
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 0' }}>
                Belegt von: {isAdmin ? p.occupation.user_email : p.occupation.user_display}
                {p.occupation.status === 'awaiting_pickup' && ' · wartet auf Abholung'}
              </p>
            )}
            {p.state === 'offline' && (
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>Drucker nicht erreichbar</p>
            )}
          </div>

          {/* Queue info */}
          {p.queue_count > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid var(--border)', padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
              {p.queue_count} {p.queue_count === 1 ? 'Person' : 'Personen'} in der Warteschlange
            </div>
          )}
          {p.my_queue && p.my_queue.status === 'waiting' && (
            <div style={{ background: 'var(--blue-bg)', borderRadius: 12, border: '0.5px solid var(--blue)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', margin: 0 }}>
                Position {p.my_queue.position} in der Warteschlange
              </p>
              <button onClick={leaveQueue} disabled={actionLoading}
                style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                Verlassen
              </button>
            </div>
          )}

          {actionError && (
            <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--red)' }}>
              {actionError}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {canClaim && !notified && (
              <button onClick={claim} disabled={actionLoading} className="btn-lime" style={{ padding: '11px 16px', fontSize: 14, width: '100%' }}>
                Drucker beanspruchen
              </button>
            )}
            {iAmOccupying && !iAmAwaiting && !['printing', 'paused'].includes(p.state) && (
              <button
                onClick={() => navigate(`/drucker/${id}/drucken`)}
                disabled={actionLoading}
                className="btn-lime"
                style={{ padding: '11px 16px', fontSize: 14, width: '100%' }}
              >
                Jetzt drucken
              </button>
            )}
            {iAmOccupying && !iAmAwaiting && (
              <button onClick={release} disabled={actionLoading} className="btn-secondary" style={{ padding: '10px 16px', fontSize: 14, width: '100%' }}>
                Drucker freigeben
              </button>
            )}
            {canQueue && (
              <button onClick={joinQueue} disabled={actionLoading} className="btn-secondary"
                style={{ padding: '10px 16px', fontSize: 14, width: '100%', color: 'var(--blue)', borderColor: 'var(--blue)' }}>
                In Warteschlange einreihen
              </button>
            )}
          </div>

          {/* Filament slots */}
          {slots.filter(s => s.filament_name).length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Filament</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {slots.map(s => <SlotCard key={s.slot_index} s={s} />)}
              </div>
            </div>
          )}

          {/* Slicer profiles */}
          {slicerProfiles.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Slicer-Profile</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {slicerProfiles.map(sp => (
                  <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--surface2)', borderRadius: 9, padding: '8px 10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600 }}>
                          {SLICER_LABELS[sp.slicer_type] ?? sp.slicer_type}
                        </span>
                        {sp.description && <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>{sp.description}</p>}
                      </div>
                    </div>
                    <a
                      href={`/api/slicer-profiles/${sp.id}/download`}
                      download={sp.filename_orig}
                      style={{ fontSize: 12, padding: '5px 10px', border: '0.5px solid var(--blue)', color: 'var(--blue)', borderRadius: 7, textDecoration: 'none', flexShrink: 0, fontWeight: 600 }}
                    >
                      ↓
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Letzte Wartung */}
          {lastMaintenance && (
            <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '12px 14px' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Letzte Wartung</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{lastMaintenance.action}</p>
              {lastMaintenance.notes && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 0' }}>{lastMaintenance.notes}</p>}
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 0', fontFamily: 'var(--mono)' }}>
                {new Date(lastMaintenance.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Erstattungs-Toast */}
      {refundCents !== null && refundCents > 0 && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--emerald)', color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          Druck abgebrochen – {(refundCents / 100).toFixed(2)} € erstattet
          <button onClick={() => setRefundCents(null)} style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>
      )}

      {/* Bestätigungs-Modal */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', border: '0.5px solid var(--border)' }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, margin: '0 0 8px' }}>
              {confirmAction === 'emergency_stop' ? 'Notfall-Stopp bestätigen' : 'Druck abbrechen?'}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text2)', margin: '0 0 18px' }}>
              {confirmAction === 'emergency_stop'
                ? 'Der Drucker wird sofort gestoppt. Alle Bewegungen werden abgebrochen.'
                : 'Der aktuelle Druck wird abgebrochen. Das Modell muss neu gestartet werden.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={async () => {
                  const a = confirmAction
                  setConfirmAction(null)
                  setRefundCents(null)
                  try {
                    const r = await api.post(`/printers/${id}/control`, { action: a })
                    if (a === 'cancel' && r.data?.refund_cents > 0) setRefundCents(r.data.refund_cents)
                    load()
                  } catch (e: any) {
                    setActionError(e.response?.data?.detail ?? 'Fehler')
                  }
                }}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 14, borderRadius: 10, border: 'none', padding: '10px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Ja, ausführen
              </button>
              <button onClick={() => setConfirmAction(null)} className="btn-secondary" style={{ flex: 1, padding: '10px', fontSize: 14 }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
