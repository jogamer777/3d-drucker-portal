import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore, formatBalance } from '../stores/authStore'

interface GCodeFileInfo {
  id: number
  filename: string
  duration_seconds: number | null
  filament_usage: string | null
  thumbnail_b64: string | null
  size_bytes: number
}

const RATE_PER_HOUR_CENTS = 20
const RATE_PER_GRAM_CENTS = 5

const PRINTER_MAX_DURATION_SECONDS: Record<string, number> = {
  k2:  172800,
  crx: 345600,
}

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

function formatBytes(b: number) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB'
  return (b / 1024).toFixed(0) + ' KB'
}

export default function PrintFlow() {
  const { id: printerId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [files, setFiles] = useState<GCodeFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GCodeFileInfo | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [tempHotend, setTempHotend] = useState('')
  const [tempBed, setTempBed] = useState('')
  const [speedPercent, setSpeedPercent] = useState('')
  const [flowPercent, setFlowPercent] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'admin'
  const userBalanceCents = user?.balance_cents ?? 0
  const maxDuration = printerId ? PRINTER_MAX_DURATION_SECONDS[printerId] : undefined
  const selectedGrams = selected ? parseFilamentGrams(selected.filament_usage) : 0
  const selectedCost = selected ? estimateCost(selected.duration_seconds, selectedGrams) : 0
  const canAfford = userBalanceCents >= selectedCost
  const exceedsDurationLimit = !!(selected?.duration_seconds && maxDuration && selected.duration_seconds > maxDuration)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = () => {
    setLoading(true)
    api.get('/files')
      .then(r => setFiles(r.data))
      .catch(() => setError('Dateien konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }

  const doStart = async () => {
    if (!selected || !printerId) return
    setStarting(true)
    setError('')
    try {
      const body: Record<string, unknown> = { file_id: selected.id }
      if (isAdmin && showAdvanced) {
        if (tempHotend) body.temp_hotend = parseInt(tempHotend)
        if (tempBed) body.temp_bed = parseInt(tempBed)
        if (speedPercent) body.speed_percent = parseInt(speedPercent)
        if (flowPercent) body.flow_percent = parseInt(flowPercent)
      }
      await api.post(`/printers/${printerId}/start`, body)
      navigate(`/drucker/${printerId}/drucken/success`, {
        state: {
          filename: selected.filename,
          cost: selectedCost,
          duration: selected.duration_seconds,
          grams: selectedGrams,
        },
      })
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler beim Starten')
      setStarting(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.gcode') && !file.name.endsWith('.bgcode')) {
      setError('Nur .gcode und .bgcode Dateien erlaubt.')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post('/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      loadFiles()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link
          to={`/drucker/${printerId}`}
          style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Zurück
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>
          Druck starten
        </h1>
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}
           className="grid-cols-1 md:grid-cols-[1fr_320px]">

        {/* Left: file list */}
        <div>
          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleUpload(f)
            }}
            onClick={() => fileRef.current?.click()}
            style={{
              borderRadius: 14,
              border: dragOver ? '2px dashed var(--lime-dark)' : '2px dashed var(--border)',
              background: dragOver ? 'var(--lime-bg)' : 'transparent',
              padding: '20px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 12,
              transition: 'all 0.15s',
            }}
          >
            {uploading ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Lädt hoch... {uploadProgress}%</p>
                <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--lime)', transition: 'width 0.2s' }} />
                </div>
              </>
            ) : (
              <>
                <svg style={{ margin: '0 auto 8px', display: 'block' }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>G-Code hier ablegen oder klicken</p>
                <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 0' }}>.gcode, .bgcode</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".gcode,.bgcode" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />

          {/* File list */}
          {loading ? (
            <p style={{ color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>Lade Dateien...</p>
          ) : files.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>Noch keine G-Code-Dateien. Lade eine Datei hoch.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map(f => {
                const grams = parseFilamentGrams(f.filament_usage)
                const cost = estimateCost(f.duration_seconds, grams)
                const isSelected = selected?.id === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelected(isSelected ? null : f)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: isSelected ? '2px solid var(--lime)' : '0.5px solid var(--border)',
                      background: isSelected ? 'var(--lime-bg)' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      fontFamily: 'inherit',
                      transition: 'all 0.12s',
                    }}
                  >
                    {/* Thumbnail */}
                    {f.thumbnail_b64 ? (
                      <img src={f.thumbnail_b64} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--border)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, background: 'var(--surface2)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.5"><rect x="4" y="2" width="12" height="16" rx="2" /><path d="M8 6h4M8 9h4M8 12h2" /></svg>
                      </div>
                    )}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.filename}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text2)', margin: '3px 0 0', fontFamily: 'var(--mono)' }}>
                        {formatDuration(f.duration_seconds)}
                        {grams > 0 && <> · {grams.toFixed(1)} g</>}
                        {' · '}{formatBytes(f.size_bytes)}
                      </p>
                    </div>

                    {/* Cost */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: cost === 0 ? 'var(--emerald)' : 'var(--text)', margin: 0, fontFamily: 'var(--mono)' }}>
                        {cost === 0 ? 'kostenlos' : `${(cost / 100).toFixed(2)} €`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: cost preview + start */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cost card */}
          <div style={{ borderRadius: 16, background: '#fff', border: '0.5px solid var(--border)', padding: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>Kosten-Vorschau</p>

            {selected ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.filename}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.duration_seconds && selected.duration_seconds > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>Druckzeit</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{formatDuration(selected.duration_seconds)}</span>
                    </div>
                  )}
                  {selectedGrams > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>Filament</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{selectedGrams.toFixed(1)} g</span>
                    </div>
                  )}
                  <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                    <span style={{ fontWeight: 700 }}>Gesamt</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 900 }}>
                      {selectedCost === 0 ? 'kostenlos' : `${(selectedCost / 100).toFixed(2)} €`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Guthaben danach</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: canAfford ? 'var(--emerald)' : 'var(--red)' }}>
                      {formatBalance(userBalanceCents - selectedCost)}
                    </span>
                  </div>
                </div>

                {!canAfford && (
                  <div style={{ marginTop: 12, background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--amber)' }}>
                    Guthaben zu gering. <Link to="/guthaben" style={{ color: 'var(--amber)', fontWeight: 700 }}>Aufladen →</Link>
                  </div>
                )}

                {exceedsDurationLimit && (
                  <div style={{ marginTop: 12, background: 'var(--red-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--red)' }}>
                    Druckdauer überschreitet das Maximum für diesen Drucker.
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 13 }}>Datei auswählen...</p>
            )}
          </div>

          {/* Admin advanced settings */}
          {isAdmin && (
            <div style={{ borderRadius: 14, background: '#fff', border: '0.5px solid var(--border)', padding: 14 }}>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}
              >
                {showAdvanced ? '▾' : '▸'} Erweiterte Einstellungen
              </button>
              {showAdvanced && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Hotend °C', val: tempHotend, set: setTempHotend, min: 150, max: 300, ph: 'Standard' },
                    { label: 'Bett °C', val: tempBed, set: setTempBed, min: 0, max: 120, ph: 'Standard' },
                    { label: 'Speed %', val: speedPercent, set: setSpeedPercent, min: 50, max: 200, ph: '100' },
                    { label: 'Fluss %', val: flowPercent, set: setFlowPercent, min: 50, max: 150, ph: '100' },
                  ].map(({ label, val, set, min, max, ph }) => (
                    <label key={label}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>{label}</span>
                      <input
                        type="number" min={min} max={max} value={val} placeholder={ph}
                        onChange={e => set(e.target.value)}
                        className="input-lime"
                        style={{ padding: '6px 10px', fontSize: 13 }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* Start button */}
          <button
            onClick={doStart}
            disabled={!selected || starting || (!canAfford && !isAdmin) || exceedsDurationLimit}
            className="btn-lime"
            style={{ padding: '14px 20px', fontSize: 15, width: '100%' }}
          >
            {starting ? 'Wird gestartet...' : 'Druck starten'}
          </button>
        </div>
      </div>
    </div>
  )
}
