import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface PrinterConfig {
  name: string
  api_key: string
  webcam_path: string
  url: string
}

interface PrinterConfigs {
  [key: string]: PrinterConfig
}

interface PrinterStatus {
  id: string
  name: string
  online: boolean
  state: string
}

interface MaintenanceEntry {
  id: number
  action: string
  notes: string | null
  created_at: string
  admin_email: string | null
}

const MAINTENANCE_ACTIONS = [
  'Düse getauscht',
  'Bett eingestellt',
  'Filament gewechselt',
  'Druckbett gereinigt',
  'Software-Update',
  'Sonstiges',
]

export default function PrintersTab() {
  const [configs, setConfigs] = useState<PrinterConfigs>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, { api_key: string; webcam_path: string }>>({})
  const [maintenance, setMaintenance] = useState<Record<string, MaintenanceEntry[]>>({})
  const [maintForm, setMaintForm] = useState<Record<string, { action: string; notes: string }>>({})
  const [maintSaving, setMaintSaving] = useState<string | null>(null)

  const loadMaintenance = (pid: string) => {
    api.get(`/admin/printers/${pid}/maintenance`).then(r => {
      setMaintenance(m => ({ ...m, [pid]: r.data }))
    }).catch(() => {})
  }

  useEffect(() => {
    api.get('/admin/printers/config').then(r => {
      setConfigs(r.data)
      const initial: typeof form = {}
      const maintInit: typeof maintForm = {}
      for (const [pid, cfg] of Object.entries(r.data as PrinterConfigs)) {
        initial[pid] = { api_key: cfg.api_key, webcam_path: cfg.webcam_path }
        maintInit[pid] = { action: MAINTENANCE_ACTIONS[0], notes: '' }
        loadMaintenance(pid)
      }
      setForm(initial)
      setMaintForm(maintInit)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const addMaintenance = async (pid: string) => {
    setMaintSaving(pid)
    try {
      await api.post(`/admin/printers/${pid}/maintenance`, maintForm[pid])
      setMaintForm(m => ({ ...m, [pid]: { action: MAINTENANCE_ACTIONS[0], notes: '' } }))
      loadMaintenance(pid)
    } catch {}
    setMaintSaving(null)
  }

  const save = async (pid: string) => {
    setSaving(pid)
    setSaveMsg(m => ({ ...m, [pid]: '' }))
    try {
      await api.put(`/admin/printers/config/${pid}`, form[pid])
      setSaveMsg(m => ({ ...m, [pid]: 'Gespeichert!' }))
      setTimeout(() => setSaveMsg(m => ({ ...m, [pid]: '' })), 3000)
    } catch (e: any) {
      setSaveMsg(m => ({ ...m, [pid]: e.response?.data?.detail ?? 'Fehler' }))
    } finally {
      setSaving(null)
    }
  }

  const test = async (pid: string) => {
    setTesting(pid)
    setTestResult(r => ({ ...r, [pid]: { ok: false, msg: 'Teste...' } }))
    try {
      const r = await api.get(`/printers/${pid}`)
      const p: PrinterStatus = r.data
      if (p.online) {
        setTestResult(tr => ({ ...tr, [pid]: { ok: true, msg: `Verbunden · Status: ${p.state}` } }))
      } else {
        setTestResult(tr => ({ ...tr, [pid]: { ok: false, msg: `Nicht erreichbar (${p.state})` } }))
      }
    } catch {
      setTestResult(tr => ({ ...tr, [pid]: { ok: false, msg: 'Verbindungsfehler' } }))
    } finally {
      setTesting(null)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Drucker-Konfiguration...</div>

  if (Object.keys(configs).length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Keine konfigurierbaren Drucker vorhanden.</div>
  }

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }
  const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', marginTop: 3 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {Object.entries(configs).map(([pid, cfg]) => (
        <div key={pid} style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{cfg.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>OctoPrint · {cfg.url}</p>
            </div>
            <button
              onClick={() => test(pid)}
              disabled={testing === pid}
              className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 12px', opacity: testing === pid ? 0.5 : 1 }}
            >
              {testing === pid ? 'Teste...' : 'Verbindung testen'}
            </button>
          </div>

          {testResult[pid] && (
            <div style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, background: testResult[pid].ok ? 'var(--emerald-bg)' : 'var(--red-bg)', color: testResult[pid].ok ? 'var(--emerald)' : 'var(--red)' }}>
              {testResult[pid].ok ? '✓ ' : '✗ '}{testResult[pid].msg}
            </div>
          )}

          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>OctoPrint API-Key</label>
              <input
                type="password"
                value={form[pid]?.api_key ?? ''}
                onChange={e => setForm(f => ({ ...f, [pid]: { ...f[pid], api_key: e.target.value } }))}
                placeholder="API-Key aus OctoPrint Settings"
                className="input-lime"
                style={{ fontSize: 13 }}
              />
              <p style={hintStyle}>OctoPrint → Settings → API → Global API Key</p>
            </div>

            <div>
              <label style={labelStyle}>Webcam-Pfad</label>
              <input
                type="text"
                value={form[pid]?.webcam_path ?? ''}
                onChange={e => setForm(f => ({ ...f, [pid]: { ...f[pid], webcam_path: e.target.value } }))}
                placeholder="/printers/crx/webcam"
                className="input-lime"
                style={{ fontSize: 13 }}
              />
              <p style={hintStyle}>nginx-Proxy-Pfad für den Webcam-Stream (leer = kein Webcam)</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => save(pid)}
                disabled={saving === pid}
                className="btn-lime"
                style={{ padding: '8px 16px', fontSize: 13, opacity: saving === pid ? 0.6 : 1 }}
              >
                {saving === pid ? 'Speichert...' : 'Speichern'}
              </button>
              {saveMsg[pid] && (
                <span style={{ fontSize: 13, color: saveMsg[pid] === 'Gespeichert!' ? 'var(--emerald)' : 'var(--red)', fontWeight: 600 }}>
                  {saveMsg[pid]}
                </span>
              )}
            </div>
          </div>

          {/* Wartungsprotokoll */}
          <div style={{ padding: '14px 18px', borderTop: '0.5px solid var(--border)' }}>
            <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text2)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wartungsprotokoll</h4>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <select
                value={maintForm[pid]?.action ?? MAINTENANCE_ACTIONS[0]}
                onChange={e => setMaintForm(m => ({ ...m, [pid]: { ...m[pid], action: e.target.value } }))}
                className="input-lime"
                style={{ fontSize: 12 }}
              >
                {MAINTENANCE_ACTIONS.map(a => <option key={a}>{a}</option>)}
              </select>
              <input
                type="text"
                value={maintForm[pid]?.notes ?? ''}
                onChange={e => setMaintForm(m => ({ ...m, [pid]: { ...m[pid], notes: e.target.value } }))}
                placeholder="Notiz (optional)"
                className="input-lime"
                style={{ flex: 1, fontSize: 12 }}
              />
              <button
                onClick={() => addMaintenance(pid)}
                disabled={maintSaving === pid}
                className="btn-lime"
                style={{ fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap', opacity: maintSaving === pid ? 0.5 : 1 }}
              >
                {maintSaving === pid ? '...' : 'Eintragen'}
              </button>
            </div>
            {(maintenance[pid] ?? []).slice(0, 5).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(maintenance[pid] ?? []).slice(0, 5).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', fontSize: 12, background: 'var(--surface2)', borderRadius: 8, padding: '7px 10px', color: 'var(--text2)' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{e.action}</span>
                      {e.notes && <span style={{ color: 'var(--text3)' }}> · {e.notes}</span>}
                    </div>
                    <span style={{ color: 'var(--text3)', whiteSpace: 'nowrap', marginLeft: 8, fontSize: 11 }}>
                      {new Date(e.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Noch keine Einträge.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
