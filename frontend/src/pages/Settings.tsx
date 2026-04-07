import { useState } from 'react'
import { Link } from 'react-router-dom'
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

    if (newPw.length < 8) {
      setMsg({ type: 'error', text: 'Neues Passwort muss mindestens 8 Zeichen haben.' })
      return
    }
    if (newPw !== confirmPw) {
      setMsg({ type: 'error', text: 'Passwörter stimmen nicht überein.' })
      return
    }

    setLoading(true)
    try {
      await api.patch('/user/me', {
        current_password: currentPw,
        new_password: newPw,
      })
      setMsg({ type: 'success', text: 'Passwort erfolgreich geändert.' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.detail ?? 'Fehler beim Ändern des Passworts.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Einstellungen</h1>
          <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
        </div>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
      </div>

      <div className="max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Passwort ändern</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aktuelles Passwort
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neues Passwort
              </label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                minLength={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Mindestens 8 Zeichen</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neues Passwort bestätigen
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {msg && (
              <div className={`text-sm px-3 py-2 rounded-lg ${
                msg.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Speichern...' : 'Passwort ändern'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
