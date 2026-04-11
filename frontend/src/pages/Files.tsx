import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface GCodeFile {
  id: number
  filename: string
  size_bytes: number
  duration_seconds: number | null
  filament_usage: Record<string, number> | null
  thumbnail_b64: string | null
  profile_signature: string | null
  is_favorite: boolean
  slicer_profile_id: number | null
  slicer_profile_name: string | null
  uploaded_at: string
}

interface StorageInfo {
  used_bytes: number
  limit_bytes: number
}

const formatBytes = (b: number) => {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(1) + ' GB'
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + ' MB'
  return (b / 1024).toFixed(0) + ' KB'
}

const formatDuration = (s: number | null) => {
  if (!s) return null
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const totalFilament = (usage: Record<string, number> | null) => {
  if (!usage) return null
  return Object.values(usage).reduce((a, b) => a + b, 0).toFixed(1)
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function Files() {
  useAuthStore()
  const [files, setFiles] = useState<GCodeFile[]>([])
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async (favOnly = favoritesOnly) => {
    setLoading(true)
    try {
      const [fRes, sRes] = await Promise.all([
        api.get(`/files${favOnly ? '?favorites_only=true' : ''}`),
        api.get('/files/storage'),
      ])
      setFiles(fRes.data)
      setStorage(sRes.data)
    } finally {
      setLoading(false)
    }
  }

  const toggleFavorite = async (f: GCodeFile) => {
    const newVal = !f.is_favorite
    setFiles(prev => prev.map(x => x.id === f.id ? { ...x, is_favorite: newVal } : x))
    try {
      await api.patch(`/files/${f.id}/favorite`, { is_favorite: newVal })
    } catch {
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, is_favorite: f.is_favorite } : x))
    }
  }

  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = async (file: File) => {
    setError('')
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['gcode', 'gco'].includes(ext ?? '')) {
      setError('Nur .gcode und .gco Dateien erlaubt.')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    setUploadProgress(0)
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)) },
      })
      await load()
      const me = await api.get('/user/me')
      useAuthStore.setState(s => ({ ...s, user: me.data }))
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) uploadFile(f)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) uploadFile(f)
  }

  const deleteFile = async (id: number) => {
    try {
      await api.delete(`/files/${id}`)
      setFiles(prev => prev.filter(f => f.id !== id))
      await api.get('/files/storage').then(r => setStorage(r.data))
    } catch {}
    setDeleteId(null)
  }

  const storagePercent = storage ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100) : 0
  const storageColor = storagePercent > 90 ? 'var(--red)' : storagePercent > 70 ? 'var(--amber)' : 'var(--lime)'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Meine Dateien</h1>
          {storage && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Speicher</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  {formatBytes(storage.used_bytes)} / {formatBytes(storage.limit_bytes)}
                </span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 5, overflow: 'hidden', maxWidth: 300 }}>
                <div style={{ width: `${storagePercent}%`, height: '100%', background: storageColor, transition: 'width 0.5s' }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => { const next = !favoritesOnly; setFavoritesOnly(next); load(next) }}
            style={{
              padding: '8px 12px', fontSize: 13, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              border: favoritesOnly ? '1.5px solid var(--amber)' : '0.5px solid var(--border)',
              background: favoritesOnly ? 'var(--amber-bg)' : 'transparent',
              color: favoritesOnly ? 'var(--amber)' : 'var(--text2)',
            }}>
            {favoritesOnly ? '★ Favoriten' : '☆ Favoriten'}
          </button>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-lime" style={{ padding: '8px 16px', fontSize: 13 }}>
            ↑ Hochladen
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".gcode,.gco" onChange={handleFileInput} className="hidden" />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ background: 'var(--lime-bg)', border: '0.5px solid var(--lime)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Wird hochgeladen & analysiert...</span>
            <span style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>{uploadProgress}%</span>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--lime-dark)', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Empty drop zone */}
      {files.length === 0 && !loading && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            borderRadius: 14, border: dragOver ? '2px dashed var(--lime-dark)' : '2px dashed var(--border)',
            background: dragOver ? 'var(--lime-bg)' : 'transparent',
            padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <svg style={{ margin: '0 auto 10px', display: 'block' }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', margin: '0 0 4px' }}>G-Code hier ablegen oder klicken</p>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>.gcode und .gco, max. 500 MB</p>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Laden...</p>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, outline: dragOver ? '2px solid var(--lime)' : 'none', borderRadius: 14 }}
        >
          {files.map(f => {
            const dur = formatDuration(f.duration_seconds)
            const filG = totalFilament(f.filament_usage)
            return (
              <div key={f.id} style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* Thumbnail */}
                <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 9, overflow: 'hidden', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {f.thumbnail_b64 ? (
                    <img src={f.thumbnail_b64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.5"><rect x="4" y="2" width="12" height="16" rx="2" /><path d="M8 6h4M8 9h4M8 12h2" /></svg>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</p>
                    {f.slicer_profile_name && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>
                        {f.slicer_profile_name}
                      </span>
                    )}
                    {f.profile_signature ? (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, background: 'var(--emerald-bg)', color: 'var(--emerald)', fontWeight: 700, flexShrink: 0 }}>
                        ✓ {f.profile_signature}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 5, background: 'var(--amber-bg)', color: 'var(--amber)', fontWeight: 700, flexShrink: 0 }}>
                        Kein Profil
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0, fontFamily: 'var(--mono)' }}>
                    {formatBytes(f.size_bytes)}
                    {dur && <> · {dur}</>}
                    {filG && <> · {filG} g</>}
                    {' · '}{formatDate(f.uploaded_at)}
                  </p>
                  {f.filament_usage && Object.keys(f.filament_usage).length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {Object.entries(f.filament_usage).map(([slot, g]) => (
                        <span key={slot} style={{ fontSize: 10, background: 'var(--surface2)', color: 'var(--text2)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--mono)' }}>
                          {slot}: {g}g
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleFavorite(f)}
                    title={f.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
                    style={{
                      width: 30, height: 30, borderRadius: 7, border: f.is_favorite ? '1.5px solid var(--amber)' : '0.5px solid var(--border)',
                      background: f.is_favorite ? 'var(--amber-bg)' : 'transparent',
                      color: f.is_favorite ? 'var(--amber)' : 'var(--text3)',
                      fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {f.is_favorite ? '★' : '☆'}
                  </button>
                  <a
                    href={`/api/files/${f.id}/download`}
                    download={f.filename}
                    style={{ width: 30, height: 30, borderRadius: 7, border: '0.5px solid var(--blue)', color: 'var(--blue)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                    title="Herunterladen"
                  >
                    ↓
                  </a>
                  <button
                    onClick={() => setDeleteId(f.id)}
                    style={{ width: 30, height: 30, borderRadius: 7, border: '0.5px solid var(--red-bg)', color: 'var(--red)', fontSize: 14, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Löschen"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete modal */}
      {deleteId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, border: '0.5px solid var(--border)' }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, margin: '0 0 8px' }}>Datei löschen?</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 18px' }}>
              {files.find(f => f.id === deleteId)?.filename} – wirklich löschen?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} className="btn-secondary" style={{ flex: 1, padding: '10px', fontSize: 14 }}>Abbrechen</button>
              <button onClick={() => deleteFile(deleteId)}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 14, borderRadius: 10, border: 'none', padding: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
