'use client'
import { useEffect, useState } from 'react'
import { getStats, getTopSponsors } from '@/lib/api'
import { getMatches } from '@/lib/api'
import Link from 'next/link'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ partidos: 0, detecciones: 0, sponsors: 0, smv_total: 0 })
  const [recentMatches, setRecentMatches] = useState<any[]>([])
  const [topSponsors, setTopSponsors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getStats(), getTopSponsors(5), getMatches()])
      .then(([s, top, matches]) => {
        setStats(s)
        setTopSponsors(top)
        setRecentMatches(matches.slice(0, 5))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

  const statCards = [
    { label: 'Partidos analizados', value: stats.partidos, icon: '\u{1F4CA}', color: 'from-blue-500 to-blue-600' },
    { label: 'Detecciones aprobadas', value: stats.detecciones.toLocaleString(), icon: '\u{1F3AF}', color: 'from-emerald-500 to-emerald-600' },
    { label: 'Sponsors activos', value: stats.sponsors, icon: '\u{1F3F7}', color: 'from-purple-500 to-purple-600' },
    { label: 'SMV total generado', value: fmt(stats.smv_total), icon: '\u{1F4B0}', color: 'from-orange-500 to-orange-600' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Administrativo</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema de sponsorship</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statCards.map((card, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 card-hover shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} opacity-10`} />
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">Top Sponsors por SMV</h2>
            <Link href="/admin/league" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Ver todo</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="px-6 py-8 text-center text-gray-400">Cargando...</div>
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
              <div key={m.match_id} className="px-6 py-3 hover:bg-gray-50">
                <p className="text-sm font-medium text-gray-900">
                  {m.local_nombre || m.equipo_local} vs {m.visitante_nombre || m.equipo_visitante}
                </p>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs text-gray-400">{m.fecha || 'Sin fecha'}</span>
                  <span className="text-xs text-gray-400">Audiencia: {(m.audiencia_estimada || 0).toLocaleString()}</span>
                </div>
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
