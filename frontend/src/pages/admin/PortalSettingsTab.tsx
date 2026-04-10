import { useState, useEffect } from 'react'
import api from '../../lib/api'

export default function PortalSettingsTab() {
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [portalUrl, setPortalUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get('/admin/portal-config')
      .then(r => {
        setRegistrationOpen(r.data.registration_open)
        setPortalUrl(r.data.portal_url ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (newRegOpen?: boolean) => {
    if (registrationOpen === null) return
    setSaving(true)
    setMsg(null)
    const regOpen = newRegOpen ?? registrationOpen
    try {
      await api.put('/admin/portal-config', { registration_open: regOpen, portal_url: portalUrl })
      if (newRegOpen !== undefined) setRegistrationOpen(newRegOpen)
      setMsg({
        type: 'success',
        text: newRegOpen !== undefined
          ? (newRegOpen ? 'Registrierung ist jetzt offen.' : 'Registrierung ist jetzt geschlossen.')
          : 'Einstellungen gespeichert.',
      })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Einstellungen...</div>

  return (
    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Registrierungs-Steuerung */}
      <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '18px 20px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 4px' }}>Nutzer-Registrierung</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px' }}>
          Steuert, ob neue Nutzer sich registrieren können. Wenn geschlossen, sehen Besucher eine Meldung.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>
              {registrationOpen ? 'Registrierung offen' : 'Registrierung geschlossen'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
              {registrationOpen
                ? 'Jeder kann sich registrieren'
                : 'Nur bestehende Nutzer können sich einloggen'}
            </p>
          </div>
          <button
            onClick={() => save(!registrationOpen)}
            disabled={saving}
            style={{
              position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: registrationOpen ? 'var(--lime)' : 'var(--border)',
              transition: 'background 0.2s', opacity: saving ? 0.5 : 1,
            }}
          >
            <span style={{
              position: 'absolute', top: 4, left: registrationOpen ? 22 : 4,
              width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', display: 'block'
            }} />
          </button>
        </div>

        {!registrationOpen && (
          <div style={{ marginTop: 14, background: 'var(--amber-bg)', border: '0.5px solid var(--amber)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--amber)' }}>
            Registrierung ist geschlossen. Neue Nutzer werden abgewiesen.
          </div>
        )}
      </div>

      {/* Portal-URL */}
      <div style={{ background: '#fff', borderRadius: 14, border: '0.5px solid var(--border)', padding: '18px 20px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 4px' }}>Portal-URL</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 12px' }}>
          Basis-URL des Portals. Wird in E-Mail-Benachrichtigungen als Link verwendet.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={portalUrl}
            onChange={e => setPortalUrl(e.target.value)}
            placeholder="https://172.17.129.228"
            className="input-lime"
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            onClick={() => save()}
            disabled={saving}
            className="btn-lime"
            style={{ padding: '9px 16px', fontSize: 13, whiteSpace: 'nowrap' }}
          >
            {saving ? 'Speichert...' : 'Speichern'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Ohne abschließenden Schrägstrich, z.B. https://drucker.schule.de</p>
      </div>

      {msg && (
        <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 10, background: msg.type === 'success' ? 'var(--emerald-bg)' : 'var(--red-bg)', color: msg.type === 'success' ? 'var(--emerald)' : 'var(--red)' }}>
          {msg.text}
        </div>
      )}

      {/* Info-Karte */}
      <div style={{ background: 'var(--blue-bg)', border: '0.5px solid var(--blue)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--blue)' }}>
        <p style={{ fontWeight: 700, margin: '0 0 6px' }}>Weitere Portal-Einstellungen</p>
        <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8, fontSize: 12, opacity: 0.9 }}>
          <li>E-Mail-Konfiguration → Tab "E-Mail"</li>
          <li>Drucker-Einstellungen → Tab "Drucker"</li>
          <li>Nutzer-Guthaben → Tab "Nutzer"</li>
        </ul>
      </div>
    </div>
  )
}
