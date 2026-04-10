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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="E-Mail oder Dateiname suchen..."
          className="input-lime"
          style={{ fontSize: 12, width: 240 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
          {files.length} Dateien · {formatBytes(totalSize)} gesamt
        </span>
        <button onClick={load} style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Aktualisieren</button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Laden...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Keine Dateien gefunden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Nutzer', 'Datei', 'Größe', 'Dauer', 'Filament', 'Profil', 'Hochgeladen', 'Aktionen'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const dur = formatDuration(f.duration_seconds)
                const filG = totalFilament(f.filament_usage)
                return (
                  <tr key={f.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{f.user_email}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {f.thumbnail_b64 ? (
                          <img src={f.thumbnail_b64} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: 16 }}>📄</span>
                        )}
                        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{f.filename}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>{formatBytes(f.size_bytes)}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>{dur ?? '–'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>{filG ? `${filG} g` : '–'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {f.profile_signature ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--emerald-bg)', color: 'var(--emerald)' }}>
                          ✓ {f.profile_signature}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--amber-bg)', color: 'var(--amber)' }}>
                          ⚠ Kein Profil
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(f.uploaded_at)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a
                          href={`/api/admin/files/${f.id}/download`}
                          download={f.filename}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '0.5px solid var(--blue)', color: 'var(--blue)', textDecoration: 'none' }}
                        >
                          ↓
                        </a>
                        <button
                          onClick={() => setDeleteId(f.id)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}
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
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px' }}>Datei löschen</h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 4px' }}>
              {files.find(f => f.id === deleteId)?.filename}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              von {files.find(f => f.id === deleteId)?.user_email} – wirklich löschen?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteId(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button
                onClick={() => deleteFile(deleteId)}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
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
