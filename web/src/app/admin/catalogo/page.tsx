'use client'
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

type Tab = 'equipos' | 'estadios' | 'torneos'

export default function CatalogoPage() {
  const [tab, setTab] = useState<Tab>('equipos')
  const [equipos, setEquipos] = useState<any[]>([])
  const [estadios, setEstadios] = useState<any[]>([])
  const [torneos, setTorneos] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const loadAll = () => {
    authFetch(`${API}/catalog/equipos`).then(r => r.ok ? r.json() : []).then(setEquipos).catch(() => {})
    authFetch(`${API}/catalog/estadios`).then(r => r.ok ? r.json() : []).then(setEstadios).catch(() => {})
    authFetch(`${API}/catalog/torneos`).then(r => r.ok ? r.json() : []).then(setTorneos).catch(() => {})
  }

  useEffect(() => { loadAll() }, [])

  const tabs = [
    { key: 'equipos' as Tab, label: 'Equipos', count: equipos.length, icon: '⚽' },
    { key: 'estadios' as Tab, label: 'Estadios', count: estadios.length, icon: '🏟' },
    { key: 'torneos' as Tab, label: 'Torneos', count: torneos.length, icon: '🏆' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogo</h1>
          <p className="text-gray-500 mt-1">Gestiona equipos, estadios y torneos para usar en los analisis.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
          + Nuevo {tab === 'equipos' ? 'equipo' : tab === 'estadios' ? 'estadio' : 'torneo'}
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <span className="mr-1.5">{t.icon}</span>{t.label}
            <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'equipos' && <EquiposTab items={equipos} estadios={estadios} reload={loadAll} />}
      {tab === 'estadios' && <EstadiosTab items={estadios} equipos={equipos} reload={loadAll} />}
      {tab === 'torneos' && <TorneosTab items={torneos} reload={loadAll} />}

      {showCreate && tab === 'equipos' && <CreateEquipoModal estadios={estadios} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadAll() }} />}
      {showCreate && tab === 'estadios' && <CreateEstadioModal equipos={equipos} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadAll() }} />}
      {showCreate && tab === 'torneos' && <CreateTorneoModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadAll() }} />}
    </div>
  )
}

// ═══════════════ EQUIPOS ═══════════════

function EquiposTab({ items, estadios, reload }: any) {
  const del = async (id: string) => {
    if (!confirm(`Eliminar equipo "${id}"?`)) return
    const res = await authFetch(`${API}/catalog/equipos/${id}`, { method: 'DELETE' })
    if (res.ok) reload(); else alert((await res.json()).detail)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Color primario HSV</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estadio</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} className="text-center text-gray-400 py-10">Sin equipos. Crea el primero con el boton de arriba.</td></tr>
          )}
          {items.map((eq: any) => (
            <tr key={eq.entity_id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3"><code className="text-xs text-gray-600">{eq.entity_id}</code></td>
              <td className="px-4 py-3"><strong>{eq.nombre}</strong><span className="text-gray-400 text-xs ml-1">({eq.nombre_corto})</span></td>
              <td className="px-4 py-3">
                <code className="text-xs px-2 py-0.5 rounded bg-gray-100">{eq.color_primario_hsv || '—'}</code>
              </td>
              <td className="px-4 py-3 text-gray-600">{eq.estadio_nombre || eq.estadio || '—'}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => del(eq.entity_id)}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateEquipoModal({ estadios, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    entity_id: '', nombre: '', nombre_corto: '',
    color_primario_hsv: '', color_secundario_hsv: '[0,0,100]',
    estadio_id: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.entity_id || !form.nombre) return alert('ID y nombre requeridos')
    setSaving(true)
    const payload: any = { ...form }
    if (!payload.estadio_id) delete payload.estadio_id
    const res = await authFetch(`${API}/catalog/equipos`, {
      method: 'POST', body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) return alert((await res.json()).detail)
    onSaved()
  }

  return (
    <Modal title="Nuevo equipo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="ID (slug, ej: cienciano)" value={form.entity_id}
          onChange={v => setForm({ ...form, entity_id: v.toLowerCase().replace(/\s+/g, '_') })} />
        <Field label="Nombre (ej: Cienciano del Cusco)" value={form.nombre}
          onChange={v => setForm({ ...form, nombre: v })} />
        <Field label="Nombre corto (ej: Cienciano)" value={form.nombre_corto}
          onChange={v => setForm({ ...form, nombre_corto: v })} />
        <Field label="Color primario HSV (H:0-360, S:0-100, V:0-100 — ej: [0,80,60] para rojo)"
          value={form.color_primario_hsv}
          onChange={v => setForm({ ...form, color_primario_hsv: v })}
          placeholder="[220,80,40]" />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Estadio propio (opcional)</label>
          <select value={form.estadio_id} onChange={e => setForm({ ...form, estadio_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            <option value="">—</option>
            {estadios.map((e: any) => (
              <option key={e.estadio_id} value={e.estadio_id}>{e.nombre} ({e.ciudad})</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-gray-500 italic">
          💡 Los colores HSV se usan para atribuir logos en camiseta al equipo correcto. H es el tono (0-360), S la saturación, V el brillo.
        </p>
      </div>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  )
}

// ═══════════════ ESTADIOS ═══════════════

function EstadiosTab({ items, equipos, reload }: any) {
  const del = async (id: string) => {
    if (!confirm(`Desactivar estadio "${id}"?`)) return
    const res = await authFetch(`${API}/catalog/estadios/${id}`, { method: 'DELETE' })
    if (res.ok) reload(); else alert((await res.json()).detail)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ciudad</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Capacidad</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Propietario</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} className="text-center text-gray-400 py-10">Sin estadios.</td></tr>
          )}
          {items.map((e: any) => (
            <tr key={e.estadio_id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3"><code className="text-xs text-gray-600">{e.estadio_id}</code></td>
              <td className="px-4 py-3"><strong>{e.nombre}</strong></td>
              <td className="px-4 py-3 text-gray-600">{e.ciudad} ({e.pais})</td>
              <td className="px-4 py-3 text-right font-mono">{(e.capacidad || 0).toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-600">{e.propietario_nombre || '—'}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => del(e.estadio_id)}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                  Desactivar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateEstadioModal({ equipos, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    estadio_id: '', nombre: '', ciudad: 'Lima', pais: 'Peru',
    capacidad: '', club_propietario_id: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.estadio_id || !form.nombre) return alert('ID y nombre requeridos')
    setSaving(true)
    const payload: any = {
      ...form,
      capacidad: form.capacidad ? parseInt(form.capacidad) : null,
    }
    if (!payload.club_propietario_id) delete payload.club_propietario_id
    const res = await authFetch(`${API}/catalog/estadios`, {
      method: 'POST', body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) return alert((await res.json()).detail)
    onSaved()
  }

  return (
    <Modal title="Nuevo estadio" onClose={onClose}>
      <div className="space-y-3">
        <Field label="ID (slug)" value={form.estadio_id}
          onChange={v => setForm({ ...form, estadio_id: v.toLowerCase().replace(/\s+/g, '_') })} />
        <Field label="Nombre" value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} />
        <Field label="Ciudad" value={form.ciudad} onChange={v => setForm({ ...form, ciudad: v })} />
        <Field label="Pais" value={form.pais} onChange={v => setForm({ ...form, pais: v })} />
        <Field label="Capacidad" type="number" value={form.capacidad}
          onChange={v => setForm({ ...form, capacidad: v })} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Club propietario (opcional)</label>
          <select value={form.club_propietario_id}
            onChange={e => setForm({ ...form, club_propietario_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            <option value="">—</option>
            {equipos.map((eq: any) => (
              <option key={eq.entity_id} value={eq.entity_id}>{eq.nombre}</option>
            ))}
          </select>
        </div>
      </div>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  )
}

// ═══════════════ TORNEOS ═══════════════

function TorneosTab({ items, reload }: any) {
  const del = async (id: string) => {
    if (!confirm(`Desactivar torneo "${id}"?`)) return
    const res = await authFetch(`${API}/catalog/torneos/${id}`, { method: 'DELETE' })
    if (res.ok) reload(); else alert((await res.json()).detail)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Confederacion</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Temporada</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} className="text-center text-gray-400 py-10">Sin torneos.</td></tr>
          )}
          {items.map((t: any) => (
            <tr key={t.torneo_id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3"><code className="text-xs text-gray-600">{t.torneo_id}</code></td>
              <td className="px-4 py-3"><strong>{t.nombre}</strong></td>
              <td className="px-4 py-3 text-gray-600">{t.tipo}</td>
              <td className="px-4 py-3 text-gray-600">{t.confederacion} / {t.pais}</td>
              <td className="px-4 py-3 text-center font-mono">{t.temporada}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => del(t.torneo_id)}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
                  Desactivar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateTorneoModal({ onClose, onSaved }: any) {
  const [form, setForm] = useState({
    torneo_id: '', nombre: '', tipo: 'liga_local', pais: 'Peru',
    confederacion: 'Local', temporada: new Date().getFullYear(),
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.torneo_id || !form.nombre) return alert('ID y nombre requeridos')
    setSaving(true)
    const res = await authFetch(`${API}/catalog/torneos`, {
      method: 'POST', body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) return alert((await res.json()).detail)
    onSaved()
  }

  return (
    <Modal title="Nuevo torneo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="ID (slug, ej: liga_1_apertura_2025)" value={form.torneo_id}
          onChange={v => setForm({ ...form, torneo_id: v.toLowerCase().replace(/\s+/g, '_') })} />
        <Field label="Nombre (ej: Liga 1 Apertura 2025)" value={form.nombre}
          onChange={v => setForm({ ...form, nombre: v })} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            <option value="liga_local">Liga local</option>
            <option value="copa_local">Copa local</option>
            <option value="copa_internacional">Copa internacional</option>
            <option value="amistoso">Amistoso</option>
            <option value="eliminatorias">Eliminatorias</option>
          </select>
        </div>
        <Field label="Pais" value={form.pais} onChange={v => setForm({ ...form, pais: v })} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Confederacion</label>
          <select value={form.confederacion} onChange={e => setForm({ ...form, confederacion: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            <option value="Local">Local</option>
            <option value="Conmebol">Conmebol</option>
            <option value="Concacaf">Concacaf</option>
            <option value="UEFA">UEFA</option>
            <option value="FIFA">FIFA</option>
          </select>
        </div>
        <Field label="Temporada (año)" type="number" value={String(form.temporada)}
          onChange={v => setForm({ ...form, temporada: parseInt(v) || new Date().getFullYear() })} />
      </div>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} />
    </Modal>
  )
}

// ═══════════════ Helpers ═══════════════

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onClose, onSave, saving }: any) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
      <button onClick={onClose}
        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
        Cancelar
      </button>
      <button onClick={onSave} disabled={saving}
        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
  )
}
