import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'

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

      // Profil laden
      const meRes = await api.get('/user/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      setAuth(access_token, meRes.data)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Anmeldung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🖨️</div>
          <h1 className="text-xl font-semibold text-gray-900">3D-Drucker-Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Schülerfirma Anmeldung</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="dein@name.de"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Anmeldung...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Noch kein Account?{' '}
          <Link to="/registrieren" className="text-blue-600 hover:underline">Registrieren</Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          Passwort vergessen? Bitte Admin kontaktieren.
        </p>
      </div>
    </div>
  )
}
