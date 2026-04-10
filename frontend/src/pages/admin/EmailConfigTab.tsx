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

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }

  const field = (key: keyof EmailConfig, label: string, type = 'text', placeholder = '') => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
        placeholder={placeholder}
        className="input-lime"
        style={{ fontSize: 13 }}
      />
    </div>
  )

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Konfiguration...</div>

  return (
    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>E-Mail-Benachrichtigungen</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Aktiviert</span>
            <div
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              style={{ width: 40, height: 22, borderRadius: 11, transition: 'background 0.2s', cursor: 'pointer', background: form.enabled ? 'var(--lime)' : 'var(--border)', position: 'relative' }}
            >
              <div style={{ position: 'absolute', top: 3, left: form.enabled ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
            </div>
          </label>
        </div>

        <div style={{ background: 'var(--blue-bg)', border: '0.5px solid var(--blue)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--blue)', marginBottom: 14 }}>
          <span style={{ fontWeight: 700 }}>Eigener Postfix-Server:</span> Host = <code style={{ fontFamily: 'var(--mono)' }}>localhost</code>, Port = <code style={{ fontFamily: 'var(--mono)' }}>25</code>, kein Benutzername, STARTTLS und SSL deaktivieren.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {field('smtp_host', 'SMTP-Server', 'text', 'localhost')}
          {field('smtp_port', 'SMTP-Port', 'number', '25')}
          {field('smtp_user', 'Benutzername', 'text', 'portal@example.com')}
          {field('smtp_password', 'Passwort (leer = unverändert)', 'password')}
          {field('from_address', 'Absenderadresse', 'email', 'portal@example.com')}

          <div style={{ display: 'flex', gap: 20, paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.use_tls}
                onChange={e => setForm(f => ({ ...f, use_tls: e.target.checked }))}
                style={{ accentColor: 'var(--lime)' }}
              />
              <span style={{ color: 'var(--text2)' }}>STARTTLS</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.use_ssl}
                onChange={e => setForm(f => ({ ...f, use_ssl: e.target.checked }))}
                style={{ accentColor: 'var(--lime)' }}
              />
              <span style={{ color: 'var(--text2)' }}>SSL/TLS (Port 465)</span>
            </label>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 14, fontSize: 13, padding: '8px 12px', borderRadius: 10, background: msg.type === 'success' ? 'var(--emerald-bg)' : 'var(--red-bg)', color: msg.type === 'success' ? 'var(--emerald)' : 'var(--red)' }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={saving} className="btn-lime" style={{ padding: '9px 18px', fontSize: 13 }}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
          <button
            onClick={test}
            disabled={testing || !form.enabled}
            title={!form.enabled ? 'E-Mail muss aktiviert sein' : ''}
            className="btn-secondary"
            style={{ padding: '9px 18px', fontSize: 13, opacity: (!form.enabled || testing) ? 0.4 : 1 }}
          >
            {testing ? 'Sende...' : 'Test-Mail senden'}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--blue-bg)', border: '0.5px solid var(--blue)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--blue)' }}>
        <p style={{ fontWeight: 700, margin: '0 0 6px' }}>Was wird benachrichtigt?</p>
        <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8, fontSize: 12, opacity: 0.9 }}>
          <li>Warteschlange: wenn Nutzer an der Reihe ist (5-Min-Fenster)</li>
          <li>Druck fertig: wenn Druck abgeschlossen (24h Abholzeit)</li>
          <li>Aufladeantrag genehmigt/abgelehnt</li>
        </ul>
      </div>
    </div>
  )
}
