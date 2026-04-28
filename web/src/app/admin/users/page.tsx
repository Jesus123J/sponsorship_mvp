'use client'
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/auth'
import { getSponsors } from '@/lib/api'
import ErrorAlert from '@/components/ErrorAlert'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [sponsors, setSponsors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: 'client', sponsor_id: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState<{ id: number, nombre: string } | null>(null)
  const [newPw, setNewPw] = useState('')

  const loadData = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      authFetch(`${API}/users/`).then(r => r.json()),
      getSponsors().catch(() => []),
    ])
      .then(([u, s]) => { setUsers(u); setSponsors(s); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const createUser = async () => {
    setCreating(true)
    setFormError(null)
    try {
      const res = await authFetch(`${API}/users/`, {
        method: 'POST',
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          nombre: form.nombre,
          rol: form.rol,
          sponsor_id: form.sponsor_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al crear usuario')
      setShowCreate(false)
      setForm({ email: '', password: '', nombre: '', rol: 'client', sponsor_id: '' })
      loadData()
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const toggleUser = async (id: number) => {
    await authFetch(`${API}/users/${id}/toggle`, { method: 'POST' })
    loadData()
  }

  const doResetPassword = async () => {
    if (!resetPw || !newPw) return
    try {
      const res = await authFetch(`${API}/users/${resetPw.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPw }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail) }
      setResetPw(null)
      setNewPw('')
    } catch (e: any) {
      setFormError(e.message)
    }
  }

  if (error) return <ErrorAlert message={error} onRetry={loadData} />

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion de Usuarios</h1>
          <p className="text-gray-500 mt-1">Crear, editar y administrar cuentas de acceso al sistema</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20">
          + Crear usuario
        </button>
      </div>

      {/* Formulario crear usuario */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Nuevo usuario</h3>
          {formError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nombre</label>
              <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Nombre completo" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="email@ejemplo.com" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Minimo 6 caracteres" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rol</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white">
                <option value="client">Cliente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            {form.rol === 'client' && (
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Sponsor asociado (opcional)</label>
                <select value={form.sponsor_id} onChange={e => setForm({ ...form, sponsor_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white">
                  <option value="">Sin sponsor</option>
                  {sponsors.map(s => (
                    <option key={s.sponsor_id} value={s.sponsor_id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={createUser} disabled={creating || !form.email || !form.password || !form.nombre}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creating ? 'Creando...' : 'Crear usuario'}
            </button>
            <button onClick={() => { setShowCreate(false); setFormError(null) }}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal resetear password */}
      {resetPw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-gray-900 mb-2">Resetear password</h3>
            <p className="text-sm text-gray-500 mb-4">Usuario: {resetPw.nombre}</p>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Nueva password (min 6 caracteres)" />
            <div className="flex gap-3">
              <button onClick={doResetPassword} disabled={newPw.length < 6}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                Guardar
              </button>
              <button onClick={() => { setResetPw(null); setNewPw('') }}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sponsor</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Creado</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No hay usuarios registrados</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.rol === 'admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">{u.sponsor_nombre || '-'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.activo ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-green-500' : 'bg-red-500'}`} />
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-400">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('es-PE') : '-'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => toggleUser(u.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        u.activo ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}>
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => setResetPw({ id: u.id, nombre: u.nombre })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="mt-6 flex gap-4 text-xs text-gray-400">
        <span>{users.length} usuarios totales</span>
        <span>{users.filter(u => u.rol === 'admin').length} admins</span>
        <span>{users.filter(u => u.rol === 'client').length} clientes</span>
        <span>{users.filter(u => !u.activo).length} inactivos</span>
      </div>
    </div>
  )
}
