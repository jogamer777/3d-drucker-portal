import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../stores/authStore'

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

    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein')
      return
    }
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/register', { email, password })
      const { access_token } = res.data

      const meRes = await api.get('/user/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      setAuth(access_token, meRes.data)
      navigate('/')
    } catch (err: any) {
      if (err.response?.status === 403) {
        setClosed(true)
      } else {
        setError(err.response?.data?.detail || 'Registrierung fehlgeschlagen')
      }
    } finally {
      setLoading(false)
    }
  }

  if (closed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Registrierung geschlossen</h1>
          <p className="text-sm text-gray-500 mb-4">
            Die Registrierung ist derzeit nicht möglich. Bitte wende dich an einen Administrator.
          </p>
          <Link to="/login" className="text-sm text-blue-600 hover:underline">
            Zur Anmeldung →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🖨️</div>
          <h1 className="text-xl font-semibold text-gray-900">Account erstellen</h1>
          <p className="text-sm text-gray-500 mt-1">3D-Drucker-Portal</p>
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
              placeholder="Mindestens 8 Zeichen"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              autoComplete="new-password"
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
            {loading ? 'Registrierung...' : 'Account erstellen'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Bereits registriert?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
