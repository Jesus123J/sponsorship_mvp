'use client'
import { useEffect, useState } from 'react'
import { getSponsors, getBrandDetections, getMenciones } from '@/lib/api'
import FilterBar from '@/components/FilterBar'
import ExportPDF from '@/components/ExportPDF'

export default function BrandView() {
  const [sponsors, setSponsors] = useState<any[]>([])
  const [selectedSponsor, setSelectedSponsor] = useState('')
  const [data, setData] = useState<any[]>([])
  const [menciones, setMenciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    matchId: '', sponsorId: '', entityId: '', positionType: '', matchPeriod: ''
  })

  useEffect(() => { getSponsors().then(setSponsors).catch(() => {}) }, [])

  useEffect(() => {
    if (!selectedSponsor) { setData([]); setMenciones([]); setLoading(false); return }
    setLoading(true)
    Promise.all([
      getBrandDetections(selectedSponsor, {
        match_id: filters.matchId || undefined,
        entity_id: filters.entityId || undefined,
        position_type: filters.positionType || undefined,
      }),
      getMenciones(selectedSponsor, filters.matchId || undefined),
    ])
      .then(([dets, mencs]) => {
        setData(dets.map((d: any) => ({ entity: d.entity_id, position: d.position_type, localidad: d.localidad || '', smv: d.smv, count: d.detecciones })))
        setMenciones(mencs)
        setLoading(false)
      })
      .catch(() => { setData([]); setMenciones([]); setLoading(false) })
  }, [selectedSponsor, filters])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
  const totalSMV = data.reduce((s, d) => s + d.smv, 0)

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand View</h1>
          <p className="text-gray-500 mt-1">Desglose SMV por sponsor — broadcast + audio</p>
        </div>
        <ExportPDF targetId="brand-content" filename="brand-view-report" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <label className="text-sm text-gray-500 block mb-2">Selecciona un sponsor:</label>
        <div className="flex flex-wrap gap-2">
          {sponsors.map(s => (
            <button key={s.sponsor_id} onClick={() => setSelectedSponsor(s.sponsor_id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedSponsor === s.sponsor_id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              {s.nombre}
            </button>
          ))}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showSponsor={false} />

      <div id="brand-content">
        {selectedSponsor && (
          <>
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-6 mb-6 text-white shadow-lg shadow-indigo-500/20">
              <p className="text-sm text-indigo-100">SMV total — {selectedSponsor}</p>
              <p className="text-3xl font-bold mt-1">{loading ? '...' : fmt(totalSMV)}</p>
              <div className="mt-4 flex gap-6 text-sm text-indigo-100">
                <span>{data.length} lineas de desglose</span>
                <span>{menciones.length} menciones audio</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Desglose broadcast</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Entidad</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Localidad</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Posicion</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">SMV</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Detecciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
                  ) : data.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{d.entity}</td>
                      <td className="px-5 py-3 text-sm">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.localidad === 'local' ? 'bg-blue-50 text-blue-700' : d.localidad === 'visitante' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'
                        }`}>{d.localidad || '\u2014'}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{d.position}</td>
                      <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{fmt(d.smv)}</td>
                      <td className="px-5 py-3 text-sm text-right text-gray-600">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {menciones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Menciones de audio ({menciones.length})</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {menciones.map((m, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">
                          {m.match_minute}&apos;
                        </span>
                        <span className="text-sm text-gray-900">&quot;{m.texto}&quot;</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{m.tipo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
