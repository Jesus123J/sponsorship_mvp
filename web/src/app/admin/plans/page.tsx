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

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`${API}/plans/`).then(r => r.json()),
      authFetch(`${API}/users/`).then(r => r.json()),
    ])
      .then(([p, users]) => {
        setPlans(p)
        setSubscriptions(users)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

  const featureIcon = (val: any) => val ? (
    <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full inline-flex items-center justify-center text-xs">✓</span>
  ) : (
    <span className="w-5 h-5 bg-gray-100 text-gray-400 rounded-full inline-flex items-center justify-center text-xs">—</span>
  )

  if (error) return <ErrorAlert message={error} onRetry={loadData} />

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Planes y Suscripciones</h1>
        <p className="text-gray-500 mt-1">Gestiona los planes disponibles y ve las suscripciones activas</p>
      </div>

      {/* Planes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {loading ? (
          <div className="col-span-3 text-center text-gray-400 py-12">Cargando...</div>
        ) : plans.map((plan, i) => (
          <div key={plan.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
            i === 1 ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100'
          }`}>
            {i === 1 && (
              <div className="bg-indigo-600 text-white text-xs font-bold text-center py-1.5">
                MAS POPULAR
              </div>
            )}
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900">{plan.nombre}</h3>
              <div className="mt-3 mb-5">
                <span className="text-3xl font-bold text-gray-900">{fmt(plan.precio_mensual)}</span>
                <span className="text-sm text-gray-400">/mes</span>
                {plan.precio_anual && (
                  <p className="text-xs text-gray-400 mt-1">{fmt(plan.precio_anual)}/anual ({Math.round((1 - plan.precio_anual / (plan.precio_mensual * 12)) * 100)}% descuento)</p>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Marcas</span>
                  <span className="font-medium">{plan.max_marcas === 99 ? 'Ilimitadas' : plan.max_marcas}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Partidos/mes</span>
                  <span className="font-medium">{plan.max_partidos_mes === 99 ? 'Ilimitados' : plan.max_partidos_mes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Audio</span>
                  {featureIcon(plan.incluye_audio)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Social media</span>
                  {featureIcon(plan.incluye_social)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">API</span>
                  {featureIcon(plan.incluye_api)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Exportar PDF</span>
                  {featureIcon(plan.incluye_pdf)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Usuarios con suscripciones */}
      <h2 className="font-semibold text-gray-900 mb-4">Usuarios registrados</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Rol</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Sponsor</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
            ) : subscriptions.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.rol === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                  }`}>{u.rol}</span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600">{u.sponsor_nombre || '-'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.activo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-green-500' : 'bg-red-500'}`} />
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {plans.map(p => (
          <div key={p.id} className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">{p.nombre}</p>
            <p className="text-lg font-bold text-gray-900">{fmt(p.precio_mensual)}<span className="text-xs text-gray-400">/mes</span></p>
          </div>
        ))}
      </div>
    </div>
  )
}
