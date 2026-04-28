'use client'
import { useEffect, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const colorFor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 70%, 50%)`
}

export default function AnalyzeVideoPage() {
  const [videos, setVideos] = useState<any[]>([])
  const [selected, setSelected] = useState<string>('')
  const [fps, setFps] = useState(5)
  const [confidence, setConfidence] = useState(0.25)
  const [status, setStatus] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [detections, setDetections] = useState<any>(null)
  const [filterSponsor, setFilterSponsor] = useState('')
  const [filterSource, setFilterSource] = useState<'all' | 'jugador' | 'estadio' | 'tribuna_staff'>('all')
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [jumpToTime, setJumpToTime] = useState<number | null>(null)
  // Catalogo + partido info
  const [equipos, setEquipos] = useState<any[]>([])
  const [estadios, setEstadios] = useState<any[]>([])
  const [torneos, setTorneos] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [matchForm, setMatchForm] = useState({ equipo_local: '', equipo_visitante: '', torneo_id: '', estadio_id: '' })
  const [savingMatch, setSavingMatch] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [viewingDet, setViewingDet] = useState<any>(null)
  const [frameDataUrl, setFrameDataUrl] = useState<string>('')
  const [frameLoading, setFrameLoading] = useState(false)
  const pollRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [r2Videos, setR2Videos] = useState<any[]>([])
  const [r2Configured, setR2Configured] = useState(false)
  const [importingR2, setImportingR2] = useState<string>('')

  const importFromR2 = async (remoteKey: string) => {
    const filename = remoteKey.split('/').pop() || remoteKey
    const defaultId = filename.replace(/\.mp4$/i, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const matchId = prompt(`match_id para guardar:`, defaultId)
    if (!matchId) return
    setImportingR2(remoteKey)
    try {
      const res = await authFetch(`${API}/storage/import-video`, {
        method: 'POST',
        body: JSON.stringify({ remote_key: remoteKey, match_id: matchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ Importado: ${data.match_id}. Selecciónalo abajo.`)
      authFetch(`${API}/training/videos`).then(r => r.json()).then(setVideos).catch(() => {})
      setSelected(matchId)
    } catch (e: any) { alert(e.message) }
    setImportingR2('')
  }

  useEffect(() => {
    authFetch(`${API}/training/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    authFetch(`${API}/catalog/equipos`).then(r => r.json()).then(setEquipos).catch(() => {})
    authFetch(`${API}/catalog/estadios`).then(r => r.json()).then(setEstadios).catch(() => {})
    authFetch(`${API}/catalog/torneos`).then(r => r.json()).then(setTorneos).catch(() => {})
    authFetch(`${API}/catalog/partidos`).then(r => r.json()).then(setPartidos).catch(() => {})
    authFetch(`${API}/storage/status`).then(r => r.ok ? r.json() : null).then(s => {
      if (s?.configured && !s.error) {
        setR2Configured(true)
        authFetch(`${API}/storage/videos`).then(r => r.ok ? r.json() : []).then(setR2Videos).catch(() => {})
      }
    }).catch(() => {})
    authFetch(`${API}/training/analyze-video/status`).then(r => r.json()).then(s => {
      if (s?.running) {
        setStatus(s); setSelected(s.match_id)
        startPolling()
      } else if (s?.finished_at && !s.error && s.match_id) {
        setStatus(s); setSelected(s.match_id)
        loadResult(s.match_id)
      }
    }).catch(() => {})
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Cuando cambia el video seleccionado, carga datos del partido
  useEffect(() => {
    if (!selected) return
    const p = partidos.find((pp: any) => pp.match_id === selected)
    setMatchForm({
      equipo_local: p?.equipo_local && p.equipo_local !== 'desconocido' ? p.equipo_local : '',
      equipo_visitante: p?.equipo_visitante && p.equipo_visitante !== 'desconocido' ? p.equipo_visitante : '',
      torneo_id: p?.torneo_id || '',
      estadio_id: p?.estadio_id || '',
    })
  }, [selected, partidos])

  const selectedPartido = partidos.find((p: any) => p.match_id === selected)
  const matchConfigured = !!(selectedPartido &&
    selectedPartido.equipo_local &&
    selectedPartido.equipo_local !== 'desconocido' &&
    selectedPartido.equipo_visitante &&
    selectedPartido.equipo_visitante !== 'desconocido')

  const saveMatchConfig = async () => {
    if (!selected) return
    setSaveResult(null)
    if (!matchForm.equipo_local || !matchForm.equipo_visitante) {
      setSaveResult({ ok: false, msg: 'Selecciona equipo local y visitante' })
      return
    }
    setSavingMatch(true)
    try {
      // Construir payload sin valores vacios
      const payload: any = { match_id: selected }
      for (const k of ['equipo_local', 'equipo_visitante', 'torneo_id', 'estadio_id'] as const) {
        if (matchForm[k]) payload[k] = matchForm[k]
      }

      const res = await authFetch(`${API}/catalog/partidos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        // data.detail puede ser un string, un array (Pydantic) o un objeto
        let msg = ''
        if (typeof data.detail === 'string') msg = data.detail
        else if (Array.isArray(data.detail)) msg = data.detail.map((e: any) => `${(e.loc || []).join('.')}: ${e.msg}`).join(' | ')
        else if (data.detail) msg = JSON.stringify(data.detail)
        else msg = JSON.stringify(data)
        throw new Error(`HTTP ${res.status} — ${msg}`)
      }

      // Recargar partidos
      const updated = await authFetch(`${API}/catalog/partidos`).then(r => r.json())
      setPartidos(updated)

      const p = updated.find((pp: any) => pp.match_id === selected)
      if (p && p.equipo_local === matchForm.equipo_local) {
        setSaveResult({
          ok: true,
          msg: `Guardado: ${p.local_nombre || p.equipo_local} vs ${p.visitante_nombre || p.equipo_visitante}. ¡Ya puedes re-analizar el video!`,
        })
      } else {
        setSaveResult({ ok: false, msg: 'El backend no confirmo el cambio. Revisa los logs.' })
      }
    } catch (e: any) {
      setSaveResult({ ok: false, msg: `Error: ${e.message}` })
    }
    setSavingMatch(false)
  }

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    const doPoll = async () => {
      try {
        const s = await authFetch(`${API}/training/analyze-video/status`).then(r => r.json())
        setStatus(s)
        if (!s.running) {
          clearInterval(pollRef.current); pollRef.current = null
          if (!s.error && s.match_id) loadResult(s.match_id)
        }
      } catch {}
    }
    doPoll()
    pollRef.current = setInterval(doPoll, 2000)
  }

  const loadResult = async (matchId: string) => {
    try {
      const [tok, dets] = await Promise.all([
        authFetch(`${API}/training/analyze-video/${matchId}/token`).then(r => r.json()),
        authFetch(`${API}/training/analyze-video/${matchId}/detections`).then(r => r.json()),
      ])
      setVideoUrl(`${API}/training/analyze-video/${matchId}/stream?token=${tok.token}`)
      setDetections(dets)
    } catch (err: any) { console.error(err) }
  }

  const startAnalysis = async () => {
    if (!selected) return alert('Selecciona un video')
    setVideoUrl(null); setDetections(null)
    try {
      const res = await authFetch(`${API}/training/analyze-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: selected, fps, confidence }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setStatus({ running: true, progress: 'Iniciando...', percent: 0, log: [], match_id: selected })
      startPolling()
    } catch (err: any) { alert(err.message) }
  }

  const downloadAnnotatedVideo = async () => {
    if (!selected) return
    try {
      const tok = await authFetch(`${API}/training/analyze-video/${selected}/token`).then(r => r.json())
      window.open(`${API}/training/analyze-video/${selected}/stream?token=${tok.token}`, '_blank')
    } catch { alert('Error al descargar') }
  }

  const downloadDetectionsJson = () => {
    if (!detections) return
    const blob = new Blob([JSON.stringify(detections, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selected}_detections.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadDetectionsCsv = () => {
    if (!detections?.detections) return
    const rows = [
      ['frame', 'timestamp_seg', 'timestamp', 'sponsor', 'source', 'entity_id', 'player_overlap', 'pitch_ratio', 'color_distance', 'confidence', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'persons_in_frame'],
      ...detections.detections.map((d: any) => [
        d.frame, d.timestamp, d.timestamp_str, d.sponsor,
        d.source || 'estadio',
        d.entity_id || '', d.player_overlap || 0, d.pitch_ratio || 0, d.color_distance || '',
        d.confidence,
        d.bbox[0], d.bbox[1], d.bbox[2], d.bbox[3], d.width, d.height,
        d.persons_in_frame || 0,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selected}_detections.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const seekTo = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec
      videoRef.current.play()
    }
    setJumpToTime(sec)
  }

  // Abre panel flotante con el frame capturado + datos de la deteccion
  const viewDetection = async (det: any) => {
    setViewingDet(det)
    setFrameDataUrl('')
    setFrameLoading(true)

    // Intento 1: canvas del <video> (rapido, sin network)
    const v = videoRef.current
    let canvasOk = false

    if (v && v.videoWidth > 0) {
      try {
        v.pause()
        await new Promise<void>((resolve) => {
          const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve() }
          v.addEventListener('seeked', onSeeked)
          v.currentTime = det.timestamp
          setTimeout(resolve, 1500)
        })

        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const [x1, y1, x2, y2] = det.bbox
          const boxColor = det.on_player ? '#fbbf24' : det.source === 'tribuna_staff' ? '#9ca3af' : '#3b82f6'
          ctx.lineWidth = Math.max(3, canvas.width / 400)
          ctx.strokeStyle = boxColor
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
          ctx.font = `bold ${Math.max(16, canvas.width / 50)}px sans-serif`
          const icon = det.on_player ? '[J]' : det.source === 'tribuna_staff' ? '[T]' : '[V]'
          const label = `${icon} ${det.sponsor} ${(det.confidence * 100).toFixed(0)}%`
          const tw = ctx.measureText(label).width
          const th = Math.max(20, canvas.width / 45)
          ctx.fillStyle = boxColor
          ctx.fillRect(x1, Math.max(0, y1 - th - 8), tw + 16, th + 8)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, x1 + 8, Math.max(th, y1 - 10))

          // toDataURL falla con SecurityError si el video esta tainted
          setFrameDataUrl(canvas.toDataURL('image/jpeg', 0.85))
          canvasOk = true
        }
      } catch (e) {
        console.warn('Canvas capture fallo (probable taint), uso backend ffmpeg:', e)
      }
    }

    // Intento 2 (fallback): pedir el frame al backend via ffmpeg
    if (!canvasOk && selected) {
      try {
        const tok = await authFetch(`${API}/training/analyze-video/${selected}/token`).then(r => r.json())
        const frameUrl = `${API}/training/analyze-video/${selected}/frame?seconds=${det.timestamp}&token=${tok.token}`
        const imgRes = await fetch(frameUrl)
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)
        const blob = await imgRes.blob()
        setFrameDataUrl(URL.createObjectURL(blob))
      } catch (e: any) {
        console.error('Backend frame fallo:', e)
      }
    }

    setFrameLoading(false)
  }

  const closeFrameView = () => {
    setViewingDet(null)
    setFrameDataUrl('')
  }

  // Borra una deteccion del resultado en memoria + recalcula resumenes.
  // No requiere endpoint backend — solo modifica el state local.
  const markAsFalsePositive = (det: any) => {
    if (!detections) return
    if (!confirm(`Marcar como FALSO POSITIVO?\n\nSe borrara la deteccion de "${det.sponsor}" en el frame ${det.frame}.`)) return

    // 1. Filtrar la deteccion del array
    const newDets = detections.detections.filter((d: any) =>
      !(d.frame === det.frame && d.sponsor === det.sponsor &&
        d.bbox[0] === det.bbox[0] && d.bbox[1] === det.bbox[1])
    )

    // 2. Recalcular resumenes
    const sponsorCounts: Record<string, number> = {}
    const bySource: any = { jugador: 0, estadio: 0, tribuna_staff: 0 }
    const byEntity: any = {}
    const sponsorsBySource: any = {}
    const sponsorsByEntity: any = {}

    for (const d of newDets) {
      sponsorCounts[d.sponsor] = (sponsorCounts[d.sponsor] || 0) + 1
      const src = d.source || 'estadio'
      bySource[src] = (bySource[src] || 0) + 1
      const eid = d.entity_id || 'sin_equipo'
      byEntity[eid] = (byEntity[eid] || 0) + 1

      if (!sponsorsBySource[d.sponsor]) sponsorsBySource[d.sponsor] = { jugador: 0, estadio: 0, tribuna_staff: 0 }
      sponsorsBySource[d.sponsor][src] = (sponsorsBySource[d.sponsor][src] || 0) + 1

      if (!sponsorsByEntity[d.sponsor]) sponsorsByEntity[d.sponsor] = {}
      sponsorsByEntity[d.sponsor][eid] = (sponsorsByEntity[d.sponsor][eid] || 0) + 1
    }

    setDetections({
      ...detections,
      detections: newDets,
      total_detections: newDets.length,
      sponsors_summary: sponsorCounts,
      by_source: bySource,
      by_entity: byEntity,
      sponsors_by_source: sponsorsBySource,
      sponsors_by_entity: sponsorsByEntity,
    })
    closeFrameView()
  }

  const filteredDets = detections?.detections?.filter((d: any) => {
    if (filterSponsor && !d.sponsor.toLowerCase().includes(filterSponsor.toLowerCase())) return false
    if (filterSource !== 'all' && d.source !== filterSource) return false
    if (filterEntity !== 'all' && (d.entity_id || 'sin_equipo') !== filterEntity) return false
    return true
  }) || []

  const sponsorsSummary = detections?.sponsors_summary
    ? Object.entries(detections.sponsors_summary).sort((a: any, b: any) => b[1] - a[1])
    : []

  const isRunning = status?.running
  const hasResult = !!videoUrl && !!detections

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analizar video (con cuadros)</h1>
        <p className="text-gray-500 mt-1">Corre YOLO sobre el clip, dibuja cuadros en cada logo y te devuelve video + tabla de detecciones.</p>
      </div>

      {/* Config */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">1. Elegir video y parametros</h2>

        {/* R2 import */}
        {r2Configured && r2Videos.length > 0 && (
          <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-3">
            <p className="text-xs font-bold text-purple-900 mb-2">☁ Importar desde Cloudflare R2</p>
            <div className="flex flex-wrap gap-2">
              {r2Videos.map((v: any) => {
                const filename = v.key.split('/').pop()
                const localExists = videos.some((lv: any) => lv.match_id === filename?.replace(/\.mp4$/i, '').toLowerCase())
                return (
                  <button key={v.key} onClick={() => importFromR2(v.key)}
                    disabled={importingR2 === v.key || localExists}
                    title={localExists ? 'Ya importado' : 'Importar a local'}
                    className={`px-2 py-1 rounded text-[10px] font-medium ${
                      localExists ? 'bg-emerald-100 text-emerald-700' :
                      importingR2 === v.key ? 'bg-gray-100 text-gray-400' :
                      'bg-purple-600 text-white hover:bg-purple-700'
                    }`}>
                    {localExists ? '✓' : importingR2 === v.key ? '⏳' : '⬇'} {filename} ({v.size_mb}MB)
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Video</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
              <option value="">Selecciona un video</option>
              {videos.map(v => (
                <option key={v.filename} value={v.match_id}>{v.match_id} ({v.size_mb} MB)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">FPS de analisis ({fps})</label>
            <input type="range" min={1} max={15} step={1} value={fps}
              onChange={e => setFps(parseInt(e.target.value))}
              className="w-full" />
            <p className="text-[11px] text-gray-400 mt-1">
              Mas fps = mas preciso pero mas lento. <strong>5</strong> funciona bien.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Umbral confianza ({confidence.toFixed(2)})</label>
            <input type="range" min={0.05} max={0.95} step={0.05} value={confidence}
              onChange={e => setConfidence(parseFloat(e.target.value))}
              className="w-full" />
            <p className="text-[11px] text-gray-400 mt-1">
              Mas bajo = mas detecciones (y mas falsos positivos).
            </p>
          </div>
        </div>

        {/* Configuracion del partido (para atribucion por equipo) */}
        {selected && (
          <div className={`rounded-xl p-4 mb-4 border-2 ${
            matchConfigured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'
          }`}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-xl">{matchConfigured ? '✅' : '⚠'}</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${matchConfigured ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {matchConfigured
                    ? `Partido configurado: ${selectedPartido?.local_nombre || matchForm.equipo_local} vs ${selectedPartido?.visitante_nombre || matchForm.equipo_visitante}`
                    : 'Partido sin equipos — configura antes de analizar para atribuir logos al equipo correcto'}
                </p>
                <p className={`text-xs mt-0.5 ${matchConfigured ? 'text-emerald-700' : 'text-amber-800'}`}>
                  Los colores de estos equipos se usaran para decidir de qué equipo es cada logo detectado sobre un jugador.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Equipo local</label>
                <select value={matchForm.equipo_local}
                  onChange={e => setMatchForm({ ...matchForm, equipo_local: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  <option value="">—</option>
                  {equipos.map((eq: any) => (
                    <option key={eq.entity_id} value={eq.entity_id}>{eq.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Equipo visitante</label>
                <select value={matchForm.equipo_visitante}
                  onChange={e => setMatchForm({ ...matchForm, equipo_visitante: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  <option value="">—</option>
                  {equipos.map((eq: any) => (
                    <option key={eq.entity_id} value={eq.entity_id}>{eq.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Torneo</label>
                <select value={matchForm.torneo_id}
                  onChange={e => setMatchForm({ ...matchForm, torneo_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  <option value="">—</option>
                  {torneos.map((t: any) => (
                    <option key={t.torneo_id} value={t.torneo_id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Estadio</label>
                <select value={matchForm.estadio_id}
                  onChange={e => setMatchForm({ ...matchForm, estadio_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  <option value="">—</option>
                  {estadios.map((e: any) => (
                    <option key={e.estadio_id} value={e.estadio_id}>{e.nombre} ({e.ciudad})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={saveMatchConfig} disabled={savingMatch}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {savingMatch ? 'Guardando...' : '💾 Guardar configuracion del partido'}
              </button>
              {matchConfigured && (
                <button onClick={startAnalysis} disabled={isRunning}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {isRunning ? 'Analizando...' : '🔄 Re-analizar con atribucion de equipo'}
                </button>
              )}
            </div>

            {saveResult && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                saveResult.ok ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                                'bg-red-100 text-red-900 border border-red-300'
              }`}>
                {saveResult.ok ? '✅ ' : '❌ '}{saveResult.msg}
              </div>
            )}
          </div>
        )}

        <button onClick={startAnalysis} disabled={!selected || isRunning}
          className="w-full md:w-auto px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {isRunning ? 'Analizando...' : matchConfigured ? 'Iniciar analisis' : 'Iniciar analisis (sin atribucion de equipo)'}
        </button>
      </div>

      {/* Progress */}
      {status && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">2. Progreso</h2>

          <div className={`rounded-xl p-4 ${
            status.error ? 'bg-red-50 border border-red-200' :
            isRunning ? 'bg-indigo-50 border border-indigo-200' :
            'bg-emerald-50 border border-emerald-200'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {isRunning && <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />}
                {!isRunning && !status.error && (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
                {status.error && <span className="text-red-600 font-bold">!</span>}
                <p className={`text-sm font-medium ${
                  status.error ? 'text-red-700' : isRunning ? 'text-indigo-700' : 'text-emerald-700'
                }`}>{status.progress}</p>
              </div>
              {typeof status.percent === 'number' && (
                <span className="text-lg font-bold text-indigo-700">{status.percent}%</span>
              )}
            </div>
            {typeof status.percent === 'number' && (
              <div className="mt-3 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${status.percent}%` }} />
              </div>
            )}
          </div>

          {status.log?.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4 mt-3 max-h-48 overflow-y-auto">
              {status.log.slice(-50).map((line: string, i: number) => (
                <p key={i} className={`text-xs font-mono leading-relaxed ${
                  line.includes('ERROR') ? 'text-red-400' :
                  line.includes('->') || line.includes('Completado') || line.includes('listo') ? 'text-emerald-400' :
                  'text-slate-400'
                }`}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {hasResult && (
        <>
          {/* Video anotado */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">3. Video con cuadros</h2>
              <button onClick={downloadAnnotatedVideo}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Descargar MP4
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} src={videoUrl!} controls preload="metadata" crossOrigin="anonymous" className="w-full max-h-[500px]" />
            </div>
          </div>

          {/* Resumen por fuente (jugador / estadio) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              4. Fuente de las detecciones ({detections.total_detections} totales)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <button onClick={() => setFilterSource(filterSource === 'jugador' ? 'all' : 'jugador')}
                className={`rounded-xl p-4 text-left border-2 transition-all ${
                  filterSource === 'jugador' ? 'border-amber-500 bg-amber-50' : 'border-gray-100 hover:border-amber-300'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">👕</span>
                  <p className="text-sm font-semibold text-gray-900">En camiseta del jugador</p>
                </div>
                <p className="text-2xl font-bold text-amber-700">{detections.by_source?.jugador || 0}</p>
                <p className="text-[11px] text-gray-500">
                  Logos detectados sobre una persona (overlap &ge; 50%)
                </p>
              </button>
              <button onClick={() => setFilterSource(filterSource === 'estadio' ? 'all' : 'estadio')}
                className={`rounded-xl p-4 text-left border-2 transition-all ${
                  filterSource === 'estadio' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-300'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🏟</span>
                  <p className="text-sm font-semibold text-gray-900">En estadio/valla/bandera</p>
                </div>
                <p className="text-2xl font-bold text-blue-700">{detections.by_source?.estadio || 0}</p>
                <p className="text-[11px] text-gray-500">
                  Paneles, LEDs, banderas y todo lo que no esta sobre un jugador
                </p>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 italic">
              El sistema corre 2 modelos: tu modelo de logos + YOLOv8 pre-entrenado que detecta personas. Si el logo se solapa &ge;50% con una persona, se clasifica como &quot;camiseta&quot;.
            </p>
          </div>

          {/* Atribucion por equipo */}
          {detections.by_entity && Object.keys(detections.by_entity).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                5. Detecciones por equipo (atribucion por color de camiseta)
              </h2>
              {detections.teams_available?.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                  <p className="text-xs text-amber-800">
                    ⚠ Este partido se registro con equipos &quot;desconocidos&quot; — la atribucion por equipo no esta disponible.
                    Para usar esta funcion, registra el partido con <code>equipo_local</code> y <code>equipo_visitante</code> validos.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(detections.by_entity).map(([entity, count]: any) => {
                  const isLeague = entity === "liga_1"
                  const isUnknown = entity === "sin_equipo"
                  const label = isLeague ? "Liga 1 (estadio/vallas)" : isUnknown ? "Sin atribuir" : entity
                  return (
                    <button key={entity} onClick={() => setFilterEntity(filterEntity === entity ? 'all' : entity)}
                      className={`rounded-xl p-3 text-left border-2 transition-all ${
                        filterEntity === entity ? 'border-orange-500 bg-orange-50' :
                        isLeague ? 'border-blue-100 hover:border-blue-300 bg-blue-50/40' :
                        isUnknown ? 'border-gray-100 hover:border-gray-300 bg-gray-50/40' :
                        'border-gray-100 hover:border-orange-300'
                      }`}>
                      <p className="text-xs font-semibold text-gray-900 truncate">{label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
                      <p className="text-[10px] text-gray-400">detecciones</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* GRAFICOS — visualizacion rapida */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              📊 Visualizacion estadistica
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bar chart: top sponsors por detecciones */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Top 10 Sponsors por detecciones</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={(() => {
                    return Object.entries(detections.sponsors_summary || {})
                      .sort((a: any, b: any) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([name, count]: any) => ({ name, count, color: colorFor(name) }))
                  })()} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={75} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {Object.entries(detections.sponsors_summary || {})
                        .sort((a: any, b: any) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([name]: any, i: number) => (
                          <Cell key={i} fill={colorFor(name)} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart: distribucion por fuente */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Distribucion por fuente</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '👕 Jugador en cancha', value: detections.by_source?.jugador || 0, color: '#f59e0b' },
                        { name: '🏟 Estadio / valla', value: detections.by_source?.estadio || 0, color: '#3b82f6' },
                        { name: '👥 Tribuna / staff', value: detections.by_source?.tribuna_staff || 0, color: '#9ca3af' },
                      ].filter(d => d.value > 0)}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                      label={(e: any) => `${e.value}`}
                    >
                      {[
                        { color: '#f59e0b' }, { color: '#3b82f6' }, { color: '#9ca3af' },
                      ].map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart: distribucion por equipo (donut) */}
              {detections.by_entity && Object.keys(detections.by_entity).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Distribucion por equipo / liga</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={Object.entries(detections.by_entity || {})
                          .filter(([_, v]: any) => v > 0)
                          .map(([name, value]: any) => ({
                            name: name === 'liga_1' ? 'Liga 1' : name === 'sin_equipo' ? 'Sin atribuir' : name,
                            value,
                          }))}
                        dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={50} outerRadius={90}
                        label={(e: any) => `${e.value}`}
                      >
                        {Object.entries(detections.by_entity || {}).filter(([_, v]: any) => v > 0).map(([name]: any, i: number) => {
                          const c = name === 'liga_1' ? '#3b82f6' : name === 'sin_equipo' ? '#9ca3af' : ['#f97316', '#10b981', '#a855f7'][i % 3]
                          return <Cell key={i} fill={c} />
                        })}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Bar chart: timeline de detecciones por minuto */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Detecciones por minuto del clip</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={(() => {
                    const buckets: Record<number, number> = {}
                    for (const d of detections.detections || []) {
                      const minute = Math.floor(d.timestamp / 60)
                      buckets[minute] = (buckets[minute] || 0) + 1
                    }
                    return Object.entries(buckets)
                      .map(([min, count]) => ({ minute: `${min}m`, count }))
                      .sort((a, b) => parseInt(a.minute) - parseInt(b.minute))
                  })()}>
                    <XAxis dataKey="minute" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* MATRIZ SPONSOR × (EQUIPO / ESTADIO / OVERLAY) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              6. Matriz — ¿Qué marca aparece donde?
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Vista cruzada: cada sponsor × cada equipo / estadio. Ideal para responder &quot;¿qué sponsors aparecen en camiseta de Alianza?&quot;.
            </p>
            {(() => {
              const dets = detections.detections || []
              const sponsors = Object.keys(detections.sponsors_summary || {}).sort()

              // Columnas: cada equipo real + 🏟 estadio
              const realTeams = Object.keys(detections.by_entity || {})
                .filter(e => e !== 'liga_1' && e !== 'sin_equipo')
                .sort()

              // Construir matriz: sponsor → { jugador_<team>: n, estadio: n }
              const matrix: Record<string, Record<string, number>> = {}
              for (const sp of sponsors) matrix[sp] = {}
              for (const d of dets) {
                const row = matrix[d.sponsor] || (matrix[d.sponsor] = {})
                if (d.source === 'jugador' && d.entity_id) {
                  const key = `jugador_${d.entity_id}`
                  row[key] = (row[key] || 0) + 1
                } else {
                  row['estadio'] = (row['estadio'] || 0) + 1
                }
              }

              const getTeamName = (eid: string) => equipos.find((e: any) => e.entity_id === eid)?.nombre_corto || eid

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase border-b border-gray-200 sticky left-0 bg-gray-50 z-10">
                          Sponsor
                        </th>
                        {realTeams.map(team => (
                          <th key={team} className="text-center px-3 py-2 font-semibold border-b border-gray-200">
                            <div className="flex flex-col items-center">
                              <span className="text-amber-700">👕 Jugador</span>
                              <span className="text-[10px] text-gray-500">{getTeamName(team)}</span>
                            </div>
                          </th>
                        ))}
                        <th className="text-center px-3 py-2 font-semibold text-blue-700 border-b border-gray-200">
                          <div className="flex flex-col items-center">
                            <span>🏟 Estadio</span>
                            <span className="text-[10px] text-gray-500">vallas/banners</span>
                          </div>
                        </th>
                        <th className="text-center px-3 py-2 font-semibold text-gray-900 border-b border-gray-200 bg-gray-100">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsors.map(sp => {
                        const row = matrix[sp] || {}
                        const total = Object.values(row).reduce((a, b) => a + b, 0)
                        return (
                          <tr key={sp} className="border-b border-gray-50 hover:bg-indigo-50/40">
                            <td className="px-3 py-2 font-mono font-bold text-gray-900 sticky left-0 bg-white z-10">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorFor(sp) }} />
                                {sp}
                              </span>
                            </td>
                            {realTeams.map(team => {
                              const n = row[`jugador_${team}`] || 0
                              return (
                                <td key={team} className={`px-3 py-2 text-center ${n > 0 ? 'bg-amber-50 font-bold text-amber-900' : 'text-gray-300'}`}>
                                  {n || '—'}
                                </td>
                              )
                            })}
                            <td className={`px-3 py-2 text-center ${(row['estadio'] || 0) > 0 ? 'bg-blue-50 font-bold text-blue-900' : 'text-gray-300'}`}>
                              {row['estadio'] || '—'}
                            </td>
                            <td className="px-3 py-2 text-center font-bold bg-gray-50">{total}</td>
                          </tr>
                        )
                      })}
                      {sponsors.length === 0 && (
                        <tr><td colSpan={realTeams.length + 3} className="text-center text-gray-400 py-8">Sin detecciones</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>

          {/* Resumen por sponsor */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                7. Resumen por sponsor
              </h2>
              <div className="flex gap-2">
                <button onClick={downloadDetectionsCsv}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50">
                  Descargar CSV
                </button>
                <button onClick={downloadDetectionsJson}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50">
                  Descargar JSON
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {sponsorsSummary.map(([sponsor, count]: any) => {
                const bySrc = detections.sponsors_by_source?.[sponsor] || { jugador: 0, estadio: 0 }
                return (
                  <button key={sponsor} onClick={() => setFilterSponsor(sponsor)}
                    className={`rounded-xl p-3 text-left border-2 transition-all ${
                      filterSponsor === sponsor ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorFor(sponsor) }} />
                      <code className="text-xs font-bold text-gray-900 truncate">{sponsor}</code>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{count}</p>
                    <div className="flex gap-2 mt-1 text-[10px] text-gray-500">
                      <span className="flex items-center gap-0.5">👕 {bySrc.jugador}</span>
                      <span className="flex items-center gap-0.5">🏟 {bySrc.estadio}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tabla detallada de detecciones */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">8. Detecciones frame a frame</h2>
              <div className="flex items-center gap-2">
                <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                  <option value="all">Todas las fuentes</option>
                  <option value="jugador">Solo jugadores en cancha</option>
                  <option value="estadio">Solo estadio/valla</option>
                  <option value="tribuna_staff">Solo tribuna/staff</option>
                </select>
                <input type="text" value={filterSponsor} onChange={e => setFilterSponsor(e.target.value)}
                  placeholder="Filtrar por sponsor..."
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
                {(filterSponsor || filterSource !== 'all' || filterEntity !== 'all') && (
                  <button onClick={() => { setFilterSponsor(''); setFilterSource('all'); setFilterEntity('all') }}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">Limpiar todos</button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Frame</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Tiempo</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Sponsor</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Fuente</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Equipo</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Conf.</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Tamano</th>
                    <th className="px-2 py-2 font-semibold text-gray-500 uppercase">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDets.slice(0, 300).map((d: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-indigo-50/40">
                      <td className="px-2 py-1.5 font-mono text-gray-700">{d.frame}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-700">{d.timestamp_str || fmtTime(d.timestamp)}</td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorFor(d.sponsor) }} />
                          <code className="font-semibold text-gray-900">{d.sponsor}</code>
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {d.source === 'jugador' ? (
                          <span title="Jugador en cancha (césped verificado)" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">
                            👕 {d.player_overlap ? Math.round(d.player_overlap * 100) + '%' : ''}
                          </span>
                        ) : d.source === 'tribuna_staff' ? (
                          <span title={`Persona NO en cancha (césped ${Math.round((d.pitch_ratio || 0) * 100)}%)`} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-bold">
                            👥 Staff
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                            🏟
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {d.entity_id ? (
                          <code className={`text-[10px] font-bold ${
                            d.entity_id === 'liga_1' ? 'text-blue-700' : 'text-orange-700'
                          }`}>{d.entity_id}</code>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          d.confidence >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                          d.confidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{(d.confidence * 100).toFixed(0)}%</span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-500 text-[10px]">{d.width}×{d.height}</td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => viewDetection(d)}
                          className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700">
                          👁 Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredDets.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredDets.length > 300 && (
              <p className="text-xs text-gray-400 text-center mt-3">
                Mostrando primeras 300 de {filteredDets.length} detecciones. Descarga CSV/JSON para todas.
              </p>
            )}
          </div>
        </>
      )}

      {/* ═══ PANEL FLOTANTE: Frame + datos de la deteccion ═══ */}
      {viewingDet && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={closeFrameView}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Frame {viewingDet.frame}{' '}
                  <span className="text-gray-400">·</span>{' '}
                  <span className="font-mono text-indigo-600">{viewingDet.timestamp_str || fmtTime(viewingDet.timestamp)}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Deteccion: <code className="font-bold text-gray-700">{viewingDet.sponsor}</code>
                </p>
              </div>
              <button onClick={closeFrameView}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-lg">
                ✕
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Imagen del frame (ocupa 3 columnas en desktop) */}
              <div className="lg:col-span-3">
                <div className="rounded-xl overflow-hidden bg-black border border-gray-200 aspect-video flex items-center justify-center">
                  {frameLoading && !frameDataUrl ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-300">Capturando frame...</p>
                    </div>
                  ) : frameDataUrl ? (
                    <img src={frameDataUrl} alt={`Frame ${viewingDet.frame}`} className="w-full h-full object-contain" />
                  ) : (
                    <p className="text-xs text-gray-400">No se pudo capturar el frame</p>
                  )}
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button onClick={() => { seekTo(viewingDet.timestamp); closeFrameView() }}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">
                    ▶ Ir al video
                  </button>
                  {frameDataUrl && (
                    <a href={frameDataUrl} download={`frame_${viewingDet.frame}_${viewingDet.sponsor}.jpg`}
                      className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50">
                      💾 Descargar
                    </a>
                  )}
                  <button onClick={() => markAsFalsePositive(viewingDet)}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"
                    title="Borra esta deteccion del analisis. Tambien la registra para que el proximo entrenamiento aprenda que NO es ese logo.">
                    🚫 Falso positivo
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2 italic">
                  💡 Si el cuadro NO contiene realmente el logo de <strong>{viewingDet.sponsor}</strong>, marca como falso positivo
                  para que el modelo aprenda. Los falsos positivos se borran de la matriz y SMV.
                </p>
              </div>

              {/* Datos de la deteccion (2 columnas) */}
              <div className="lg:col-span-2 space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Datos de la deteccion</p>

                <DataRow label="Sponsor">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorFor(viewingDet.sponsor) }} />
                    <code className="font-bold text-gray-900">{viewingDet.sponsor}</code>
                  </span>
                </DataRow>

                <DataRow label="Confianza">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    viewingDet.confidence >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                    viewingDet.confidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{(viewingDet.confidence * 100).toFixed(1)}%</span>
                </DataRow>

                <DataRow label="Fuente">
                  {viewingDet.source === 'jugador' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-bold">
                      👕 Jugador en cancha
                      {viewingDet.player_overlap && (
                        <span className="text-amber-600 font-normal">({Math.round(viewingDet.player_overlap * 100)}%)</span>
                      )}
                    </span>
                  ) : viewingDet.source === 'tribuna_staff' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs font-bold">
                      👥 Tribuna / Staff (descartado)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                      🏟 En estadio/valla
                    </span>
                  )}
                </DataRow>

                {(viewingDet.source === 'jugador' || viewingDet.source === 'tribuna_staff') && (
                  <DataRow label="En cancha">
                    {viewingDet.on_pitch ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">
                        ✅ Sí ({Math.round((viewingDet.pitch_ratio || 0) * 100)}% césped)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold">
                        ❌ No ({Math.round((viewingDet.pitch_ratio || 0) * 100)}% césped)
                      </span>
                    )}
                  </DataRow>
                )}

                <DataRow label="Equipo atribuido">
                  {viewingDet.entity_id ? (
                    viewingDet.entity_id === 'liga_1' ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">Liga 1 (estadio)</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs font-bold">
                        🏷 {viewingDet.entity_id}
                        {viewingDet.color_distance && (
                          <span className="ml-1 text-orange-600 font-normal">
                            (dist color: {viewingDet.color_distance.toFixed(0)})
                          </span>
                        )}
                      </span>
                    )
                  ) : (
                    <span className="text-gray-400 text-xs">Sin atribuir</span>
                  )}
                </DataRow>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ubicacion</p>
                  <DataRow label="Frame nro">
                    <code className="text-xs">{viewingDet.frame}</code>
                  </DataRow>
                  <DataRow label="Tiempo">
                    <code className="text-xs font-mono text-indigo-600">{viewingDet.timestamp_str || fmtTime(viewingDet.timestamp)}</code>
                  </DataRow>
                  <DataRow label="Bbox">
                    <code className="text-[10px] text-gray-500">
                      x1={viewingDet.bbox[0]} y1={viewingDet.bbox[1]}<br/>
                      x2={viewingDet.bbox[2]} y2={viewingDet.bbox[3]}
                    </code>
                  </DataRow>
                  <DataRow label="Tamaño">
                    <code className="text-xs">{viewingDet.width} × {viewingDet.height} px</code>
                  </DataRow>
                  <DataRow label="Personas en frame">
                    <code className="text-xs">{viewingDet.persons_in_frame ?? '—'}</code>
                  </DataRow>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-xs text-gray-500 font-medium mt-0.5 flex-shrink-0">{label}:</span>
      <div className="text-right flex-1 min-w-0">{children}</div>
    </div>
  )
}
