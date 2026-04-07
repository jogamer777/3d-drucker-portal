import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface EmailConfig {
  enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  from_address: string
  use_tls: boolean
  use_ssl: boolean
}

const DEFAULT: EmailConfig = {
  enabled: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  from_address: '',
  use_tls: true,
  use_ssl: false,
}

export default function EmailConfigTab() {
  const [form, setForm] = useState<EmailConfig>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get('/admin/email-config')
      .then(r => setForm({ ...DEFAULT, ...r.data, smtp_password: '' }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await api.put('/admin/email-config', form)
      setMsg({ type: 'success', text: 'Konfiguration gespeichert.' })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler beim Speichern.' })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setMsg(null)
    try {
      await api.post('/admin/email-config/test')
      setMsg({ type: 'success', text: 'Test-Mail gesendet! Bitte E-Mail-Postfach prüfen.' })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler beim Senden.' })
    } finally {
      setTesting(false)
    }
  }

  const field = (key: keyof EmailConfig, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Lade Konfiguration...</div>

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">E-Mail-Benachrichtigungen</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Aktiviert</span>
            <div
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${form.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>

        <div className="space-y-3">
          {field('smtp_host', 'SMTP-Server', 'text', 'mail.example.com')}
          {field('smtp_port', 'SMTP-Port', 'number', '587')}
          {field('smtp_user', 'Benutzername', 'text', 'portal@example.com')}
          {field('smtp_password', 'Passwort (leer = unverändert)', 'password')}
          {field('from_address', 'Absenderadresse', 'email', 'portal@example.com')}

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.use_tls}
                onChange={e => setForm(f => ({ ...f, use_tls: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-600">STARTTLS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.use_ssl}
                onChange={e => setForm(f => ({ ...f, use_ssl: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-600">SSL/TLS (Port 465)</span>
            </label>
          </div>
        </div>

        {msg && (
          <div className={`mt-4 text-sm px-3 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
          <button
            onClick={test}
            disabled={testing || !form.enabled}
            title={!form.enabled ? 'E-Mail muss aktiviert sein' : ''}
            className="border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-600 text-sm px-4 py-2 rounded-lg"
          >
            {testing ? 'Sende...' : 'Test-Mail senden'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">Was wird benachrichtigt?</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600">
          <li>Warteschlange: wenn Nutzer an der Reihe ist (5-Min-Fenster)</li>
          <li>Druck fertig: wenn Druck abgeschlossen (24h Abholzeit)</li>
          <li>Aufladeantrag genehmigt/abgelehnt</li>
        </ul>
      </div>
    </div>
  )
}
