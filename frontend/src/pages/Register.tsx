import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'

const PrinterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="12" height="5" rx="1" />
    <rect x="4" y="12" width="12" height="6" rx="1" />
    <path d="M3 7h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="15.5" cy="10.5" r="0.75" fill="#111" />
  </svg>
)

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [closed, setClosed] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwörter stimmen nicht überein'); return }
    if (password.length < 8) { setError('Passwort muss mindestens 8 Zeichen haben'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/register', { email, password })
      const { access_token } = res.data
      const meRes = await api.get('/user/me', { headers: { Authorization: `Bearer ${access_token}` } })
      setAuth(access_token, meRes.data)
      navigate('/')
    } catch (err: any) {
      if (err.response?.status === 403) setClosed(true)
      else setError(err.response?.data?.detail || 'Registrierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    background: '#fff',
    borderRadius: 16,
    border: '0.5px solid var(--border)',
    padding: 32,
    width: '100%',
    maxWidth: 380,
  }

  const wrapStyle = {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 16px',
  }

  if (closed) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <svg style={{ margin: '0 auto 12px', display: 'block' }} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Registrierung geschlossen</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px' }}>
            Die Registrierung ist derzeit nicht möglich. Bitte wende dich an einen Administrator.
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--lime-dark)', fontWeight: 700, textDecoration: 'none' }}>
            Zur Anmeldung →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <PrinterIcon />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Account erstellen</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>3D-Portal</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>E-Mail</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="dein@name.de" autoComplete="email" className="input-lime" />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Passwort</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Mindestens 8 Zeichen" autoComplete="new-password" className="input-lime" />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Passwort bestätigen</span>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" autoComplete="new-password" className="input-lime" />
          </label>

          {error && (
            <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-lime" style={{ padding: '12px 20px', fontSize: 15, width: '100%' }}>
            {loading ? 'Registrierung...' : 'Account erstellen'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', marginTop: 16, marginBottom: 0 }}>
          Bereits registriert?{' '}
          <Link to="/login" style={{ color: 'var(--lime-dark)', fontWeight: 700, textDecoration: 'none' }}>Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
