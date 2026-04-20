'use client'
import { useEffect, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'

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
  const [filterSource, setFilterSource] = useState<'all' | 'jugador' | 'estadio'>('all')
  const [jumpToTime, setJumpToTime] = useState<number | null>(null)
  const pollRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    authFetch(`${API}/training/videos`).then(r => r.json()).then(setVideos).catch(() => {})
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
      ['frame', 'timestamp_seg', 'timestamp', 'sponsor', 'source', 'player_overlap', 'confidence', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'persons_in_frame'],
      ...detections.detections.map((d: any) => [
        d.frame, d.timestamp, d.timestamp_str, d.sponsor,
        d.source || 'estadio', d.player_overlap || 0, d.confidence,
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

  const filteredDets = detections?.detections?.filter((d: any) => {
    if (filterSponsor && !d.sponsor.toLowerCase().includes(filterSponsor.toLowerCase())) return false
    if (filterSource !== 'all' && d.source !== filterSource) return false
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

        <button onClick={startAnalysis} disabled={!selected || isRunning}
          className="w-full md:w-auto px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {isRunning ? 'Analizando...' : 'Iniciar analisis'}
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
              <video ref={videoRef} src={videoUrl!} controls preload="metadata" className="w-full max-h-[500px]" />
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

          {/* Resumen por sponsor */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                5. Resumen por sponsor
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
              <h2 className="text-sm font-semibold text-gray-900">6. Detecciones frame a frame</h2>
              <div className="flex items-center gap-2">
                <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                  <option value="all">Todas las fuentes</option>
                  <option value="jugador">Solo camiseta (jugador)</option>
                  <option value="estadio">Solo estadio/valla</option>
                </select>
                <input type="text" value={filterSponsor} onChange={e => setFilterSponsor(e.target.value)}
                  placeholder="Filtrar por sponsor..."
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
                {(filterSponsor || filterSource !== 'all') && (
                  <button onClick={() => { setFilterSponsor(''); setFilterSource('all') }}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">Limpiar</button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Frame</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Tiempo</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Sponsor</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Fuente</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Confianza</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Tamano (px)</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Bbox</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 uppercase">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDets.slice(0, 300).map((d: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-indigo-50/40">
                      <td className="px-3 py-1.5 font-mono text-gray-700">{d.frame}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-700">{d.timestamp_str || fmtTime(d.timestamp)}</td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorFor(d.sponsor) }} />
                          <code className="font-semibold text-gray-900">{d.sponsor}</code>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {d.source === 'jugador' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">
                            👕 Camiseta
                            {d.player_overlap && (
                              <span className="text-amber-600">({Math.round(d.player_overlap * 100)}%)</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                            🏟 Estadio
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          d.confidence >= 0.7 ? 'bg-emerald-100 text-emerald-700' :
                          d.confidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{(d.confidence * 100).toFixed(1)}%</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">{d.width}×{d.height}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-gray-400">
                        {d.bbox.join(', ')}
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => seekTo(d.timestamp)}
                          className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium hover:bg-indigo-200">
                          Ver
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
    </div>
  )
}
