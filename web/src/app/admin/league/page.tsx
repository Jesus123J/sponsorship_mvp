'use client'
import { useEffect, useState } from 'react'
import { getLeagueDetections } from '@/lib/api'
import FilterBar from '@/components/FilterBar'
import ExportPDF from '@/components/ExportPDF'

export default function LeagueView() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    matchId: '', sponsorId: '', entityId: 'liga_1', positionType: '', matchPeriod: ''
  })

  useEffect(() => {
    setLoading(true)
    getLeagueDetections({
      match_id: filters.matchId || undefined,
      position_type: filters.positionType || undefined,
      match_period: filters.matchPeriod || undefined,
    })
      .then(rows => {
        setData(rows.map(r => ({ sponsor: r.nombre || r.sponsor_id, smv: r.smv, count: r.detecciones, seconds: r.segundos })))
        setLoading(false)
      })
      .catch(() => { setData([]); setLoading(false) })
  }, [filters])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
  const totalSMV = data.reduce((s, d) => s + d.smv, 0)

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">League View</h1>
          <p className="text-gray-500 mt-1">Valor de sponsors de Liga 1 / L1MAX por partido</p>
        </div>
        <ExportPDF targetId="league-content" filename="league-view-report" />
      </div>

      <FilterBar filters={filters} onChange={setFilters} showSponsor={false} showEntity={false} />

      <div id="league-content">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 mb-6 text-white shadow-lg shadow-orange-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-100">SMV total Liga 1</p>
              <p className="text-3xl font-bold mt-1">{loading ? '...' : fmt(totalSMV)}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-6 text-sm text-orange-100">
            <span>{data.length} sponsors</span>
            <span>{data.reduce((s, d) => s + d.count, 0).toLocaleString()} detecciones</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sponsor</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">SMV</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detecciones</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Segundos</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">% del total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Cargando datos...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No hay datos con estos filtros</td></tr>
              ) : data.map((d, i) => (
                <tr key={d.sponsor} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{d.sponsor}</td>
                  <td className="px-5 py-3.5 text-sm text-right font-semibold text-gray-900">{fmt(d.smv)}</td>
                  <td className="px-5 py-3.5 text-sm text-right text-gray-600">{d.count.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm text-right text-gray-600">{d.seconds.toLocaleString()}s</td>
                  <td className="px-5 py-3.5 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${totalSMV > 0 ? (d.smv / totalSMV) * 100 : 0}%` }} />
                      </div>
                      <span className="text-gray-500 w-12 text-right">{totalSMV > 0 ? `${((d.smv / totalSMV) * 100).toFixed(1)}%` : '0%'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
