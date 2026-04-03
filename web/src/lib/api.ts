/**
 * Cliente API — conecta el frontend con FastAPI backend
 * Base URL: http://localhost:8000/api
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

async function fetchAPI<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ==================== DASHBOARD ====================

export async function getStats() {
  return fetchAPI<{
    partidos: number
    sponsors: number
    detecciones: number
    smv_total: number
  }>('/dashboard/stats')
}

export async function getTopSponsors(limit = 5) {
  return fetchAPI<Array<{
    sponsor_id: string
    nombre: string
    smv_total: number
    detecciones: number
  }>>(`/dashboard/top-sponsors?limit=${limit}`)
}

// ==================== SPONSORS ====================

export async function getSponsors() {
  return fetchAPI<any[]>('/sponsors/')
}

export async function getSponsorSummary(sponsorId: string) {
  return fetchAPI<{
    detecciones: number
    smv_total: number
    partidos: number
    segundos: number
  }>(`/sponsors/${sponsorId}/summary`)
}

export async function getSponsorByMatch(sponsorId: string) {
  return fetchAPI<Array<{ match_id: string; smv: number; detecciones: number }>>(
    `/sponsors/${sponsorId}/by-match`
  )
}

export async function getSponsorByPosition(sponsorId: string) {
  return fetchAPI<Array<{ position_type: string; smv: number; detecciones: number }>>(
    `/sponsors/${sponsorId}/by-position`
  )
}

export async function getSponsorSMV(sponsorId: string, matchId?: string) {
  const q = matchId ? `?match_id=${matchId}` : ''
  return fetchAPI<any[]>(`/sponsors/${sponsorId}/smv${q}`)
}

export async function getSponsorMenciones(sponsorId: string, matchId?: string) {
  const q = matchId ? `?match_id=${matchId}` : ''
  return fetchAPI<any[]>(`/sponsors/${sponsorId}/menciones${q}`)
}

// ==================== MATCHES ====================

export async function getMatches() {
  return fetchAPI<any[]>('/matches/')
}

export async function getMatchSponsors(matchId: string) {
  return fetchAPI<any[]>(`/matches/${matchId}/sponsors`)
}

// ==================== DETECTIONS ====================

export async function getLeagueDetections(filters: {
  match_id?: string
  position_type?: string
  match_period?: string
} = {}) {
  const params = new URLSearchParams()
  if (filters.match_id) params.set('match_id', filters.match_id)
  if (filters.position_type) params.set('position_type', filters.position_type)
  if (filters.match_period) params.set('match_period', filters.match_period)
  const q = params.toString() ? `?${params}` : ''
  return fetchAPI<any[]>(`/detections/league${q}`)
}

export async function getPropertyDetections(entityId: string, filters: {
  match_id?: string
  position_type?: string
} = {}) {
  const params = new URLSearchParams()
  if (filters.match_id) params.set('match_id', filters.match_id)
  if (filters.position_type) params.set('position_type', filters.position_type)
  const q = params.toString() ? `?${params}` : ''
  return fetchAPI<any[]>(`/detections/property/${entityId}${q}`)
}

export async function getBrandDetections(sponsorId: string, filters: {
  match_id?: string
  entity_id?: string
  position_type?: string
} = {}) {
  const params = new URLSearchParams()
  if (filters.match_id) params.set('match_id', filters.match_id)
  if (filters.entity_id) params.set('entity_id', filters.entity_id)
  if (filters.position_type) params.set('position_type', filters.position_type)
  const q = params.toString() ? `?${params}` : ''
  return fetchAPI<any[]>(`/detections/brand/${sponsorId}${q}`)
}

export async function getMenciones(sponsorId?: string, matchId?: string) {
  const params = new URLSearchParams()
  if (sponsorId) params.set('sponsor_id', sponsorId)
  if (matchId) params.set('match_id', matchId)
  const q = params.toString() ? `?${params}` : ''
  return fetchAPI<any[]>(`/detections/menciones${q}`)
}

// ==================== SETTINGS ====================

export async function getParametros() {
  return fetchAPI<any[]>('/settings/parametros')
}

export async function getMultiplicadores() {
  return fetchAPI<any[]>('/settings/multiplicadores')
}

export async function getEntidades() {
  return fetchAPI<any[]>('/settings/entidades')
}

export async function getClubs() {
  return fetchAPI<any[]>('/settings/entidades/clubs')
}
