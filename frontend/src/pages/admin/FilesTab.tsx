import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface AdminFile {
  id: number
  user_id: number
  user_email: string
  filename: string
  size_bytes: number
  duration_seconds: number | null
  filament_usage: Record<string, number> | null
  thumbnail_b64: string | null
  profile_signature: string | null
  uploaded_at: string
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

export default function FilesTab() {
  const [files, setFiles] = useState<AdminFile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/admin/files').then(r => setFiles(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const deleteFile = async (id: number) => {
    try {
      await api.delete(`/admin/files/${id}`)
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch {}
    setDeleteId(null)
  }

  const filtered = files.filter(f =>
    !search || f.user_email.toLowerCase().includes(search.toLowerCase()) ||
    f.filename.toLowerCase().includes(search.toLowerCase())
  )

  const totalSize = files.reduce((s, f) => s + f.size_bytes, 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="E-Mail oder Dateiname suchen..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <span className="text-sm text-gray-500 ml-auto">
          {files.length} Dateien · {formatBytes(totalSize)} gesamt
        </span>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">Aktualisieren</button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Laden...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Keine Dateien gefunden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Nutzer</th>
                <th className="pb-2 font-medium">Datei</th>
                <th className="pb-2 font-medium">Größe</th>
                <th className="pb-2 font-medium">Dauer</th>
                <th className="pb-2 font-medium">Filament</th>
                <th className="pb-2 font-medium">Profil</th>
                <th className="pb-2 font-medium">Hochgeladen</th>
                <th className="pb-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const dur = formatDuration(f.duration_seconds)
                const filG = totalFilament(f.filament_usage)
                return (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 text-gray-700 font-medium">{f.user_email}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {f.thumbnail_b64 ? (
                          <img src={f.thumbnail_b64} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <span className="text-lg">📄</span>
                        )}
                        <span className="text-gray-800 truncate max-w-[180px]">{f.filename}</span>
                      </div>
                    </td>
                    <td className="py-2 text-gray-600 whitespace-nowrap">{formatBytes(f.size_bytes)}</td>
                    <td className="py-2 text-gray-600 whitespace-nowrap">{dur ?? '–'}</td>
                    <td className="py-2 text-gray-600 whitespace-nowrap">{filG ? `${filG} g` : '–'}</td>
                    <td className="py-2">
                      {f.profile_signature ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ✓ {f.profile_signature}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
                          ⚠ Kein Profil
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 whitespace-nowrap">{formatDate(f.uploaded_at)}</td>
                    <td className="py-2">
                      <div className="flex gap-1.5">
                        <a
                          href={`/api/admin/files/${f.id}/download`}
                          download={f.filename}
                          className="text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          ↓
                        </a>
                        <button
                          onClick={() => setDeleteId(f.id)}
                          className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Löschen-Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Datei löschen</h3>
            <p className="text-sm text-gray-600 mb-1">
              {files.find(f => f.id === deleteId)?.filename}
            </p>
            <p className="text-sm text-gray-500 mb-5">
              von {files.find(f => f.id === deleteId)?.user_email} – wirklich löschen?
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
