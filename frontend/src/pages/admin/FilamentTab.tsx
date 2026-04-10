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
  // Feature B: Druckparameter
  print_temp_min: number | null
  print_temp_max: number | null
  bed_temp: number | null
  cooling_percent: number | null
  print_speed_mms: number | null
  notes: string | null
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
  // Feature B
  print_temp_min: null as number | null,
  print_temp_max: null as number | null,
  bed_temp: null as number | null,
  cooling_percent: null as number | null,
  print_speed_mms: null as number | null,
  notes: '',
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
          print_temp_min: initial.print_temp_min ?? null,
          print_temp_max: initial.print_temp_max ?? null,
          bed_temp: initial.bed_temp ?? null,
          cooling_percent: initial.cooling_percent ?? null,
          print_speed_mms: initial.print_speed_mms ?? null,
          notes: initial.notes ?? '',
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

  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }
  const numField = (key: keyof typeof form, placeholder: string, suffix?: string) => (
    <div>
      <input
        type="number"
        value={form[key] === null || form[key] === undefined ? '' : String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value === '' ? null : parseInt(e.target.value) || null }))}
        placeholder={placeholder}
        className="input-lime"
        style={{ fontSize: 12 }}
      />
      {suffix && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{suffix}</span>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{initial ? 'Filament bearbeiten' : 'Neues Filament'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <span style={labelStyle}>Name *</span>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-lime" style={{ fontSize: 13 }} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>Material</span>
              <select value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                className="input-lime" style={{ fontSize: 13 }}>
                {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Farb-Name</span>
              <input type="text" value={form.color_name} onChange={e => setForm(f => ({ ...f, color_name: e.target.value }))}
                placeholder="z.B. Schwarz" className="input-lime" style={{ fontSize: 13 }} />
            </label>
          </div>

          <label>
            <span style={labelStyle}>Farb-Hex</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                style={{ width: 40, height: 36, border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input type="text" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                className="input-lime" style={{ flex: 1, fontSize: 13 }} />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>Spulengewicht (g)</span>
              <input type="number" min={1} value={form.weight_per_spool_g}
                onChange={e => setForm(f => ({ ...f, weight_per_spool_g: parseInt(e.target.value) || 1000 }))}
                className="input-lime" style={{ fontSize: 13 }} />
            </label>
            <label>
              <span style={labelStyle}>Einkaufspreis (Cent)</span>
              <input type="number" min={0} value={form.purchase_price_cents}
                onChange={e => setForm(f => ({ ...f, purchase_price_cents: parseInt(e.target.value) || 0 }))}
                className="input-lime" style={{ fontSize: 13 }} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>Aufschlag (%)</span>
              <input type="number" min={0} max={500} value={form.markup_percent}
                onChange={e => setForm(f => ({ ...f, markup_percent: parseInt(e.target.value) || 0 }))}
                className="input-lime" style={{ fontSize: 13 }} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <span style={labelStyle}>Preis pro Gramm</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lime-dark)', marginTop: 4 }}>
                {isNaN(pricePerGram) ? '—' : `${pricePerGram} Ct/g (${(pricePerGram / 100).toFixed(3)} €)`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>Lagerbestand (Spulen)</span>
              <input type="number" min={0} value={form.stock_count}
                onChange={e => setForm(f => ({ ...f, stock_count: parseInt(e.target.value) || 0 }))}
                className="input-lime" style={{ fontSize: 13 }} />
            </label>
            <label>
              <span style={labelStyle}>Warnung unter (Spulen)</span>
              <input type="number" min={0} value={form.low_stock_threshold}
                onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))}
                className="input-lime" style={{ fontSize: 13 }} />
            </label>
          </div>

          {/* Feature B: Druckparameter */}
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Druckparameter (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span style={labelStyle}>Drucktemp. min (°C)</span>
                {numField('print_temp_min', 'z.B. 200')}
              </div>
              <div>
                <span style={labelStyle}>Drucktemp. max (°C)</span>
                {numField('print_temp_max', 'z.B. 220')}
              </div>
              <div>
                <span style={labelStyle}>Betttemp. (°C)</span>
                {numField('bed_temp', 'z.B. 60')}
              </div>
              <div>
                <span style={labelStyle}>Kühlung (%)</span>
                {numField('cooling_percent', 'z.B. 100')}
              </div>
              <div className="col-span-2">
                <span style={labelStyle}>Druckgeschwindigkeit (mm/s)</span>
                {numField('print_speed_mms', 'z.B. 150')}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={labelStyle}>Notizen</span>
              <textarea
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Sonstige Hinweise zum Filament..."
                rows={2}
                className="input-lime"
                style={{ resize: 'none', fontSize: 13 }}
              />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}

          <button onClick={save} disabled={saving} className="btn-lime" style={{ padding: '10px 0', fontSize: 13, width: '100%' }}>
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
    <div style={{ border: `0.5px solid ${slot.low_spool ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', background: slot.low_spool ? 'var(--amber-bg)' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slot {slot.slot_index + 1}</span>
        {slot.low_spool && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: 'var(--amber-bg)', color: 'var(--amber)', border: '0.5px solid var(--amber)' }}>Wenig Filament</span>
        )}
      </div>

      {slot.filament_type ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {slot.filament_type.color_hex && (
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '0.5px solid var(--border)', flexShrink: 0, background: slot.filament_type.color_hex }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 700 }}>{slot.filament_type.name}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
            {slot.filament_type.material}
            {slot.filament_type.color_name && ` · ${slot.filament_type.color_name}`}
            {' · '}{slot.filament_type.price_per_gram_cents} Ct/g
          </div>

          {pct !== null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                <span>Restbestand</span>
                <span>{slot.remaining_weight_g}g / {slot.initial_weight_g}g ({pct}%)</span>
              </div>
              <div style={{ width: '100%', background: 'var(--border)', borderRadius: 4, height: 6 }}>
                <div style={{ height: 6, borderRadius: 4, width: `${pct}%`, background: pct <= 10 ? 'var(--red)' : pct <= 25 ? 'var(--amber)' : 'var(--lime-dark)', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={newSpool} disabled={loading}
              style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--emerald)', background: 'transparent', color: 'var(--emerald)', fontWeight: 600 }}>
              Neue Spule
            </button>
            <button onClick={() => setAssigning(!assigning)} disabled={loading}
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>
              Ändern
            </button>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Kein Filament eingelegt</p>
      )}

      {assigning && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={selectedTypeId}
            onChange={e => setSelectedTypeId(e.target.value)}
            className="input-lime"
            style={{ fontSize: 12 }}
          >
            <option value="">— Slot leeren —</option>
            {filamentTypes.map(ft => (
              <option key={ft.id} value={String(ft.id)}>
                {ft.name} ({ft.material}{ft.color_name ? ` · ${ft.color_name}` : ''})
              </option>
            ))}
          </select>
          <button onClick={assign} disabled={loading} className="btn-lime" style={{ fontSize: 11, padding: '6px 0', width: '100%' }}>
            {loading ? 'Speichern...' : 'Zuweisen'}
          </button>
          {!slot.filament_type && (
            <button onClick={() => setAssigning(false)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>Abbrechen</button>
          )}
        </div>
      )}

      {!assigning && !slot.filament_type && (
        <button onClick={() => setAssigning(true)} disabled={loading}
          style={{ width: '100%', fontSize: 11, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--lime)', background: 'transparent', color: 'var(--lime-dark)', fontWeight: 600 }}>
          Filament zuweisen
        </button>
      )}

      {msg && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{msg}</p>}
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

  const slotsByPrinter: Record<string, SlotInfo[]> = {}
  for (const slot of slots) {
    if (!slotsByPrinter[slot.printer_id]) slotsByPrinter[slot.printer_id] = []
    slotsByPrinter[slot.printer_id].push(slot)
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>Lade Filament-Daten...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Filament-Typen */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Filament-Typen</h2>
          <button
            onClick={() => { setEditingType(undefined); setShowModal(true) }}
            className="btn-lime"
            style={{ padding: '7px 14px', fontSize: 13 }}
          >
            + Neues Filament
          </button>
        </div>

        {types.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Noch keine Filament-Typen angelegt.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--text)', background: 'var(--surface2)' }}>
                  {['Name', 'Material', 'Farbe', 'Spule', 'Preis/g', 'Lager', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {types.map(ft => (
                  <tr key={ft.id} style={{ borderBottom: '0.5px solid var(--border)', background: ft.low_stock ? 'var(--amber-bg)' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text)' }}>{ft.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{ft.material}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ft.color_hex && (
                          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '0.5px solid var(--border)', flexShrink: 0, background: ft.color_hex }} />
                        )}
                        <span style={{ color: 'var(--text2)' }}>{ft.color_name ?? '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 12 }}>{ft.weight_per_spool_g}g</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 12 }}>{ft.price_per_gram_cents} Ct</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: ft.low_stock ? 'var(--amber-bg)' : 'var(--surface2)', color: ft.low_stock ? 'var(--amber)' : 'var(--text3)', border: ft.low_stock ? '0.5px solid var(--amber)' : 'none' }}>
                        {ft.stock_count} Spulen
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setEditingType(ft); setShowModal(true) }}
                          style={{ fontSize: 12, color: 'var(--lime-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Bearbeiten
                        </button>
                        <button onClick={() => { setDeleteConfirm(ft.id); setDeleteError('') }}
                          style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
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
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px' }}>Drucker-Slots</h2>
        {Object.entries(slotsByPrinter).map(([printerId, printerSlots]) => (
          <div key={printerId} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', margin: '0 0 10px' }}>
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

      {showModal && (
        <FilamentModal
          initial={editingType}
          onSave={load}
          onClose={() => setShowModal(false)}
        />
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)', maxWidth: 400, width: '100%', padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px' }}>Filament-Typ löschen?</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>
              Dieser Filament-Typ wird dauerhaft gelöscht. Slots müssen vorher geleert werden.
            </p>
            {deleteError && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => deleteType(deleteConfirm)}
                style={{ flex: 1, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Löschen
              </button>
              <button onClick={() => { setDeleteConfirm(null); setDeleteError('') }}
                className="btn-secondary" style={{ flex: 1, padding: '9px 0' }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
