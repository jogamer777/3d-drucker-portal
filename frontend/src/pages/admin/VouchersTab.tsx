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

  // Wert-ändern Modal
  const [editModal, setEditModal] = useState<Voucher | null>(null)
  const [editValue, setEditValue] = useState('')

  // Löschen Modal
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
    if (v.status === 'open') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Offen</span>
    if (v.status === 'redeemed') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Eingelöst</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Gesperrt</span>
  }

  const filtered = vouchers.filter(v => filter === 'all' || v.status === filter)
  const openVouchers = vouchers.filter(v => v.status === 'open')

  return (
    <div className="space-y-6">
      {/* Erstellen */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Gutscheine erstellen</h3>
        <form onSubmit={createVouchers} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Wert</label>
            <div className="flex gap-1">
              {PRESET_VALUES.map(v => (
                <button key={v} type="button"
                  onClick={() => { setValueCents(v); setCustomValue('') }}
                  className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                    effectiveValue === v && !customValue
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >{formatBalance(v)}</button>
              ))}
              <input type="number" value={customValue} onChange={e => setCustomValue(e.target.value)}
                placeholder="Betrag €" min="0.01" step="0.01"
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Anzahl (1–100)</label>
            <input type="number" value={count}
              onChange={e => setCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
              min={1} max={100} className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button type="submit" disabled={creating || effectiveValue <= 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
          >{creating ? 'Erstelle...' : 'Erstellen'}</button>
        </form>

        {newVouchers.length > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-green-800">{newVouchers.length} Code(s) erstellt</p>
              <button onClick={() => printVouchers(newVouchers)}
                className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1 rounded"
              >🖨️ Drucken</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {newVouchers.map(v => (
                <code key={v.id} className="bg-white border border-green-300 rounded px-2 py-1 text-sm font-mono">
                  {v.code} ({formatBalance(v.value_cents)})
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Liste */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2 flex-wrap">
            {([
              ['all', `Alle (${vouchers.length})`],
              ['open', `Offen (${openVouchers.length})`],
              ['redeemed', `Eingelöst (${vouchers.filter(v => v.status === 'redeemed').length})`],
              ['cancelled', `Gesperrt (${vouchers.filter(v => v.status === 'cancelled').length})`],
            ] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >{label}</button>
            ))}
          </div>
          {openVouchers.length > 0 && (
            <button onClick={() => printVouchers(openVouchers)}
              className="text-xs border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 text-gray-700"
            >🖨️ Alle offenen drucken</button>
          )}
        </div>

        {loading ? <p className="text-sm text-gray-400">Laden...</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium">Wert</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Eingelöst von</th>
                <th className="pb-2 font-medium">Datum</th>
                <th className="pb-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-mono text-gray-800">{v.code}</td>
                  <td className="py-2 font-medium text-gray-900">{formatBalance(v.value_cents)}</td>
                  <td className="py-2">{statusBadge(v)}</td>
                  <td className="py-2 text-gray-500">{v.redeemed_by_email ?? '–'}</td>
                  <td className="py-2 text-gray-500">{formatDate(v.redeemed_at ?? v.created_at)}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {v.status === 'open' && (
                        <>
                          <button
                            onClick={() => { setEditModal(v); setEditValue((v.value_cents / 100).toFixed(2)) }}
                            disabled={actionLoading === v.id}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >Wert</button>
                          <button
                            onClick={() => patchVoucher(v.id, { status: 'cancelled' })}
                            disabled={actionLoading === v.id}
                            className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50"
                          >Sperren</button>
                          <button
                            onClick={() => setDeleteModal(v)}
                            disabled={actionLoading === v.id}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          >Löschen</button>
                        </>
                      )}
                      {v.status === 'cancelled' && (
                        <>
                          <button
                            onClick={() => patchVoucher(v.id, { status: 'open' })}
                            disabled={actionLoading === v.id}
                            className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                          >Entsperren</button>
                          <button
                            onClick={() => setDeleteModal(v)}
                            disabled={actionLoading === v.id}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          >Löschen</button>
                        </>
                      )}
                      {v.status === 'redeemed' && (
                        <button
                          onClick={() => patchVoucher(v.id, { status: 'open' })}
                          disabled={actionLoading === v.id}
                          title="Guthaben wird NICHT automatisch angepasst"
                          className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >Zurücksetzen</button>
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Wert ändern</h3>
            <p className="text-xs font-mono text-gray-500 mb-4">{editModal.code}</p>
            <label className="block text-xs text-gray-500 mb-1">Neuer Wert (€)</label>
            <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
              min="0.01" step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Abbrechen</button>
              <button onClick={saveEditValue}
                disabled={!editValue || parseFloat(editValue) <= 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium"
              >Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Code löschen</h3>
            <p className="text-xs font-mono text-gray-600 mb-3">{deleteModal.code}</p>
            <p className="text-sm text-red-600 mb-5">Dieser Code wird endgültig gelöscht und kann nicht wiederhergestellt werden.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Abbrechen</button>
              <button onClick={deleteVoucher}
                disabled={actionLoading === deleteModal.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-medium"
              >Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
