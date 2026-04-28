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
const parseTime = (v: string): number => {
  const s = v.trim()
  if (!s) return 0
  if (s.includes(':')) {
    const parts = s.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return Number(s) || 0
}

export default function TrimVideoPage() {
  const [videos, setVideos] = useState<any[]>([])
  const [selected, setSelected] = useState<string>('')
  const [videoInfo, setVideoInfo] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [startSec, setStartSec] = useState(0)
  const [durationSec, setDurationSec] = useState(120)
  const [outputId, setOutputId] = useState('')
  const [trimming, setTrimming] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  const [r2Videos, setR2Videos] = useState<any[]>([])
  const [r2Configured, setR2Configured] = useState(false)
  const [importingR2, setImportingR2] = useState<string>('')

  const loadAll = () => {
    authFetch(`${API}/training/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    authFetch(`${API}/storage/status`).then(r => r.ok ? r.json() : null).then(s => {
      if (s?.configured && !s.error) {
        setR2Configured(true)
        authFetch(`${API}/storage/videos`).then(r => r.ok ? r.json() : []).then(setR2Videos).catch(() => {})
      }
    }).catch(() => {})
  }

  useEffect(() => { loadAll() }, [])

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
      alert(`✅ Importado: ${data.match_id}`)
      loadAll()
      selectVideo(matchId)
    } catch (e: any) { alert(e.message) }
    setImportingR2('')
  }

  const selectVideo = async (matchId: string) => {
    setSelected(matchId)
    setResult(null); setError('')
    setStartSec(0); setDurationSec(120)
    setOutputId(`${matchId}_clip`)
    setVideoInfo(null); setVideoUrl(null)

    try {
      const [info, tok] = await Promise.all([
        authFetch(`${API}/training/video/${matchId}/info`).then(r => r.json()),
        authFetch(`${API}/training/video/${matchId}/token`).then(r => r.json()),
      ])
      setVideoInfo(info)
      setVideoUrl(`${API}/training/video/${matchId}/stream?token=${tok.token}`)
    } catch { setError('No se pudo cargar el video') }
  }

  const seekTo = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec
  }

  const useCurrentAsStart = () => {
    if (videoRef.current) setStartSec(Math.floor(videoRef.current.currentTime))
  }

  const doTrim = async () => {
    setError(''); setResult(null)
    if (!selected) return setError('Selecciona un video')
    if (!outputId.trim()) return setError('Pon un match_id para el recorte')
    if (durationSec <= 0) return setError('Duracion debe ser mayor a 0')
    if (videoInfo?.duration_seg && startSec + durationSec > videoInfo.duration_seg) {
      return setError(`El recorte excede la duracion del video (${fmtTime(videoInfo.duration_seg)})`)
    }

    setTrimming(true)
    try {
      const res = await authFetch(`${API}/training/trim-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_match_id: selected,
          output_match_id: outputId.trim(),
          start_seconds: startSec,
          duration_seconds: durationSec,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al cortar')
      setResult(data)
      authFetch(`${API}/training/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    } catch (err: any) {
      setError(err.message)
    }
    setTrimming(false)
  }

  const presets = [
    { label: '30 seg', sec: 30 },
    { label: '1 min', sec: 60 },
    { label: '2 min', sec: 120 },
    { label: '5 min', sec: 300 },
    { label: '10 min', sec: 600 },
  ]

  const maxDur = videoInfo?.duration_seg || 3600
  const endSec = Math.min(startSec + durationSec, maxDur)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Cortar videos</h1>
        <p className="text-gray-500 mt-1">Recorta un video existente para pruebas rapidas del pipeline.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de videos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Videos disponibles</h2>

          {/* R2 import */}
          {r2Configured && r2Videos.length > 0 && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-2">
              <p className="text-[10px] font-bold text-purple-900 uppercase mb-2">☁ Importar de R2</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {r2Videos.map((v: any) => (
                  <button key={v.key} onClick={() => importFromR2(v.key)}
                    disabled={importingR2 === v.key}
                    className="w-full text-left p-1.5 bg-white rounded text-[10px] hover:bg-purple-100 disabled:opacity-50">
                    <p className="font-medium text-gray-900 truncate">{v.key.split('/').pop()}</p>
                    <p className="text-gray-500">{v.size_mb} MB</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {videos.length === 0 && !r2Configured && (
            <p className="text-xs text-gray-400 text-center py-8">
              No hay videos. Sube uno en{' '}
              <a href="/admin/pipeline" className="text-indigo-600 underline">/admin/pipeline</a>
            </p>
          )}
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {videos.map((v: any) => (
              <button key={v.filename} onClick={() => selectVideo(v.match_id)}
                className={`w-full text-left rounded-xl p-3 transition-all border-2 ${
                  selected === v.match_id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}>
                <p className="text-sm font-medium text-gray-900 truncate">{v.match_id}</p>
                <p className="text-xs text-gray-400 mt-0.5">{v.size_mb} MB</p>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 space-y-6">
          {!selected && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="w-14 h-14 mx-auto bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5 21 14.25v-9L15.75 9M3.75 18h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-7.5A2.25 2.25 0 0 0 1.5 8.25v7.5A2.25 2.25 0 0 0 3.75 18Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Selecciona un video de la lista para empezar a recortar</p>
            </div>
          )}

          {selected && (
            <>
              {/* Video preview */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{selected}</h3>
                    {videoInfo && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {videoInfo.width}x{videoInfo.height} • {fmtTime(videoInfo.duration_seg)} • {videoInfo.size_mb} MB
                      </p>
                    )}
                  </div>
                </div>

                {videoUrl ? (
                  <div className="rounded-xl overflow-hidden bg-black">
                    <video ref={videoRef} src={videoUrl} controls preload="metadata" className="w-full max-h-[400px]" />
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-100 aspect-video flex items-center justify-center">
                    <span className="text-xs text-gray-400">Cargando video...</span>
                  </div>
                )}
              </div>

              {/* Controles de recorte */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Configurar recorte</h3>

                {/* Presets */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Duraciones rapidas</label>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {presets.map(p => (
                      <button key={p.label} onClick={() => setDurationSec(p.sec)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          durationSec === p.sec
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Inicio / Duracion */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-500">Inicio (mm:ss o segundos)</label>
                      <button onClick={useCurrentAsStart}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
                        Usar tiempo actual
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={fmtTime(startSec)}
                        onChange={e => setStartSec(parseTime(e.target.value))}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={() => seekTo(startSec)}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-200">
                        Ver
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Duracion (segundos)</label>
                    <input type="number" value={durationSec}
                      onChange={e => setDurationSec(Math.max(1, parseInt(e.target.value) || 0))}
                      min={1} max={3600}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                {/* Timeline visual */}
                {videoInfo?.duration_seg && (
                  <div className="mb-5">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Timeline</label>
                    <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="absolute top-0 h-full bg-indigo-500"
                        style={{
                          left: `${(startSec / maxDur) * 100}%`,
                          width: `${((endSec - startSec) / maxDur) * 100}%`,
                        }} />
                      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                        <span className="text-[10px] font-mono text-gray-500">00:00</span>
                        <span className="text-[10px] font-mono text-gray-500">{fmtTime(maxDur)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] font-mono text-gray-500">
                      <span>Inicio: <span className="text-indigo-600 font-semibold">{fmtTime(startSec)}</span></span>
                      <span>Fin: <span className="text-indigo-600 font-semibold">{fmtTime(endSec)}</span></span>
                      <span>Duracion: <span className="text-indigo-600 font-semibold">{fmtTime(durationSec)}</span></span>
                    </div>
                  </div>
                )}

                {/* Output ID */}
                <div className="mb-5">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">match_id del nuevo video</label>
                  <input type="text" value={outputId} onChange={e => setOutputId(e.target.value)}
                    placeholder="ej: alianza_vs_u_clip_2min"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  <p className="text-[11px] text-gray-400 mt-1">Se guardara como <code className="bg-gray-100 px-1 rounded">{outputId || '...'}.mp4</code></p>
                </div>

                <button onClick={doTrim} disabled={trimming || !outputId.trim()}
                  className="w-full px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {trimming ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Cortando...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 0-5.196 3 3 3 0 0 0 5.196-3zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m0 0a3 3 0 1 1 5.33-2.676 3 3 0 0 1-5.33 2.676zm0 5.354a3 3 0 1 0 5.33 2.676 3 3 0 0 0-5.33-2.676zm0 0l2.077-1.199" />
                      </svg>
                      Cortar video ({fmtTime(durationSec)})
                    </>
                  )}
                </button>

                {error && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                {result && (
                  <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800 mb-1">Video cortado exitosamente</p>
                        <p className="text-xs text-emerald-700">
                          <code className="bg-white/60 px-1 rounded">{result.match_id}.mp4</code>
                          {' — '}{result.size_mb} MB {' — '}{fmtTime(result.duration_seg)}
                        </p>
                        <div className="flex gap-2 mt-3">
                          <a href="/admin/pipeline" className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                            Ir al Pipeline
                          </a>
                          <button onClick={() => { setResult(null); setError('') }}
                            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50">
                            Cortar otro
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
