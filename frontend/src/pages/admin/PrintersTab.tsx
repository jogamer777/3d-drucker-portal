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

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Lade Drucker-Konfiguration...</div>

  if (Object.keys(configs).length === 0) {
    return <div className="text-sm text-gray-500 py-8 text-center">Keine konfigurierbaren Drucker vorhanden.</div>
  }

  return (
    <div className="space-y-6">
      {Object.entries(configs).map(([pid, cfg]) => (
        <div key={pid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{cfg.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">OctoPrint · {cfg.url}</p>
            </div>
            <button
              onClick={() => test(pid)}
              disabled={testing === pid}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-600"
            >
              {testing === pid ? 'Teste...' : 'Verbindung testen'}
            </button>
          </div>

          {testResult[pid] && (
            <div className={`px-5 py-2 text-xs font-medium ${testResult[pid].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult[pid].ok ? '✓ ' : '✗ '}{testResult[pid].msg}
            </div>
          )}

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">OctoPrint API-Key</label>
              <input
                type="password"
                value={form[pid]?.api_key ?? ''}
                onChange={e => setForm(f => ({ ...f, [pid]: { ...f[pid], api_key: e.target.value } }))}
                placeholder="API-Key aus OctoPrint Settings"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                OctoPrint → Settings → API → Global API Key
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Webcam-Pfad</label>
              <input
                type="text"
                value={form[pid]?.webcam_path ?? ''}
                onChange={e => setForm(f => ({ ...f, [pid]: { ...f[pid], webcam_path: e.target.value } }))}
                placeholder="/printers/crx/webcam"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                nginx-Proxy-Pfad für den Webcam-Stream (leer = kein Webcam)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => save(pid)}
                disabled={saving === pid}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {saving === pid ? 'Speichert...' : 'Speichern'}
              </button>
              {saveMsg[pid] && (
                <span className={`text-sm ${saveMsg[pid] === 'Gespeichert!' ? 'text-green-600' : 'text-red-600'}`}>
                  {saveMsg[pid]}
                </span>
              )}
            </div>
          </div>

          {/* Wartungsprotokoll */}
          <div className="px-5 py-4 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Wartungsprotokoll</h4>
            <div className="flex gap-2 mb-3">
              <select
                value={maintForm[pid]?.action ?? MAINTENANCE_ACTIONS[0]}
                onChange={e => setMaintForm(m => ({ ...m, [pid]: { ...m[pid], action: e.target.value } }))}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MAINTENANCE_ACTIONS.map(a => <option key={a}>{a}</option>)}
              </select>
              <input
                type="text"
                value={maintForm[pid]?.notes ?? ''}
                onChange={e => setMaintForm(m => ({ ...m, [pid]: { ...m[pid], notes: e.target.value } }))}
                placeholder="Notiz (optional)"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => addMaintenance(pid)}
                disabled={maintSaving === pid}
                className="text-sm bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg whitespace-nowrap"
              >
                {maintSaving === pid ? '...' : 'Eintragen'}
              </button>
            </div>
            {(maintenance[pid] ?? []).slice(0, 5).length > 0 ? (
              <div className="space-y-1.5">
                {(maintenance[pid] ?? []).slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-start justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium">{e.action}</span>
                      {e.notes && <span className="text-gray-400"> · {e.notes}</span>}
                    </div>
                    <span className="text-gray-400 whitespace-nowrap ml-2">
                      {new Date(e.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Noch keine Einträge.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
