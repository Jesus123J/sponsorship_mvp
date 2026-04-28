'use client'
import { useEffect, useState } from 'react'
import { getStats, getTopSponsors, getMatches } from '@/lib/api'
import { getToken } from '@/lib/auth'
import ErrorAlert from '@/components/ErrorAlert'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({
    partidos: 0, detecciones: 0, sponsors: 0, smv_total: 0,
    prueba: { partidos: 0, detecciones: 0, smv_total: 0 },
  })
  const [recentMatches, setRecentMatches] = useState<any[]>([])
  const [topSponsors, setTopSponsors] = useState<any[]>([])
  const [pruebaList, setPruebaList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string>('')

  const loadData = () => {
    setLoading(true); setError(null)
    Promise.all([
      getStats(),
      getTopSponsors(5),
      getMatches(),
      authFetch(`${API}/dashboard/prueba/partidos`).then(r => r.ok ? r.json() : []),
    ])
      .then(([s, top, matches, prueba]) => {
        setStats(s)
        setTopSponsors(top)
        setRecentMatches(matches.slice(0, 5))
        setPruebaList(prueba)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const promoteToReal = async (matchId: string) => {
    if (!confirm(`Marcar "${matchId}" como dato REAL? Los SMV de este partido empezaran a contar en el dashboard.`)) return
    setWorking(matchId)
    try {
      const res = await authFetch(`${API}/dashboard/prueba/${encodeURIComponent(matchId)}/promote`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail)
      loadData()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const deletePartido = async (matchId: string) => {
    if (!confirm(`Eliminar "${matchId}" y todas sus detecciones? No se puede deshacer.`)) return
    setWorking(matchId)
    try {
      const res = await authFetch(`${API}/dashboard/partido/${encodeURIComponent(matchId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).detail)
      loadData()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const deleteAllPrueba = async () => {
    if (!confirm('Eliminar TODOS los datos de prueba (partidos y detecciones)? No se puede deshacer.')) return
    setWorking('all')
    try {
      const res = await authFetch(`${API}/dashboard/prueba/all`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).detail)
      loadData()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

  const statCards = [
    { label: 'Partidos analizados', value: stats.partidos, icon: '\u{1F4CA}', color: 'from-blue-500 to-blue-600', hint: 'Solo partidos reales con detecciones' },
    { label: 'Detecciones aprobadas', value: stats.detecciones.toLocaleString(), icon: '\u{1F3AF}', color: 'from-emerald-500 to-emerald-600', hint: 'Excluye datos de prueba' },
    { label: 'Sponsors activos', value: stats.sponsors, icon: '\u{1F3F7}', color: 'from-purple-500 to-purple-600', hint: 'Catalogo de sponsors en BD' },
    { label: 'SMV total generado', value: fmt(stats.smv_total), icon: '\u{1F4B0}', color: 'from-orange-500 to-orange-600', hint: 'Solo de partidos reales' },
  ]

  if (error) return <ErrorAlert message={error} onRetry={loadData} />

  const hasPrueba = stats.prueba.partidos > 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Administrativo</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema de sponsorship</p>
      </div>

      {/* Stats reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {statCards.map((card, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 card-hover shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} opacity-10`} />
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : card.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* Seccion de datos de prueba */}
      {hasPrueba && (
        <div className="mb-8 bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Datos de prueba (no cuentan en el dashboard)</h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  {stats.prueba.partidos} {stats.prueba.partidos === 1 ? 'partido' : 'partidos'} ·{' '}
                  {stats.prueba.detecciones.toLocaleString()} detecciones ·{' '}
                  <strong>{fmt(stats.prueba.smv_total)}</strong> SMV simulado
                </p>
                <p className="text-[11px] text-amber-700 mt-1">
                  Todo partido auto-creado por el pipeline empieza como prueba. Cuando quieras que cuente como dato real (y genere SMV oficial), marca &quot;Promover a real&quot;.
                </p>
              </div>
            </div>
            <button onClick={deleteAllPrueba} disabled={working === 'all'}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50 flex-shrink-0">
              {working === 'all' ? 'Eliminando...' : 'Eliminar todo'}
            </button>
          </div>

          <div className="bg-white rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-amber-100/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-amber-900">Partido</th>
                  <th className="text-left px-3 py-2 font-semibold text-amber-900">Fecha</th>
                  <th className="text-right px-3 py-2 font-semibold text-amber-900">Detecciones</th>
                  <th className="text-right px-3 py-2 font-semibold text-amber-900">SMV</th>
                  <th className="text-center px-3 py-2 font-semibold text-amber-900">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pruebaList.map((p: any) => (
                  <tr key={p.match_id} className="border-t border-amber-100">
                    <td className="px-3 py-2">
                      <code className="text-[11px] text-gray-700">{p.match_id}</code>
                      {p.equipo_local !== 'desconocido' && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{p.equipo_local} vs {p.equipo_visitante}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('es-PE') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{p.total_detecciones || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(Number(p.smv_total) || 0)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => promoteToReal(p.match_id)} disabled={working === p.match_id}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-50">
                          {working === p.match_id ? '...' : 'Promover a real'}
                        </button>
                        <button onClick={() => deletePartido(p.match_id)} disabled={working === p.match_id}
                          className="px-2 py-1 bg-red-100 text-red-700 rounded text-[10px] font-medium hover:bg-red-200 disabled:opacity-50">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Top Sponsors por SMV</h2>
            <Link href="/admin/league" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Ver todo</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="px-6 py-8 text-center text-gray-400">Cargando...</div>
            ) : topSponsors.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">
                <p>Sin datos reales todavia</p>
                <p className="text-[11px] mt-1">Promueve un partido de prueba a real para empezar</p>
              </div>
            ) : topSponsors.map((s, i) => (
              <div key={s.sponsor_id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'
                  }`}>{i + 1}</span>
                  <span className="text-sm font-medium text-gray-900">{s.nombre}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{fmt(s.smv_total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Partidos recientes</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="px-6 py-8 text-center text-gray-400">Cargando...</div>
            ) : recentMatches.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">No hay partidos registrados</div>
            ) : recentMatches.map(m => (
              <div key={m.match_id} className="px-6 py-3 hover:bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {m.local_nombre || m.equipo_local} vs {m.visitante_nombre || m.equipo_visitante}
                  </p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-gray-400">{m.fecha || 'Sin fecha'}</span>
                    <span className="text-xs text-gray-400">Audiencia: {(m.audiencia_estimada || 0).toLocaleString()}</span>
                  </div>
                </div>
                {m.es_prueba === 1 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">PRUEBA</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-gray-900 mb-4">Acciones rapidas</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/league" className="block rounded-2xl border p-5 card-hover border-orange-200 bg-orange-50">
          <h3 className="font-semibold text-orange-700">League View</h3>
          <p className="text-sm text-gray-600 mt-1">Ranking de sponsors de Liga 1 por partido</p>
        </Link>
        <Link href="/admin/brands" className="block rounded-2xl border p-5 card-hover border-indigo-200 bg-indigo-50">
          <h3 className="font-semibold text-indigo-700">Brand View</h3>
          <p className="text-sm text-gray-600 mt-1">Desglose SMV por sponsor individual</p>
        </Link>
        <Link href="/admin/properties" className="block rounded-2xl border p-5 card-hover border-emerald-200 bg-emerald-50">
          <h3 className="font-semibold text-emerald-700">Property View</h3>
          <p className="text-sm text-gray-600 mt-1">Valor generado por club para sponsors</p>
        </Link>
      </div>
    </div>
  )
}
