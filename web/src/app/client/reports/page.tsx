'use client'
import { useEffect, useState } from 'react'
import { getSponsors, getBrandDetections, getMenciones } from '@/lib/api'
import FilterBar from '@/components/FilterBar'
import ExportPDF from '@/components/ExportPDF'
import ErrorAlert from '@/components/ErrorAlert'

export default function ClientReports() {
  const [sponsors, setSponsors] = useState<any[]>([])
  const [selectedSponsor, setSelectedSponsor] = useState('')
  const [data, setData] = useState<any[]>([])
  const [menciones, setMenciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    matchId: '', sponsorId: '', entityId: '', positionType: '', matchPeriod: ''
  })

  useEffect(() => { getSponsors().then(setSponsors).catch((e) => setError(e.message)) }, [])

  const loadData = () => {
    if (!selectedSponsor) { setData([]); setMenciones([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    Promise.all([
      getBrandDetections(selectedSponsor, {
        match_id: filters.matchId || undefined,
        entity_id: filters.entityId || undefined,
        position_type: filters.positionType || undefined,
      }),
      getMenciones(selectedSponsor, filters.matchId || undefined),
    ])
      .then(([dets, mencs]) => {
        const rows = dets.data || dets
        setData(Array.isArray(rows) ? rows : [])
        setMenciones(mencs)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setData([]); setMenciones([]); setLoading(false) })
  }

  useEffect(() => { loadData() }, [selectedSponsor, filters])

  const fmt = (n: number) => `S/. ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
  const totalSMV = data.reduce((s: number, d: any) => s + (d.smv || 0), 0)

  return (
    <div>
      {error && <ErrorAlert message={error} onRetry={loadData} />}

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes Detallados</h1>
          <p className="text-gray-500 mt-1">Desglose completo de tu sponsorship con trazabilidad</p>
        </div>
        {selectedSponsor && <ExportPDF targetId="report-content" filename={`reporte-${selectedSponsor}`} />}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <label className="text-sm text-gray-500 block mb-2">Tu marca:</label>
        <select value={selectedSponsor} onChange={e => setSelectedSponsor(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white w-full max-w-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
          <option value="">-- Seleccionar sponsor --</option>
          {sponsors.map(s => (
            <option key={s.sponsor_id} value={s.sponsor_id}>{s.nombre} (Tier {s.tier_mvp})</option>
          ))}
        </select>
      </div>

      {selectedSponsor && (
        <>
          <FilterBar filters={filters} onChange={setFilters} showSponsor={false} />

          <div id="report-content">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
                <p className="text-xs text-white/70">SMV Total</p>
                <p className="text-2xl font-bold mt-1">{loading ? '...' : fmt(totalSMV)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400">Lineas de desglose</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : data.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400">Menciones audio</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : menciones.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Desglose por partido, entidad y posicion</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Partido</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Entidad</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Posicion</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Contexto</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Detecciones</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">SMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">Cargando...</td></tr>
                    ) : data.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No hay datos</td></tr>
                    ) : data.map((d, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-3 text-sm text-gray-600">{d.match_id?.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{d.entity_id}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{d.position_type}</td>
                        <td className="px-5 py-3 text-sm">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{d.context_type}</span>
                        </td>
                        <td className="px-5 py-3 text-sm text-right text-gray-600">{d.detecciones}</td>
                        <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{fmt(d.smv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {menciones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Menciones en audio ({menciones.length})</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {menciones.map((m, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">
                          {m.match_minute}&apos;
                        </span>
                        <div>
                          <p className="text-sm text-gray-900">&quot;{m.texto}&quot;</p>
                          <p className="text-xs text-gray-400">{m.match_id?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{m.tipo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
