'use client'
import { useEffect, useState } from 'react'
import { getMatches, getSponsors, getEntidades } from '@/lib/api'

interface Filters {
  matchId: string
  sponsorId: string
  entityId: string
  positionType: string
  matchPeriod: string
}

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  showSponsor?: boolean
  showEntity?: boolean
}

export default function FilterBar({ filters, onChange, showSponsor = true, showEntity = true }: FilterBarProps) {
  const [matches, setMatches] = useState<any[]>([])
  const [sponsors, setSponsors] = useState<any[]>([])
  const [entidades, setEntidades] = useState<any[]>([])

  useEffect(() => {
    getMatches().then(setMatches).catch(() => {})
    getSponsors().then(setSponsors).catch(() => {})
    getEntidades().then(setEntidades).catch(() => {})
  }, [])

  const update = (key: string, value: string) => {
    onChange({ ...filters, [key]: value })
  }

  const selectClass = "px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex flex-wrap gap-3">
        <select value={filters.matchId} onChange={e => update('matchId', e.target.value)} className={selectClass}>
          <option value="">Todos los partidos</option>
          {matches.map(m => (
            <option key={m.match_id} value={m.match_id}>
              {m.local_nombre && m.visitante_nombre
                ? `${m.local_nombre} vs ${m.visitante_nombre}`
                : m.match_id.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        {showSponsor && (
          <select value={filters.sponsorId} onChange={e => update('sponsorId', e.target.value)} className={selectClass}>
            <option value="">Todos los sponsors</option>
            {sponsors.map(s => (
              <option key={s.sponsor_id} value={s.sponsor_id}>{s.nombre}</option>
            ))}
          </select>
        )}

        {showEntity && (
          <select value={filters.entityId} onChange={e => update('entityId', e.target.value)} className={selectClass}>
            <option value="">Todas las entidades</option>
            {entidades.map(e => (
              <option key={e.entity_id} value={e.entity_id}>{e.nombre_corto}</option>
            ))}
          </select>
        )}

        <select value={filters.positionType} onChange={e => update('positionType', e.target.value)} className={selectClass}>
          <option value="">Todas las posiciones</option>
          <option value="camiseta">Camiseta</option>
          <option value="valla_led">Valla LED</option>
          <option value="overlay_digital">Overlay digital</option>
          <option value="cenefa">Cenefa</option>
          <option value="panel_mediocampo">Panel mediocampo</option>
        </select>

        <select value={filters.matchPeriod} onChange={e => update('matchPeriod', e.target.value)} className={selectClass}>
          <option value="">Todo el partido</option>
          <option value="primera_mitad">Primera mitad</option>
          <option value="entretiempo">Entretiempo</option>
          <option value="segunda_mitad">Segunda mitad</option>
        </select>

        {(filters.matchId || filters.sponsorId || filters.entityId || filters.positionType || filters.matchPeriod) && (
          <button onClick={() => onChange({ matchId: '', sponsorId: '', entityId: '', positionType: '', matchPeriod: '' })}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
