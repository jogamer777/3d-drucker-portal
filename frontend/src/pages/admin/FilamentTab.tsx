import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface FilamentType {
  id: number
  name: string
  material: string
  color_hex: string | null
  color_name: string | null
  weight_per_spool_g: number
  purchase_price_cents: number
  markup_percent: number
  price_per_gram_cents: number
  stock_count: number
  low_stock_threshold: number
  low_stock: boolean
  created_at: string
}

interface SlotInfo {
  id: number
  printer_id: string
  printer_name: string
  slot_index: number
  filament_type_id: number | null
  filament_type: FilamentType | null
  initial_weight_g: number | null
  remaining_weight_g: number | null
  low_spool: boolean
  loaded_at: string | null
}

const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'OTHER']

const EMPTY_FORM = {
  name: '',
  material: 'PLA',
  color_hex: '#1a1a1a',
  color_name: '',
  weight_per_spool_g: 1000,
  purchase_price_cents: 2500,
  markup_percent: 20,
  stock_count: 0,
  low_stock_threshold: 2,
}

function FilamentModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: FilamentType
  onSave: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          material: initial.material,
          color_hex: initial.color_hex ?? '#1a1a1a',
          color_name: initial.color_name ?? '',
          weight_per_spool_g: initial.weight_per_spool_g,
          purchase_price_cents: initial.purchase_price_cents,
          markup_percent: initial.markup_percent,
          stock_count: initial.stock_count,
          low_stock_threshold: initial.low_stock_threshold,
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pricePerGram = Math.ceil(
    (form.purchase_price_cents / form.weight_per_spool_g) * (1 + form.markup_percent / 100)
  )

  const save = async () => {
    if (!form.name.trim()) { setError('Name ist Pflicht'); return }
    setSaving(true)
    setError('')
    try {
      if (initial) {
        await api.patch(`/admin/filament/types/${initial.id}`, form)
      } else {
        await api.post('/admin/filament/types', form)
      }
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{initial ? 'Filament bearbeiten' : 'Neues Filament'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">Name *</span>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Material</span>
              <select value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Farb-Name</span>
              <input type="text" value={form.color_name} onChange={e => setForm(f => ({ ...f, color_name: e.target.value }))}
                placeholder="z.B. Schwarz"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">Farb-Hex</span>
            <div className="mt-1 flex gap-2 items-center">
              <input type="color" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                className="w-10 h-9 border border-gray-300 rounded cursor-pointer p-0.5" />
              <input type="text" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Spulengewicht (g)</span>
              <input type="number" min={1} value={form.weight_per_spool_g}
                onChange={e => setForm(f => ({ ...f, weight_per_spool_g: parseInt(e.target.value) || 1000 }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Einkaufspreis (Cent)</span>
              <input type="number" min={0} value={form.purchase_price_cents}
                onChange={e => setForm(f => ({ ...f, purchase_price_cents: parseInt(e.target.value) || 0 }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Aufschlag (%)</span>
              <input type="number" min={0} max={500} value={form.markup_percent}
                onChange={e => setForm(f => ({ ...f, markup_percent: parseInt(e.target.value) || 0 }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <div className="flex flex-col justify-end">
              <span className="text-xs text-gray-500">Preis pro Gramm</span>
              <span className="text-sm font-semibold text-blue-700 mt-1.5">
                {isNaN(pricePerGram) ? '—' : `${pricePerGram} Ct/g (${(pricePerGram / 100).toFixed(3)} €)`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Lagerbestand (Spulen)</span>
              <input type="number" min={0} value={form.stock_count}
                onChange={e => setForm(f => ({ ...f, stock_count: parseInt(e.target.value) || 0 }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Warnung unter (Spulen)</span>
              <input type="number" min={0} value={form.low_stock_threshold}
                onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={save} disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg">
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlotCard({
  slot,
  filamentTypes,
  onUpdated,
}: {
  slot: SlotInfo
  filamentTypes: FilamentType[]
  onUpdated: () => void
}) {
  const [assigning, setAssigning] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<string>(
    slot.filament_type_id ? String(slot.filament_type_id) : ''
  )
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const pct = slot.remaining_weight_g && slot.initial_weight_g
    ? Math.round((slot.remaining_weight_g / slot.initial_weight_g) * 100)
    : null

  const assign = async () => {
    setLoading(true)
    setMsg('')
    try {
      await api.put(`/admin/filament/slots/${slot.printer_id}/${slot.slot_index}`, {
        filament_type_id: selectedTypeId ? parseInt(selectedTypeId) : null,
      })
      setAssigning(false)
      onUpdated()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  const newSpool = async () => {
    if (!confirm('Neue Spule eingelegt? Restbestand wird auf 100% zurückgesetzt.')) return
    setLoading(true)
    setMsg('')
    try {
      await api.post(`/admin/filament/slots/${slot.printer_id}/${slot.slot_index}/new-spool`)
      onUpdated()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`border rounded-xl p-4 ${slot.low_spool ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase">Slot {slot.slot_index + 1}</span>
        {slot.low_spool && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Wenig Filament</span>
        )}
      </div>

      {slot.filament_type ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            {slot.filament_type.color_hex && (
              <div
                className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
                style={{ backgroundColor: slot.filament_type.color_hex }}
              />
            )}
            <span className="text-sm font-medium text-gray-900">{slot.filament_type.name}</span>
          </div>
          <div className="text-xs text-gray-500 mb-3">
            {slot.filament_type.material}
            {slot.filament_type.color_name && ` · ${slot.filament_type.color_name}`}
            {' · '}{slot.filament_type.price_per_gram_cents} Ct/g
          </div>

          {pct !== null && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Restbestand</span>
                <span>{slot.remaining_weight_g}g von {slot.initial_weight_g}g ({pct}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${pct <= 10 ? 'bg-orange-500' : pct <= 25 ? 'bg-yellow-400' : 'bg-green-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={newSpool} disabled={loading}
              className="flex-1 text-xs border border-green-300 text-green-700 hover:bg-green-50 rounded-lg py-1.5 font-medium disabled:opacity-50">
              Neue Spule
            </button>
            <button onClick={() => setAssigning(!assigning)} disabled={loading}
              className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5 font-medium">
              Ändern
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400 mb-3">Kein Filament eingelegt</p>
      )}

      {assigning && (
        <div className="mt-3 space-y-2">
          <select
            value={selectedTypeId}
            onChange={e => setSelectedTypeId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="">— Slot leeren —</option>
            {filamentTypes.map(ft => (
              <option key={ft.id} value={String(ft.id)}>
                {ft.name} ({ft.material}{ft.color_name ? ` · ${ft.color_name}` : ''})
              </option>
            ))}
          </select>
          <button onClick={assign} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg">
            {loading ? 'Speichern...' : 'Zuweisen'}
          </button>
          {!slot.filament_type && (
            <button onClick={() => setAssigning(false)}
              className="w-full text-xs text-gray-500 hover:text-gray-700">
              Abbrechen
            </button>
          )}
        </div>
      )}

      {!assigning && !slot.filament_type && (
        <button onClick={() => setAssigning(true)} disabled={loading}
          className="w-full text-xs border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 font-medium">
          Filament zuweisen
        </button>
      )}

      {msg && <p className="text-xs text-red-600 mt-1">{msg}</p>}
    </div>
  )
}

export default function FilamentTab() {
  const [types, setTypes] = useState<FilamentType[]>([])
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingType, setEditingType] = useState<FilamentType | undefined>()
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [typesRes, slotsRes] = await Promise.all([
        api.get('/admin/filament/types'),
        api.get('/admin/filament/slots'),
      ])
      setTypes(typesRes.data)
      setSlots(slotsRes.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const deleteType = async (id: number) => {
    setDeleteError('')
    try {
      await api.delete(`/admin/filament/types/${id}`)
      setDeleteConfirm(null)
      load()
    } catch (e: any) {
      setDeleteError(e.response?.data?.detail ?? 'Fehler beim Löschen')
    }
  }

  // Slots nach Drucker gruppieren
  const slotsByPrinter: Record<string, SlotInfo[]> = {}
  for (const slot of slots) {
    if (!slotsByPrinter[slot.printer_id]) slotsByPrinter[slot.printer_id] = []
    slotsByPrinter[slot.printer_id].push(slot)
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Lade Filament-Daten...</div>

  return (
    <div className="space-y-8">

      {/* Filament-Typen */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Filament-Typen</h2>
          <button
            onClick={() => { setEditingType(undefined); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
          >
            + Neues Filament
          </button>
        </div>

        {types.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Filament-Typen angelegt.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 text-xs">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Material</th>
                  <th className="pb-2 font-medium">Farbe</th>
                  <th className="pb-2 font-medium">Spule</th>
                  <th className="pb-2 font-medium">Preis/g</th>
                  <th className="pb-2 font-medium">Lager</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {types.map(ft => (
                  <tr key={ft.id} className={`hover:bg-gray-50 ${ft.low_stock ? 'bg-yellow-50' : ''}`}>
                    <td className="py-2 font-medium text-gray-900">{ft.name}</td>
                    <td className="py-2 text-gray-600">{ft.material}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {ft.color_hex && (
                          <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                            style={{ backgroundColor: ft.color_hex }} />
                        )}
                        <span className="text-gray-600">{ft.color_name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="py-2 text-gray-600">{ft.weight_per_spool_g}g</td>
                    <td className="py-2 text-gray-800 font-medium">{ft.price_per_gram_cents} Ct</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ft.low_stock ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {ft.stock_count} Spulen
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingType(ft); setShowModal(true) }}
                          className="text-xs text-blue-600 hover:underline">
                          Bearbeiten
                        </button>
                        <button onClick={() => { setDeleteConfirm(ft.id); setDeleteError('') }}
                          className="text-xs text-red-500 hover:underline">
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drucker-Slots */}
      <div>
        <h2 className="font-semibold text-gray-800 mb-4">Drucker-Slots</h2>
        {Object.entries(slotsByPrinter).map(([printerId, printerSlots]) => (
          <div key={printerId} className="mb-6">
            <p className="text-sm font-medium text-gray-600 mb-3">
              {printerSlots[0]?.printer_name ?? printerId}
            </p>
            <div className={`grid gap-3 ${printerSlots.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-1 max-w-xs'}`}>
              {printerSlots.map(slot => (
                <SlotCard
                  key={slot.id ?? `${slot.printer_id}-${slot.slot_index}`}
                  slot={slot}
                  filamentTypes={types}
                  onUpdated={load}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Filament-Modal */}
      {showModal && (
        <FilamentModal
          initial={editingType}
          onSave={load}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Löschen-Bestätigung */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Filament-Typ löschen?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Dieser Filament-Typ wird dauerhaft gelöscht. Slots müssen vorher geleert werden.
            </p>
            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => deleteType(deleteConfirm)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg">
                Löschen
              </button>
              <button onClick={() => { setDeleteConfirm(null); setDeleteError('') }}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium py-2 rounded-lg">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
