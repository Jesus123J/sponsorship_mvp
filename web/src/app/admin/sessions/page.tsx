'use client'
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/auth'
import ErrorAlert from '@/components/ErrorAlert'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    setError(null)
    authFetch(`${API}/auth/sessions/all`)
      .then(r => r.json())
      .then(data => { setSessions(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const closeSession = async (id: number) => {
    await authFetch(`${API}/auth/sessions/${id}`, { method: 'DELETE' })
    loadData()
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `hace ${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `hace ${hours}h`
    return `hace ${Math.floor(hours / 24)}d`
  }

  if (error) return <ErrorAlert message={error} onRetry={loadData} />

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Sesiones Activas</h1>
        <p className="text-gray-500 mt-1">Dispositivos conectados al sistema — puedes cerrar sesiones remotamente</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Dispositivo</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">IP</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Inicio</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Expira</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Accion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No hay sesiones activas</td></tr>
            ) : sessions.map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{s.nombre}</p>
                  <p className="text-xs text-gray-400">{s.email}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                    s.rol === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                  }`}>{s.rol}</span>
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-500 max-w-[200px] truncate">{s.user_agent}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 font-mono">{s.ip_address}</td>
                <td className="px-5 py-3.5 text-xs text-gray-500">{timeAgo(s.created_at)}</td>
                <td className="px-5 py-3.5 text-xs text-gray-500">
                  {new Date(s.expires_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button onClick={() => closeSession(s.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                    Cerrar sesion
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        {sessions.length} sesiones activas — Las sesiones expiran automaticamente en 24 horas
      </div>
    </div>
  )
}
