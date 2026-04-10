import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface ActivityLog {
  id: number
  actor_email: string | null
  action: string
  details: string | null
  created_at: string
}

type Filter = 'all' | 'register' | 'login' | 'login_failed' | 'voucher_redeem' | 'file_upload' | 'file_delete'

function actionBadgeStyle(action: string): React.CSSProperties {
  if (action === 'register') return { background: 'var(--blue-bg)', color: 'var(--blue)' }
  if (action === 'login') return { background: 'var(--emerald-bg)', color: 'var(--emerald)' }
  if (action === 'login_failed') return { background: 'var(--red-bg)', color: 'var(--red)' }
  if (action === 'voucher_redeem') return { background: '#f3e8ff', color: '#7c3aed' }
  if (action === 'file_upload') return { background: '#e0e7ff', color: '#4338ca' }
  if (action === 'file_delete' || action === 'admin_file_delete') return { background: 'var(--amber-bg)', color: 'var(--amber)' }
  return { background: 'var(--surface2)', color: 'var(--text3)' }
}

const ACTION_LABELS: Record<string, string> = {
  register: 'Registrierung',
  login: 'Login',
  login_failed: 'Login fehlgesch.',
  voucher_redeem: 'Code eingelöst',
  file_upload: 'Datei hochgeladen',
  file_delete: 'Datei gelöscht',
  admin_file_delete: 'Admin: Datei gelöscht',
}

export default function ActivityTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/admin/activity').then(r => setLogs(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.action !== filter) return false
    if (search && !l.actor_email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const count = (action: string) => logs.filter(l => l.action === action).length

  const pillBtn = (active: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: active ? '#111' : 'var(--surface2)', color: active ? '#fff' : 'var(--text2)', fontWeight: active ? 700 : 500 }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {pillBtn(filter === 'all', () => setFilter('all'), `Alle (${logs.length})`)}
          {pillBtn(filter === 'register', () => setFilter('register'), `Registrierung (${count('register')})`)}
          {pillBtn(filter === 'login', () => setFilter('login'), `Login (${count('login')})`)}
          {pillBtn(filter === 'login_failed', () => setFilter('login_failed'), `Fehlschlag (${count('login_failed')})`)}
          {pillBtn(filter === 'voucher_redeem', () => setFilter('voucher_redeem'), `Code eingelöst (${count('voucher_redeem')})`)}
          {pillBtn(filter === 'file_upload', () => setFilter('file_upload'), `Upload (${count('file_upload')})`)}
          {pillBtn(filter === 'file_delete', () => setFilter('file_delete'), `Datei gelöscht (${count('file_delete')})`)}
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="E-Mail suchen..."
          className="input-lime"
          style={{ marginLeft: 'auto', fontSize: 12, width: 180 }}
        />
        <button onClick={load} style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Aktualisieren</button>
        <a
          href="/api/admin/activity/export"
          download
          className="btn-secondary"
          style={{ fontSize: 12, padding: '6px 10px', textDecoration: 'none' }}
        >
          CSV exportieren
        </a>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Laden...</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Keine Einträge gefunden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Datum & Uhrzeit', 'Nutzer', 'Aktion', 'Details'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{formatDate(log.created_at)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{log.actor_email ?? '–'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, ...actionBadgeStyle(log.action) }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{log.details ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
