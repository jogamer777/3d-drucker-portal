import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

export default function Settings() {
  const { user } = useAuthStore()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (newPw.length < 8) { setMsg({ type: 'error', text: 'Neues Passwort muss mindestens 8 Zeichen haben.' }); return }
    if (newPw !== confirmPw) { setMsg({ type: 'error', text: 'Passwörter stimmen nicht überein.' }); return }
    setLoading(true)
    try {
      await api.patch('/user/me', { current_password: currentPw, new_password: newPw })
      setMsg({ type: 'success', text: 'Passwort erfolgreich geändert.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler beim Ändern des Passworts.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Einstellungen</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>{user?.email}</p>
      </div>

      <div style={{ maxWidth: 440 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 18px' }}>Passwort ändern</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Aktuelles Passwort</span>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className="input-lime" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Neues Passwort</span>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8} className="input-lime" />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Mindestens 8 Zeichen</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Neues Passwort bestätigen</span>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className="input-lime" />
            </label>

            {msg && (
              <div style={{
                borderRadius: 10, padding: '10px 14px', fontSize: 13,
                background: msg.type === 'success' ? 'var(--emerald-bg)' : 'var(--red-bg)',
                color: msg.type === 'success' ? 'var(--emerald)' : 'var(--red)',
              }}>
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-lime" style={{ padding: '12px 20px', fontSize: 14, width: '100%' }}>
              {loading ? 'Speichern...' : 'Passwort ändern'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
