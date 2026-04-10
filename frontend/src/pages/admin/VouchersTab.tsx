import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface Voucher {
  id: number
  code: string
  value_cents: number
  status: 'open' | 'redeemed' | 'cancelled'
  created_at: string
  redeemed_at: string | null
  redeemed_by_email: string | null
}

const PRESET_VALUES = [500, 1000, 2000]

export default function VouchersTab() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [valueCents, setValueCents] = useState(1000)
  const [customValue, setCustomValue] = useState('')
  const [count, setCount] = useState(1)
  const [creating, setCreating] = useState(false)
  const [newVouchers, setNewVouchers] = useState<Voucher[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'redeemed' | 'cancelled'>('all')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const [editModal, setEditModal] = useState<Voucher | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteModal, setDeleteModal] = useState<Voucher | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/vouchers').then(r => setVouchers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const effectiveValue = customValue ? Math.round(parseFloat(customValue) * 100) : valueCents

  const createVouchers = async (e: React.FormEvent) => {
    e.preventDefault()
    if (effectiveValue <= 0 || count < 1) return
    setCreating(true)
    try {
      const res = await api.post('/vouchers', { value_cents: effectiveValue, count })
      setNewVouchers(res.data)
      load()
    } finally {
      setCreating(false)
    }
  }

  const patchVoucher = async (id: number, patch: object) => {
    setActionLoading(id)
    try {
      await api.patch(`/vouchers/${id}`, patch)
      load()
    } finally {
      setActionLoading(null)
    }
  }

  const deleteVoucher = async () => {
    if (!deleteModal) return
    setActionLoading(deleteModal.id)
    try {
      await api.delete(`/vouchers/${deleteModal.id}`)
      setVouchers(prev => prev.filter(v => v.id !== deleteModal.id))
      setDeleteModal(null)
    } finally {
      setActionLoading(null)
    }
  }

  const saveEditValue = async () => {
    if (!editModal) return
    const cents = Math.round(parseFloat(editValue) * 100)
    if (!cents || cents <= 0) return
    await patchVoucher(editModal.id, { value_cents: cents })
    setEditModal(null)
  }

  const printVouchers = (list: Voucher[]) => {
    const fmt = (c: number) => (c / 100).toFixed(2) + ' €'
    const cards = list.map(v => `
      <div class="card">
        <div class="portal-name">🖨️ 3D-Drucker-Portal</div>
        <div class="label">Gutschein-Code</div>
        <div class="code">${v.code}</div>
        <div class="value">${fmt(v.value_cents)}</div>
        <div class="hint">Einlösbar unter: Mein Guthaben → Code einlösen</div>
      </div>
    `).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Gutscheine drucken</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:white}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;padding:10mm}
      .card{border:2px dashed #555;border-radius:8px;padding:6mm;text-align:center;height:55mm;display:flex;flex-direction:column;justify-content:center;gap:3mm;page-break-inside:avoid}
      .portal-name{font-size:11px;color:#666}.label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px}
      .code{font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px;color:#111}
      .value{font-size:22px;font-weight:bold;color:#1d4ed8}.hint{font-size:9px;color:#aaa}
      @media print{body{margin:0}.no-print{display:none}}
    </style></head><body>
      <div class="no-print" style="padding:12px;background:#f3f4f6;display:flex;gap:8px;">
        <button onclick="window.print()" style="background:#1d4ed8;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Drucken</button>
        <button onclick="window.close()" style="background:#6b7280;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Schließen</button>
        <span style="line-height:2;color:#555;">${list.length} Gutschein(e)</span>
      </div>
      <div class="grid">${cards}</div>
    </body></html>`)
    win.document.close()
  }

  const formatBalance = (cents: number) => (cents / 100).toFixed(2) + ' €'
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

  const statusBadge = (v: Voucher) => {
    if (v.status === 'open') return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--blue-bg)', color: 'var(--blue)' }}>Offen</span>
    if (v.status === 'redeemed') return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--surface2)', color: 'var(--text3)' }}>Eingelöst</span>
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)' }}>Gesperrt</span>
  }

  const filtered = vouchers.filter(v => filter === 'all' || v.status === filter)
  const openVouchers = vouchers.filter(v => v.status === 'open')

  const pillBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      style={{ padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: active ? '#111' : 'var(--surface2)', color: active ? '#fff' : 'var(--text2)', fontWeight: active ? 700 : 500 }}
    >{label}</button>
  )

  const modalStyle = { background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Erstellen */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', border: '0.5px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 12px' }}>Gutscheine erstellen</h3>
        <form onSubmit={createVouchers} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Wert</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESET_VALUES.map(v => (
                <button key={v} type="button"
                  onClick={() => { setValueCents(v); setCustomValue('') }}
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    border: effectiveValue === v && !customValue ? '1.5px solid var(--lime)' : '0.5px solid var(--border)',
                    background: effectiveValue === v && !customValue ? 'var(--lime-bg)' : '#fff',
                    fontWeight: effectiveValue === v && !customValue ? 800 : 500,
                  }}
                >{formatBalance(v)}</button>
              ))}
              <input type="number" value={customValue} onChange={e => setCustomValue(e.target.value)}
                placeholder="Betrag €" min="0.01" step="0.01"
                className="input-lime" style={{ width: 90, fontSize: 12 }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Anzahl (1–100)</label>
            <input type="number" value={count}
              onChange={e => setCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
              min={1} max={100} className="input-lime" style={{ width: 70, fontSize: 12 }}
            />
          </div>
          <button type="submit" disabled={creating || effectiveValue <= 0} className="btn-lime" style={{ padding: '8px 16px', fontSize: 13 }}>
            {creating ? 'Erstelle...' : 'Erstellen'}
          </button>
        </form>

        {newVouchers.length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--emerald-bg)', border: '0.5px solid var(--emerald)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald)', margin: 0 }}>{newVouchers.length} Code(s) erstellt</p>
              <button onClick={() => printVouchers(newVouchers)}
                style={{ fontSize: 11, background: 'var(--emerald)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              >🖨️ Drucken</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {newVouchers.map(v => (
                <code key={v.id} style={{ background: '#fff', border: '0.5px solid var(--emerald)', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                  {v.code} ({formatBalance(v.value_cents)})
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Liste */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {pillBtn(filter === 'all', () => setFilter('all'), `Alle (${vouchers.length})`)}
            {pillBtn(filter === 'open', () => setFilter('open'), `Offen (${openVouchers.length})`)}
            {pillBtn(filter === 'redeemed', () => setFilter('redeemed'), `Eingelöst (${vouchers.filter(v => v.status === 'redeemed').length})`)}
            {pillBtn(filter === 'cancelled', () => setFilter('cancelled'), `Gesperrt (${vouchers.filter(v => v.status === 'cancelled').length})`)}
          </div>
          {openVouchers.length > 0 && (
            <button onClick={() => printVouchers(openVouchers)}
              className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }}
            >🖨️ Alle offenen drucken</button>
          )}
        </div>

        {loading ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Laden...</p> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                {['Code', 'Wert', 'Status', 'Eingelöst von', 'Datum', 'Aktionen'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{v.code}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>{formatBalance(v.value_cents)}</td>
                  <td style={{ padding: '8px 12px' }}>{statusBadge(v)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>{v.redeemed_by_email ?? '–'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>{formatDate(v.redeemed_at ?? v.created_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {v.status === 'open' && (
                        <>
                          <button onClick={() => { setEditModal(v); setEditValue((v.value_cents / 100).toFixed(2)) }} disabled={actionLoading === v.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>Wert</button>
                          <button onClick={() => patchVoucher(v.id, { status: 'cancelled' })} disabled={actionLoading === v.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--amber)', background: 'transparent', color: 'var(--amber)' }}>Sperren</button>
                          <button onClick={() => setDeleteModal(v)} disabled={actionLoading === v.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}>Löschen</button>
                        </>
                      )}
                      {v.status === 'cancelled' && (
                        <>
                          <button onClick={() => patchVoucher(v.id, { status: 'open' })} disabled={actionLoading === v.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--emerald)', background: 'transparent', color: 'var(--emerald)' }}>Entsperren</button>
                          <button onClick={() => setDeleteModal(v)} disabled={actionLoading === v.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--red)', background: 'transparent', color: 'var(--red)' }}>Löschen</button>
                        </>
                      )}
                      {v.status === 'redeemed' && (
                        <button onClick={() => patchVoucher(v.id, { status: 'open' })} disabled={actionLoading === v.id}
                          title="Guthaben wird NICHT automatisch angepasst"
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--blue)', background: 'transparent', color: 'var(--blue)' }}>Zurücksetzen</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Wert-ändern Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={modalStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Wert ändern</h3>
            <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', margin: '0 0 14px' }}>{editModal.code}</p>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Neuer Wert (€)</label>
            <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} min="0.01" step="0.01"
              className="input-lime" style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button onClick={saveEditValue} disabled={!editValue || parseFloat(editValue) <= 0} className="btn-lime" style={{ flex: 1, padding: '9px 0' }}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={modalStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Code löschen</h3>
            <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', margin: '0 0 10px' }}>{deleteModal.code}</p>
            <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 20 }}>Dieser Code wird endgültig gelöscht und kann nicht wiederhergestellt werden.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteModal(null)} className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>Abbrechen</button>
              <button onClick={deleteVoucher} disabled={actionLoading === deleteModal.id}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
