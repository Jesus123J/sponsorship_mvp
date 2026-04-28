'use client'
import { useEffect, useState } from 'react'
import { getParametros, getMultiplicadores, getSponsors } from '@/lib/api'
import ErrorAlert from '@/components/ErrorAlert'

export default function SettingsPage() {
  const [parametros, setParametros] = useState<any[]>([])
  const [multiplicadores, setMultiplicadores] = useState<any[]>([])
  const [sponsors, setSponsors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'parametros' | 'multiplicadores' | 'sponsors'>('parametros')

  const loadData = () => {
    setLoading(true)
    setError(null)
    Promise.all([getParametros(), getMultiplicadores(), getSponsors()])
      .then(([p, m, s]) => {
        setParametros(p)
        setMultiplicadores(m)
        setSponsors(s)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const tabs = [
    { key: 'parametros' as const, label: 'Parametros de valoracion', count: parametros.length },
    { key: 'multiplicadores' as const, label: 'Multiplicadores contexto', count: multiplicadores.length },
    { key: 'sponsors' as const, label: 'Sponsors registrados', count: sponsors.length },
  ]

  if (error) return <ErrorAlert message={error} onRetry={loadData} />

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Configuracion</h1>
        <p className="text-gray-500 mt-1">Parametros del sistema, multiplicadores y sponsors</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">{tab.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Cargando...</div>
      ) : (
        <>
          {activeTab === 'parametros' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Canal</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo partido</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">CPM (S/.)</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Audiencia default</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Temporada</th>
                  </tr>
                </thead>
                <tbody>
                  {parametros.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm text-gray-400">{p.id}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.canal || '\u2014'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{p.tipo_partido || '\u2014'}</td>
                      <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{p.cpm_soles || '\u2014'}</td>
                      <td className="px-5 py-3 text-sm text-right text-gray-600">{(p.audiencia_default || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-sm text-right text-gray-500">{p.temporada || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'multiplicadores' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Contexto</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Multiplicador</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Descripcion</th>
                  </tr>
                </thead>
                <tbody>
                  {multiplicadores.map((m, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{m.context_type}</td>
                      <td className="px-5 py-3 text-sm text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          (m.multiplicador || 0) >= 1 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                        }`}>x{m.multiplicador}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{m.descripcion || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'sponsors' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sponsors.map(s => (
                <div key={s.sponsor_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 card-hover">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.nombre}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{s.sponsor_id}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      s.tier_mvp === 1 ? 'bg-amber-100 text-amber-700' : s.tier_mvp === 2 ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400'
                    }`}>Tier {s.tier_mvp}</span>
                  </div>
                  <p className="text-xs text-gray-500">{s.categoria || s.sector || ''}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
