import { useState, useEffect } from 'react'
import api from '../../lib/api'

export default function PortalSettingsTab() {
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get('/admin/portal-config')
      .then(r => setRegistrationOpen(r.data.registration_open))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = async () => {
    if (registrationOpen === null) return
    const newValue = !registrationOpen
    setSaving(true)
    setMsg(null)
    try {
      await api.put('/admin/portal-config', { registration_open: newValue })
      setRegistrationOpen(newValue)
      setMsg({
        type: 'success',
        text: newValue ? 'Registrierung ist jetzt offen.' : 'Registrierung ist jetzt geschlossen.',
      })
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Lade Einstellungen...</div>

  return (
    <div className="max-w-lg space-y-6">
      {/* Registrierungs-Steuerung */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Nutzer-Registrierung</h3>
        <p className="text-sm text-gray-500 mb-4">
          Steuert, ob neue Nutzer sich registrieren können. Wenn geschlossen, sehen Besucher eine Meldung.
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {registrationOpen ? 'Registrierung offen' : 'Registrierung geschlossen'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {registrationOpen
                ? 'Jeder kann sich registrieren'
                : 'Nur bestehende Nutzer können sich einloggen'}
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={saving}
            className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
              registrationOpen ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              registrationOpen ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {!registrationOpen && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
            ⚠️ Registrierung ist geschlossen. Neue Nutzer werden abgewiesen.
          </div>
        )}

        {msg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Info-Karte */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">Weitere Portal-Einstellungen</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600">
          <li>E-Mail-Konfiguration → Tab "E-Mail"</li>
          <li>Drucker-Einstellungen → Tab "Drucker"</li>
          <li>Nutzer-Guthaben → Tab "Nutzer"</li>
        </ul>
      </div>
    </div>
  )
}
