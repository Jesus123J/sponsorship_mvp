'use client'
import { useEffect, useState } from 'react'
import { getSponsors, getSponsorSummary, getSponsorByMatch, getSponsorByPosition } from '@/lib/api'
import { getSession } from '@/lib/auth'
import Link from 'next/link'

export default function ClientDashboard() {
  const [sponsors, setSponsors] = useState<any[]>([])
  const [selectedSponsor, setSelectedSponsor] = useState('')
  const [sponsorName, setSponsorName] = useState('')
  const [summary, setSummary] = useState({ smv_total: 0, detecciones: 0, partidos: 0, segundos: 0 })
  const [byMatch, setByMatch] = useState<any[]>([])
  const [byPosition, setByPosition] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const user = getSession()

  useEffect(() => {
    getSponsors().then(list => {
      setSponsors(list)
      // Si el usuario tiene sponsor_id asignado, seleccionarlo automaticamente
      if (user?.sponsor_id) {
        setSelectedSponsor(user.sponsor_id)
        const found = list.find((s: any) => s.sponsor_id === user.sponsor_id)
        if (found) setSponsorName(found.nombre)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedSponsor) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      getSponsorSummary(selectedSponsor),
      getSponsorByMatch(selectedSponsor),
      getSponsorByPosition(selectedSponsor),
    ])
      .then(([sum, matches, positions]) => {
        setSummary(sum)
        setByMatch(matches)
        setByPosition(positions)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedSponsor])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

  const positionColors: Record<string, string> = {
    camiseta: 'bg-blue-100 text-blue-700',
    valla_led: 'bg-green-100 text-green-700',
    overlay_digital: 'bg-purple-100 text-purple-700',
    cenefa: 'bg-orange-100 text-orange-700',
    panel_mediocampo: 'bg-pink-100 text-pink-700',
  }

  // Si es admin, puede ver cualquier sponsor. Si es client, solo ve el suyo.
  const isAdmin = user?.rol === 'admin'

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {sponsorName ? `Dashboard — ${sponsorName}` : 'Bienvenido a tu Dashboard'}
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          {user?.sponsor_id
            ? 'Metricas de sponsorship de tu marca en la Liga 1'
            : 'Selecciona una marca para ver sus metricas'}
        </p>

        {/* Solo mostrar selector si es admin o no tiene sponsor asignado */}
        {(isAdmin || !user?.sponsor_id) && (
          <div className="flex flex-wrap gap-2">
            {sponsors.map(s => (
              <button key={s.sponsor_id} onClick={() => { setSelectedSponsor(s.sponsor_id); setSponsorName(s.nombre) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedSponsor === s.sponsor_id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSponsor && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="SMV Total" value={loading ? '...' : fmt(summary.smv_total)} subtitle="Valor acumulado" gradient="from-indigo-500 to-purple-500" />
            <SummaryCard label="Detecciones" value={loading ? '...' : summary.detecciones.toLocaleString()} subtitle="Apariciones en video" gradient="from-blue-500 to-cyan-500" />
            <SummaryCard label="Partidos" value={loading ? '...' : summary.partidos.toString()} subtitle="Con presencia de marca" gradient="from-emerald-500 to-teal-500" />
            <SummaryCard label="Segundos en pantalla" value={loading ? '...' : `${summary.segundos.toLocaleString()}s`} subtitle="Exposicion total" gradient="from-orange-500 to-amber-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* By match */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">SMV por partido</h2>
                <p className="text-xs text-gray-400 mt-0.5">Valor por cada partido analizado</p>
              </div>
              <div className="divide-y divide-gray-50">
                {loading ? (
                  <div className="px-5 py-8 text-center text-gray-400">Cargando...</div>
                ) : byMatch.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400">Sin datos de partidos</div>
                ) : byMatch.map(m => (
                  <div key={m.match_id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.match_id.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.detecciones} detecciones</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{fmt(m.smv)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By position */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">SMV por posicion</h2>
                <p className="text-xs text-gray-400 mt-0.5">Donde aparece tu marca</p>
              </div>
              <div className="p-5 space-y-3">
                {loading ? (
                  <div className="py-8 text-center text-gray-400">Cargando...</div>
                ) : byPosition.length === 0 ? (
                  <div className="py-8 text-center text-gray-400">Sin datos de posicion</div>
                ) : byPosition.map(p => {
                  const pct = summary.smv_total > 0 ? (p.smv / summary.smv_total) * 100 : 0
                  return (
                    <div key={p.position_type}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionColors[p.position_type] || 'bg-gray-100 text-gray-600'}`}>
                            {p.position_type}
                          </span>
                          <span className="text-xs text-gray-400">{p.detecciones} det.</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{fmt(p.smv)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* CTA reportes */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Necesitas un reporte mas detallado?</h3>
              <p className="text-sm text-slate-400 mt-1">Genera reportes completos con desglose y exportalos en PDF.</p>
            </div>
            <Link href="/client/reports"
              className="px-5 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors whitespace-nowrap">
              Ver reportes
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, subtitle, gradient }: {
  label: string; value: string; subtitle: string; gradient: string
}) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg`}>
      <p className="text-xs text-white/70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-white/50 mt-1">{subtitle}</p>
    </div>
  )
}
