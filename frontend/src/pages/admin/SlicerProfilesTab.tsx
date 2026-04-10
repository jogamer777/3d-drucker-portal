import { useState, useEffect, useRef } from 'react'
import api from '../../lib/api'

interface SlicerProfile {
  id: number
  name: string
  description: string | null
  printer_id: string | null
  slicer_type: string
  filename_orig: string
  size_bytes: number
  created_at: string
}

const SLICER_TYPES = ['orca', 'prusa', 'cura', 'bambu', 'other']
const PRINTER_OPTIONS = [
  { value: 'all', label: 'Alle Drucker' },
  { value: 'k2', label: 'K2 Plus Combo' },
  { value: 'crx', label: 'CR-X Pro' },
]

const SLICER_LABELS: Record<string, string> = {
  orca: 'OrcaSlicer',
  prusa: 'PrusaSlicer',
  cura: 'Cura',
  bambu: 'Bambu Studio',
  other: 'Sonstiger',
}

function formatBytes(b: number) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB'
  return (b / 1024).toFixed(0) + ' KB'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SlicerProfilesTab() {
  const [profiles, setProfiles] = useState<SlicerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [printerId, setPrinterId] = useState('all')
  const [slicerType, setSlicerType] = useState('orca')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/slicer-profiles')
      setProfiles(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const upload = async () => {
    if (!file || !name.trim()) { setError('Name und Datei erforderlich'); return }
    setError('')
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name.trim())
    formData.append('description', description.trim())
    formData.append('printer_id', printerId)
    formData.append('slicer_type', slicerType)
    try {
      await api.post('/admin/slicer-profiles', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowUpload(false)
      setName(''); setDescription(''); setPrinterId('all'); setSlicerType('orca'); setFile(null)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const doDelete = async (id: number) => {
    try {
      await api.delete(`/admin/slicer-profiles/${id}`)
      setProfiles(prev => prev.filter(p => p.id !== id))
    } catch {}
    setDeleteId(null)
  }

  const printerLabel = (pid: string | null) =>
    pid ? (PRINTER_OPTIONS.find(o => o.value === pid)?.label ?? pid) : 'Alle Drucker'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Slicer-Profile</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          + Profil hochladen
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Lade Profile...</p>
      ) : profiles.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <p className="text-3xl mb-2">📂</p>
          <p>Noch keine Slicer-Profile hochgeladen.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Drucker</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Slicer</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Datei</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Größe</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Datum</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiles.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-gray-800">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {printerLabel(p.printer_id)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {SLICER_LABELS[p.slicer_type] ?? p.slicer_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 text-xs font-mono">{p.filename_orig}</td>
                  <td className="py-2.5 px-3 text-gray-500 text-xs">{formatBytes(p.size_bytes)}</td>
                  <td className="py-2.5 px-3 text-gray-400 text-xs">{formatDate(p.created_at)}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-2">
                      <a
                        href={`/api/slicer-profiles/${p.id}/download`}
                        download={p.filename_orig}
                        className="text-xs px-2 py-1 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        ↓
                      </a>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-500 hover:bg-red-50 rounded"
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload-Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Slicer-Profil hochladen</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z.B. PLA Standard K2"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optionale Beschreibung..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Drucker</label>
                  <select
                    value={printerId}
                    onChange={e => setPrinterId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PRINTER_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Slicer</label>
                  <select
                    value={slicerType}
                    onChange={e => setSlicerType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SLICER_TYPES.map(t => (
                      <option key={t} value={t}>{SLICER_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Datei *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-blue-300 transition-colors"
                >
                  {file ? (
                    <p className="text-sm text-gray-700">{file.name}</p>
                  ) : (
                    <p className="text-sm text-gray-400">.ini, .json, .toml, .3mf, .zip, .cfg</p>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ini,.json,.toml,.3mf,.zip,.cfg"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                onClick={upload}
                disabled={uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {uploading ? 'Wird hochgeladen...' : 'Profil hochladen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen-Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Profil löschen</h3>
            <p className="text-sm text-gray-500 mb-5">
              {profiles.find(p => p.id === deleteId)?.name} – wirklich löschen?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Abbrechen</button>
              <button onClick={() => doDelete(deleteId)} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-medium">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
