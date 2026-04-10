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

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { access_token } = res.data
      const meRes = await api.get('/user/me', { headers: { Authorization: `Bearer ${access_token}` } })
      setAuth(access_token, meRes.data)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Anmeldung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', padding: 32, width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <PrinterIcon />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>3D-Portal</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>Schülerfirma Anmeldung</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>E-Mail</span>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="dein@name.de" autoComplete="email"
              className="input-lime"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Passwort</span>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••" autoComplete="current-password"
              className="input-lime"
            />
          </label>

          {error && (
            <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-lime" style={{ padding: '12px 20px', fontSize: 15, width: '100%' }}>
            {loading ? 'Anmeldung...' : 'Anmelden'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', marginTop: 16, marginBottom: 0 }}>
          Noch kein Account?{' '}
          <Link to="/registrieren" style={{ color: 'var(--lime-dark)', fontWeight: 700, textDecoration: 'none' }}>Registrieren</Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
          Passwort vergessen? Bitte Admin kontaktieren.
        </p>
      </div>
    </div>
  )
}
