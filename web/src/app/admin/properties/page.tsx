'use client'
import { useEffect, useState } from 'react'
import { getClubs, getPropertyDetections } from '@/lib/api'
import FilterBar from '@/components/FilterBar'
import ExportPDF from '@/components/ExportPDF'
import ErrorAlert from '@/components/ErrorAlert'

export default function PropertyView() {
  const [entidades, setEntidades] = useState<any[]>([])
  const [selectedEntity, setSelectedEntity] = useState('')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubsError, setClubsError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    matchId: '', sponsorId: '', entityId: '', positionType: '', matchPeriod: ''
  })

  useEffect(() => {
    getClubs().then(setEntidades).catch((e) => setClubsError(e.message))
  }, [])

  const loadData = () => {
    if (!selectedEntity) { setData([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    getPropertyDetections(selectedEntity, {
      match_id: filters.matchId || undefined,
      position_type: filters.positionType || undefined,
    })
      .then(result => {
        const rows = result.data || result
        setData((Array.isArray(rows) ? rows : []).map((r: any) => ({
          sponsor: r.nombre || r.sponsor_id, smv: r.smv, count: r.detecciones,
          localCount: r.local_count, visitCount: r.visit_count,
        })))
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setData([]); setLoading(false) })
  }

  useEffect(() => { loadData() }, [selectedEntity, filters])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
  const totalSMV = data.reduce((s, d) => s + d.smv, 0)

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Property View</h1>
          <p className="text-gray-500 mt-1">Valor generado para los sponsors de cada club</p>
        </div>
        <ExportPDF targetId="property-content" filename="property-view-report" />
      </div>

      {clubsError && <ErrorAlert message={clubsError} onRetry={() => { setClubsError(null); getClubs().then(setEntidades).catch((e) => setClubsError(e.message)) }} />}
      {error && <ErrorAlert message={error} onRetry={loadData} />}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <label className="text-sm text-gray-500 block mb-3">Selecciona un club:</label>
        <div className="flex gap-3">
          {entidades.map(e => (
            <button key={e.entity_id} onClick={() => setSelectedEntity(e.entity_id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                selectedEntity === e.entity_id
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              {e.nombre_corto}
            </button>
          ))}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showSponsor={false} showEntity={false} />

      <div id="property-content">
        {selectedEntity && (
          <>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 mb-6 text-white shadow-lg shadow-emerald-500/20">
              <p className="text-sm text-emerald-100">SMV total — {selectedEntity}</p>
              <p className="text-3xl font-bold mt-1">{loading ? '...' : fmt(totalSMV)}</p>
              <div className="mt-4 flex gap-6 text-sm text-emerald-100">
                <span>{data.length} sponsors</span>
                <span>{data.reduce((s, d) => s + d.count, 0).toLocaleString()} detecciones</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Sponsor</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">SMV</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Detecciones</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Como local</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase">Como visitante</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
                  ) : data.map((d, i) => (
                    <tr key={d.sponsor} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3.5">
                        <span className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-xs font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                        }`}>{i + 1}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{d.sponsor}</td>
                      <td className="px-5 py-3.5 text-sm text-right font-semibold text-gray-900">{fmt(d.smv)}</td>
                      <td className="px-5 py-3.5 text-sm text-right text-gray-600">{d.count}</td>
                      <td className="px-5 py-3.5 text-sm text-right">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{d.localCount}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-right">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{d.visitCount}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
