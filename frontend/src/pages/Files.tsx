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
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const totalFilament = (usage: Record<string, number> | null) => {
  if (!usage) return null
  return Object.values(usage).reduce((a, b) => a + b, 0).toFixed(1)
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

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
        onUploadProgress: e => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      await load()

      // Storage-Info aktualisieren
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

  const storagePercent = storage
    ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100)
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Meine Dateien</h1>
          <p className="text-sm text-gray-500 mt-0.5">G-Code hochladen und verwalten</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !favoritesOnly
              setFavoritesOnly(next)
              load(next)
            }}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              favoritesOnly
                ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {favoritesOnly ? '★ Favoriten' : '☆ Favoriten'}
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <span>↑</span> Datei hochladen
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".gcode,.gco"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Speicher-Anzeige */}
      {storage && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Speicher</p>
            <p className="text-sm text-gray-500">
              {formatBytes(storage.used_bytes)} / {formatBytes(storage.limit_bytes)}
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                storagePercent > 90 ? 'bg-red-500' : storagePercent > 70 ? 'bg-orange-400' : 'bg-blue-500'
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{storagePercent.toFixed(0)}% belegt</p>
        </div>
      )}

      {/* Upload-Fortschritt */}
      {uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-700">Wird hochgeladen & analysiert...</p>
            <p className="text-sm text-blue-600">{uploadProgress}%</p>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Drag & Drop Zone (wenn keine Dateien) */}
      {files.length === 0 && !loading && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="text-4xl mb-3">📁</p>
          <p className="text-gray-600 font-medium">G-Code hier ablegen oder klicken</p>
          <p className="text-sm text-gray-400 mt-1">.gcode und .gco Dateien, max. 500 MB</p>
        </div>
      )}

      {/* Dateiliste */}
      {loading ? (
        <p className="text-sm text-gray-400">Laden...</p>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`space-y-3 ${dragOver ? 'ring-2 ring-blue-400 ring-offset-2 rounded-xl' : ''}`}
        >
          {files.map(f => {
            const dur = formatDuration(f.duration_seconds)
            const filG = totalFilament(f.filament_usage)
            return (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 hover:shadow-sm transition-shadow">
                {/* Thumbnail */}
                <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                  {f.thumbnail_b64 ? (
                    <img src={f.thumbnail_b64} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📄</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900 truncate">{f.filename}</p>
                    {f.profile_signature ? (
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        ✓ {f.profile_signature}
                      </span>
                    ) : (
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                        ⚠ Kein Profil
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatBytes(f.size_bytes)}
                    {dur && <> · {dur}</>}
                    {filG && <> · {filG} g</>}
                    {' · '}{formatDate(f.uploaded_at)}
                  </p>

                  {/* Filament-Aufschlüsselung */}
                  {f.filament_usage && Object.keys(f.filament_usage).length > 1 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Object.entries(f.filament_usage).map(([slot, g]) => (
                        <span key={slot} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {slot}: {g}g
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Aktionen */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleFavorite(f)}
                    className={`text-xs px-3 py-1.5 rounded border text-center transition-colors ${
                      f.is_favorite
                        ? 'bg-yellow-50 border-yellow-300 text-yellow-600'
                        : 'border-gray-200 text-gray-400 hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-500'
                    }`}
                    title={f.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                  >
                    {f.is_favorite ? '★' : '☆'}
                  </button>
                  <a
                    href={`/api/files/${f.id}/download`}
                    download={f.filename}
                    className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 text-center"
                  >
                    ↓ Download
                  </a>
                  <button
                    onClick={() => setDeleteId(f.id)}
                    className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Löschen-Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Datei löschen</h3>
            <p className="text-sm text-gray-600 mb-5">
              {files.find(f => f.id === deleteId)?.filename} – wirklich löschen?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={() => deleteFile(deleteId)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-medium"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
