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

// Feature A: creality added
const SLICER_TYPES = ['orca', 'prusa', 'cura', 'bambu', 'creality', 'other']
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
  creality: 'Creality Print',
  other: 'Sonstiger',
}

function slicerBadgeStyle(type: string): React.CSSProperties {
  if (type === 'orca') return { background: 'var(--blue-bg)', color: 'var(--blue)' }
  if (type === 'prusa') return { background: '#fff1e6', color: '#c2410c' }
  if (type === 'bambu') return { background: 'var(--emerald-bg)', color: 'var(--emerald)' }
  if (type === 'creality') return { background: '#fef9c3', color: '#854d0e' }
  return { background: 'var(--surface2)', color: 'var(--text3)' }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Slicer-Profile</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="btn-lime"
          style={{ padding: '7px 14px', fontSize: 13 }}
        >
          + Profil hochladen
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Lade Profile...</p>
      ) : profiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
          <p style={{ fontSize: 28, margin: '0 0 8px' }}>📂</p>
          <p style={{ fontSize: 13 }}>Noch keine Slicer-Profile hochgeladen.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Name', 'Drucker', 'Slicer', 'Datei', 'Größe', 'Datum', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <p style={{ fontWeight: 700, color: 'var(--text)', margin: 0 }}>{p.name}</p>
                    {p.description && <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>{p.description}</p>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: 'var(--surface2)', color: 'var(--text2)' }}>
                      {printerLabel(p.printer_id)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, ...slicerBadgeStyle(p.slicer_type) }}>
                      {SLICER_LABELS[p.slicer_type] ?? p.slicer_type}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p.filename_orig}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>{formatBytes(p.size_bytes)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>{formatDate(p.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`/api/slicer-profiles/${p.id}/download`}
                        download={p.filename_orig}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '0.5px solid var(--blue)', color: 'var(--blue)', textDecoration: 'none' }}
                      >
                        ↓
                      </a>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}
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
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Slicer-Profil hochladen</h3>
              <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. PLA Standard K2" className="input-lime" style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Beschreibung</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optionale Beschreibung..." className="input-lime" style={{ fontSize: 13 }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Drucker</label>
                  <select value={printerId} onChange={e => setPrinterId(e.target.value)} className="input-lime" style={{ fontSize: 13 }}>
                    {PRINTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Slicer</label>
                  <select value={slicerType} onChange={e => setSlicerType(e.target.value)} className="input-lime" style={{ fontSize: 13 }}>
                    {SLICER_TYPES.map(t => <option key={t} value={t}>{SLICER_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Datei *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: `1.5px dashed ${file ? 'var(--lime)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'var(--lime-bg)' : 'transparent', transition: 'all 0.15s' }}
                >
                  {file ? (
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, fontWeight: 600 }}>{file.name}</p>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>.ini, .json, .toml, .3mf, .zip, .cfg, .creality_slicer</p>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ini,.json,.toml,.3mf,.zip,.cfg,.creality_slicer"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}
              <button onClick={upload} disabled={uploading} className="btn-lime" style={{ padding: '10px 0', fontSize: 13, width: '100%' }}>
                {uploading ? 'Wird hochgeladen...' : 'Profil hochladen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen-Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px' }}>Profil löschen</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
              {profiles.find(p => p.id === deleteId)?.name} – wirklich löschen?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteId(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button onClick={() => doDelete(deleteId)}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
