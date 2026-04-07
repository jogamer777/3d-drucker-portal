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

export default function PrintersTab() {
  const [configs, setConfigs] = useState<PrinterConfigs>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, { api_key: string; webcam_path: string }>>({})

  useEffect(() => {
    api.get('/admin/printers/config').then(r => {
      setConfigs(r.data)
      const initial: typeof form = {}
      for (const [pid, cfg] of Object.entries(r.data as PrinterConfigs)) {
        initial[pid] = { api_key: cfg.api_key, webcam_path: cfg.webcam_path }
      }
      setForm(initial)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

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
        </div>
      ))}
    </div>
  )
}
