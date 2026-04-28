'use client'
import { useEffect, useState, useRef } from 'react'
import { getToken } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

// Fetch con JWT token incluido
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export default function PipelinePage() {
  const [activeStep, setActiveStep] = useState<'video' | 'frames' | 'prepare' | 'dataset' | 'train' | 'run'>('video')
  const [preparingZip, setPreparingZip] = useState(false)
  const [prepareResult, setPrepareResult] = useState<any>(null)
  const [preparedBlob, setPreparedBlob] = useState<Blob | null>(null)
  const [modelInfo, setModelInfo] = useState<any>(null)
  const [videos, setVideos] = useState<any[]>([])
  const [trainingStatus, setTrainingStatus] = useState<any>(null)
  const [pipelineStatus, setPipelineStatus] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [trainConfig, setTrainConfig] = useState({ epochs: 50, imgsz: 640, batch: 16 })
  const [selectedMatch, setSelectedMatch] = useState('')
  const [matches, setMatches] = useState<any[]>([])
  const [ytUrl, setYtUrl] = useState('')
  const [ytMatchId, setYtMatchId] = useState('')
  const [ytStatus, setYtStatus] = useState<any>(null)
  const [extractStatus, setExtractStatus] = useState<any>(null)
  const [zipStatus, setZipStatus] = useState<any>(null)
  const [existingFrames, setExistingFrames] = useState<any>(null)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [labelGuide, setLabelGuide] = useState<any>(null)
  const [showGuide, setShowGuide] = useState(false)
  const pollRef = useRef<any>(null)
  const visibilityHandlerRef = useRef<any>(null)

  useEffect(() => {
    loadModelInfo()
    loadVideos()
    loadMatches()
    loadR2Videos()
    // Detecta entrenamiento o pipeline ya corriendo y re-conecta polling
    authFetch(`${API}/training/train/status`).then(r => r.json()).then(s => {
      if (s?.running) {
        setTrainingStatus({ ...s, _startedAt: Date.now() - (s._elapsedMs || 0) })
        setActiveStep('train')
        startPoll(`${API}/training/train/status`, (ss) => {
          setTrainingStatus((prev: any) => ({ ...prev, ...ss }))
          if (!ss.running && !ss.error) loadModelInfo()
        })
      }
    }).catch(() => {})
    authFetch(`${API}/training/pipeline/status`).then(r => r.json()).then(s => {
      if (s?.running) {
        setPipelineStatus(s)
        setActiveStep('run')
        startPoll(`${API}/training/pipeline/status`, (ss) => {
          setPipelineStatus((prev: any) => ({ ...prev, ...ss }))
        })
      }
    }).catch(() => {})
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
        visibilityHandlerRef.current = null
      }
    }
  }, [])

  const loadModelInfo = () => authFetch(`${API}/training/model/info`).then(r => r.json()).then(setModelInfo).catch(() => {})
  const [r2Videos, setR2Videos] = useState<any[]>([])
  const [r2Configured, setR2Configured] = useState(false)
  const [importingR2, setImportingR2] = useState<string>('')
  const loadR2Videos = () => {
    authFetch(`${API}/storage/status`).then(r => r.ok ? r.json() : null).then(s => {
      if (s?.configured && !s.error) {
        setR2Configured(true)
        authFetch(`${API}/storage/videos`).then(r => r.ok ? r.json() : []).then(setR2Videos).catch(() => {})
      } else {
        setR2Configured(false)
      }
    }).catch(() => setR2Configured(false))
  }
  const importFromR2 = async (remoteKey: string) => {
    const filename = remoteKey.split('/').pop() || remoteKey
    const defaultId = filename.replace(/\.mp4$/i, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const matchId = prompt(`match_id para guardar localmente:`, defaultId)
    if (!matchId) return
    setImportingR2(remoteKey)
    try {
      const res = await authFetch(`${API}/storage/import-video`, {
        method: 'POST',
        body: JSON.stringify({ remote_key: remoteKey, match_id: matchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      // Polling del task para mostrar progreso
      const taskId = data.task_id
      const poll = setInterval(async () => {
        try {
          const tr = await authFetch(`${API}/storage/tasks/${taskId}`).then(r => r.json())
          if (!tr.running) {
            clearInterval(poll)
            setImportingR2('')
            if (tr.error) alert(`❌ ${tr.error}`)
            else loadVideos()
          }
        } catch {}
      }, 1500)
    } catch (e: any) { alert(e.message); setImportingR2('') }
  }
  const loadVideos = () => authFetch(`${API}/training/videos`).then(r => r.json()).then(list => {
    setVideos(list)
    // Cargar frames existentes de cada video
    if (Array.isArray(list)) {
      list.forEach((v: any) => {
        authFetch(`${API}/training/frames/${v.match_id}?page=1&per_page=1`)
          .then(r => r.json())
          .then(data => {
            if (data.total > 0) {
              setExistingFrames((prev: any) => ({ ...prev, [v.match_id]: data.total }))
            }
          })
          .catch(() => {})
      })
    }
  }).catch(() => {})
  const loadMatches = () => authFetch(`${API}/matches/`).then(r => r.json()).then(setMatches).catch(() => {})
  const loadLabelGuide = () => authFetch(`${API}/settings/labeling-guide`).then(r => r.json()).then(setLabelGuide).catch(() => {})

  const startPoll = (url: string, setter: (s: any) => void, onDone?: () => void) => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
    }

    const doPoll = async () => {
      try {
        const s = await authFetch(url).then(r => r.json())
        setter(s)
        if (!s.running) {
          clearInterval(pollRef.current)
          pollRef.current = null
          if (visibilityHandlerRef.current) {
            document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
            visibilityHandlerRef.current = null
          }
          onDone?.()
        }
      } catch {}
    }

    doPoll() // Poll inmediato
    pollRef.current = setInterval(doPoll, 2000)

    // Re-poll al volver a la pestaña (sin fugas de listeners)
    const onVisible = () => { if (!document.hidden && pollRef.current) doPoll() }
    visibilityHandlerRef.current = onVisible
    document.addEventListener('visibilitychange', onVisible)
  }

  // ==================== YOUTUBE ====================
  const downloadYoutube = async () => {
    if (!ytUrl || !ytMatchId) return alert('Pon el link de YouTube y un match_id')
    try {
      const res = await authFetch(`${API}/training/download-youtube`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ytUrl, match_id: ytMatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setYtStatus({ running: true, progress: 'Conectando con YouTube...', match_id: ytMatchId })
      startPoll(`${API}/training/download-youtube/status`, (s) => {
        setYtStatus((prev: any) => ({ ...prev, ...s }))
        if (!s.running && !s.error) loadVideos()
      })
    } catch (err: any) { setYtStatus({ running: false, error: err.message, match_id: ytMatchId }) }
  }

  // ==================== UPLOAD VIDEO ====================
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    if (selectedMatch) form.append('match_id', selectedMatch)
    try {
      const res = await authFetch(`${API}/training/upload-video`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).detail)
      loadVideos()
    } catch (err: any) { alert(err.message) }
    setUploading(false)
  }

  // ==================== EXTRACT FRAMES ====================
  const extractFrames = async (matchId: string) => {
    setExtractStatus({ running: true, progress: 'Iniciando extraccion...', percent: 0, match_id: matchId })
    try {
      const res = await authFetch(`${API}/training/extract-frames?match_id=${matchId}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail)
      setActiveStep('frames')
      startPoll(`${API}/training/extract-frames/status`, (s) => {
        setExtractStatus((prev: any) => ({ ...prev, ...s, match_id: matchId }))
      })
    } catch (err: any) { setExtractStatus({ running: false, error: err.message, match_id: matchId }) }
  }

  // ==================== PREPARE ZIP ====================
  const prepareZip = async (matchId: string, sample: number) => {
    if (!matchId) return
    setZipStatus({ running: true, progress: `Preparando ZIP (${sample > 0 ? sample + ' frames' : 'todos'})...`, percent: 0, match_id: matchId })
    try {
      const res = await authFetch(`${API}/training/frames/${matchId}/prepare-zip?sample=${sample}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail)
      startPoll(`${API}/training/frames/${matchId}/prepare-zip/status`, (s) => {
        // Mantener match_id y nunca setear null
        setZipStatus((prev: any) => ({ ...prev, ...s, match_id: matchId }))
      })
    } catch (err: any) { setZipStatus({ running: false, error: err.message, match_id: matchId }) }
  }

  // ==================== PREPARE ZIP (fix Label Studio export) ====================
  const handlePrepareZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreparingZip(true); setPrepareResult(null); setPreparedBlob(null)

    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(file)

      let classesContent: string | null = null
      let classesPath = ''
      let yamlExists = false
      let imagesCount = 0
      let labelsCount = 0

      for (const path in zip.files) {
        const f = zip.files[path]
        if (f.dir) continue
        const lower = path.toLowerCase()
        if (lower.endsWith('classes.txt')) {
          classesContent = await f.async('text')
          classesPath = path
        }
        if (lower.endsWith('.yaml') || lower.endsWith('.yml')) yamlExists = true
        if (lower.match(/\.(jpg|jpeg|png)$/)) imagesCount++
        if (lower.endsWith('.txt') && !lower.endsWith('classes.txt') && !lower.endsWith('notes.json')) labelsCount++
      }

      if (yamlExists) {
        const blob = await zip.generateAsync({ type: 'blob' })
        setPreparedBlob(blob)
        setPrepareResult({
          alreadyReady: true,
          images: imagesCount,
          labels: labelsCount,
          filename: file.name,
        })
        setPreparingZip(false)
        return
      }

      if (!classesContent) {
        setPrepareResult({
          error: 'No se encontro classes.txt en el ZIP. Exporta como "YOLO with Images" (sin OBB) en Label Studio.',
        })
        setPreparingZip(false)
        return
      }

      // Limpia comas finales, espacios y lowercase (sponsor_id siempre es snake_case en la BD)
      const rawClasses = classesContent.split('\n').map(l => l.trim()).filter(Boolean)
      const classes = rawClasses.map(c =>
        c.replace(/,+$/, '')   // coma(s) al final
         .replace(/\s+/g, '_')  // espacios -> underscore
         .toLowerCase()
         .trim()
      )
      const cleanedCount = classes.filter((c, i) => c !== rawClasses[i]).length

      // Reescribe classes.txt con los nombres limpios
      zip.file(classesPath, classes.join('\n') + '\n')

      const yamlLines = [
        'path: .',
        'train: images',
        'val: images',
        `nc: ${classes.length}`,
        'names:',
        ...classes.map((c, i) => `  ${i}: ${c}`),
      ]
      const yamlContent = yamlLines.join('\n') + '\n'

      const rootDir = classesPath.includes('/') ? classesPath.substring(0, classesPath.lastIndexOf('/') + 1) : ''
      zip.file(`${rootDir}data.yaml`, yamlContent)

      const blob = await zip.generateAsync({ type: 'blob' })
      const filename = file.name.replace(/\.zip$/i, '') + '_con_yaml.zip'

      setPreparedBlob(blob)
      setPrepareResult({
        success: true,
        classes,
        rawClasses,
        cleanedCount,
        images: imagesCount,
        labels: labelsCount,
        yamlPreview: yamlContent,
        filename,
      })
    } catch (err: any) {
      setPrepareResult({ error: err.message || 'Error al procesar el ZIP' })
    }
    setPreparingZip(false)
  }

  const downloadPreparedZip = () => {
    if (!preparedBlob || !prepareResult?.filename) return
    const url = URL.createObjectURL(preparedBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = prepareResult.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadPreparedZip = async () => {
    if (!preparedBlob || !prepareResult?.filename) return
    setUploading(true); setUploadResult(null)
    const form = new FormData()
    form.append('file', preparedBlob, prepareResult.filename)
    try {
      const res = await authFetch(`${API}/training/upload-dataset`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setUploadResult(data)
      setActiveStep('dataset')
    } catch (err: any) { setUploadResult({ error: err.message }) }
    setUploading(false)
  }

  // ==================== UPLOAD DATASET ====================
  const handleDatasetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await authFetch(`${API}/training/upload-dataset`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setUploadResult(data)
    } catch (err: any) { setUploadResult({ error: err.message }) }
    setUploading(false)
  }

  // ==================== TRAIN ====================
  const startTraining = async () => {
    setTrainingStatus({ running: true, progress: 'Iniciando entrenamiento...' })
    try {
      const res = await authFetch(`${API}/training/train?epochs=${trainConfig.epochs}&imgsz=${trainConfig.imgsz}&batch=${trainConfig.batch}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail)
      startPoll(`${API}/training/train/status`, (s) => {
        setTrainingStatus((prev: any) => ({ ...prev, ...s }))
        if (!s.running && !s.error) loadModelInfo()
      })
    } catch (err: any) { setTrainingStatus({ running: false, error: err.message }) }
  }

  // ==================== RUN PIPELINE ====================
  const runPipeline = async (matchId: string) => {
    setPipelineStatus({ running: true, progress: 'Iniciando pipeline...', match_id: matchId })
    try {
      const res = await authFetch(`${API}/training/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      setActiveStep('run')
      startPoll(`${API}/training/pipeline/status`, (s) => {
        setPipelineStatus((prev: any) => ({ ...prev, ...s, match_id: matchId }))
      })
    } catch (err: any) { setPipelineStatus({ running: false, error: err.message, match_id: matchId }) }
  }

  const steps = [
    { key: 'video' as const, num: '1', title: 'Obtener Video', desc: 'YouTube o MP4' },
    { key: 'frames' as const, num: '2', title: 'Frames', desc: 'Extraer y descargar' },
    { key: 'prepare' as const, num: '3', title: 'Preparar ZIP', desc: 'Generar data.yaml' },
    { key: 'dataset' as const, num: '4', title: 'Dataset', desc: 'Subir al servidor' },
    { key: 'train' as const, num: '5', title: 'Entrenar', desc: 'Generar best.pt' },
    { key: 'run' as const, num: '6', title: 'Ejecutar', desc: 'Analizar partido' },
  ]

  return (

    <div>
      <style jsx global>{`
        @keyframes indeterminate {
          0% { left: -35%; width: 35%; }
          50% { left: 35%; width: 45%; }
          100% { left: 100%; width: 35%; }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline de Analisis</h1>
        <p className="text-gray-500 mt-1">Sube video, extrae frames, etiqueta, entrena y analiza</p>
      </div>

      {/* Model status */}
      <div className={`rounded-2xl p-4 mb-6 flex items-center justify-between ${
        modelInfo?.exists ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${modelInfo?.exists ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <p className={`text-sm font-medium ${modelInfo?.exists ? 'text-emerald-800' : 'text-amber-800'}`}>
            {modelInfo?.exists ? `Modelo listo (${modelInfo.size_mb} MB)` : 'Sin modelo — completa los pasos'}
          </p>
        </div>
      </div>

      {/* Steps nav */}
      <div className="flex gap-1.5 mb-6">
        {steps.map(s => (
          <button key={s.key} onClick={() => setActiveStep(s.key)}
            className={`flex-1 rounded-xl p-3 text-left transition-all border-2 ${
              activeStep === s.key ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white hover:border-gray-200'
            }`}>
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                activeStep === s.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}>{s.num}</span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${activeStep === s.key ? 'text-indigo-900' : 'text-gray-700'}`}>{s.title}</p>
                <p className="text-[10px] text-gray-400 truncate">{s.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ==================== PASO 1: VIDEO ==================== */}
      {activeStep === 'video' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">1. Obtener video del partido</h2>
          <p className="text-sm text-gray-500 mb-6">Pega un link de YouTube o sube un MP4.</p>

          {/* YouTube */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              Descargar de YouTube
            </h3>
            <div className="space-y-3">
              <input type="text" value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" value={ytMatchId} onChange={e => setYtMatchId(e.target.value)}
                placeholder="match_id ej: alianza_vs_u_apertura_2025_f7"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={downloadYoutube} disabled={ytStatus?.running || !ytUrl || !ytMatchId}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {ytStatus?.running ? 'Descargando...' : 'Descargar video'}
              </button>
            </div>
            {ytStatus && <ProgressCard status={ytStatus} />}
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">o</span><div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Importar desde Cloudflare R2 */}
          {r2Configured && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-lg">☁</span> Importar desde Cloudflare R2
              </h3>
              {r2Videos.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No hay videos en R2. Sube primero a tu bucket o usa{' '}
                  <a href="/admin/storage" className="text-indigo-600 underline">/admin/storage</a>
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {r2Videos.map((v: any) => (
                    <div key={v.key} className="flex items-center justify-between bg-white rounded-lg p-2 border border-purple-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 truncate">🎬 {v.key}</p>
                        <p className="text-[10px] text-gray-500">{v.size_mb} MB</p>
                      </div>
                      <button onClick={() => importFromR2(v.key)} disabled={importingR2 === v.key}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 ml-2 flex-shrink-0">
                        {importingR2 === v.key ? '⏳ Importando...' : '⬇ Importar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">o sube archivo desde tu PC</span><div className="flex-1 h-px bg-gray-200" />
          </div>

          <label className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            uploading ? 'border-gray-200 bg-gray-50' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
          }`}>
            <input type="file" accept=".mp4" onChange={handleVideoUpload} className="hidden" disabled={uploading} />
            <p className="text-sm font-medium text-gray-700">{uploading ? 'Subiendo...' : 'Click para seleccionar MP4'}</p>
          </label>

          {videos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Videos listos</h3>
              {videos.map((v: any) => (
                <div key={v.filename} className="bg-gray-50 rounded-xl p-4 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{v.match_id}</p>
                      <p className="text-xs text-gray-400">
                        {v.size_mb} MB
                        {existingFrames?.[v.match_id] && (
                          <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                            {existingFrames[v.match_id].toLocaleString()} frames
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => {
                          if (previewVideo === v.match_id) {
                            setPreviewVideo(null)
                            setVideoUrl(null)
                          } else {
                            try {
                              const res = await authFetch(`${API}/training/video/${v.match_id}/token`)
                              const data = await res.json()
                              setVideoUrl(`${API}/training/video/${v.match_id}/stream?token=${data.token}`)
                              setPreviewVideo(v.match_id)
                            } catch { alert('Error al cargar video') }
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          previewVideo === v.match_id
                            ? 'bg-slate-800 text-white'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}>
                        {previewVideo === v.match_id ? 'Ocultar' : 'Ver video'}
                      </button>
                      <button onClick={() => extractFrames(v.match_id)} disabled={extractStatus?.running}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {extractStatus?.running ? 'Extrayendo...' : 'Extraer frames'}
                      </button>
                    </div>
                  </div>

                  {/* Video player */}
                  {previewVideo === v.match_id && videoUrl && (
                    <div className="mt-4 rounded-xl overflow-hidden bg-black">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full max-h-[400px]"
                        preload="metadata"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== PASO 2: FRAMES ==================== */}
      {activeStep === 'frames' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">2. Frames del video</h2>
          <p className="text-sm text-gray-500 mb-6">Descarga los frames, etiquetalos en Label Studio.</p>

          {/* Extract progress */}
          {extractStatus && (
            <div className="mb-6">
              <ProgressCard status={extractStatus} showBar />
            </div>
          )}

          {/* Download options — solo si extraccion terminó */}
          {extractStatus?.finished_at && !extractStatus?.error && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-3 gap-4">
                  <div><p className="text-xs text-gray-500">Frames totales</p><p className="text-xl font-bold text-gray-900">{extractStatus.frames?.toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Duracion</p><p className="text-xl font-bold text-gray-900">{Math.floor((extractStatus.duracion_seg || 0) / 60)} min</p></div>
                  <div><p className="text-xs text-gray-500">FPS original</p><p className="text-xl font-bold text-gray-900">{extractStatus.fps_video}</p></div>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-700 mb-3">Descargar frames para etiquetar</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                {[
                  { label: 'Sample 300', desc: 'Recomendado para etiquetar', sample: 300, rec: true },
                  { label: 'Sample 600', desc: 'Mas precision', sample: 600, rec: false },
                  { label: 'Todos', desc: `${extractStatus.frames?.toLocaleString()} frames`, sample: 0, rec: false },
                ].map(opt => (
                  <button key={opt.label} onClick={() => prepareZip(extractStatus.match_id, opt.sample)}
                    disabled={zipStatus?.running}
                    className={`rounded-xl border-2 p-4 text-left transition-all hover:shadow-md disabled:opacity-50 ${
                      opt.rec ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    {opt.rec && <span className="text-[10px] font-bold text-indigo-600 uppercase">Recomendado</span>}
                    <p className="text-sm font-semibold text-gray-900 mt-1">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* ZIP progress */}
              {zipStatus && (
                <div className="mb-6">
                  <ProgressCard status={zipStatus} showBar />
                  {zipStatus.download_url && !zipStatus.running && !zipStatus.error && (
                    <button
                      onClick={async () => {
                        try {
                          const file = zipStatus.download_url.split('file=')[1] || ''
                          const matchId = zipStatus.match_id || extractStatus?.match_id || ''
                          const res = await authFetch(`${API}/training/frames/${matchId}/download-token?file=${file}`)
                          if (!res.ok) throw new Error('Error al generar token')
                          const data = await res.json()
                          window.open(`${API}${data.url.replace('/api', '')}`, '_blank')
                        } catch (err: any) { alert(err.message) }
                      }}
                      className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Descargar ZIP
                    </button>
                  )}
                </div>
              )}

              {/* Instructions */}
              <div className="bg-slate-900 rounded-xl p-5 mb-4">
                <p className="text-sm font-semibold text-white mb-3">Que hacer con los frames:</p>
                <ol className="space-y-2 text-sm text-slate-300">
                  <li><span className="text-indigo-400 font-bold">1.</span> Descarga el ZIP de arriba</li>
                  <li><span className="text-indigo-400 font-bold">2.</span> Abre Label Studio: <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">label-studio start</code></li>
                  <li><span className="text-indigo-400 font-bold">3.</span> Crea proyecto, importa las imagenes del ZIP</li>
                  <li><span className="text-indigo-400 font-bold">4.</span> Etiqueta cada logo con el <strong className="text-amber-400">nombre exacto</strong> de la tabla de abajo</li>
                  <li><span className="text-indigo-400 font-bold">5.</span> Exporta como <strong className="text-white">YOLO with Images</strong> (.zip) — <span className="text-red-400">NO uses OBB</span></li>
                  <li><span className="text-indigo-400 font-bold">6.</span> Sube ese ZIP en el paso 3 (Preparar ZIP) para generar el data.yaml</li>
                </ol>
              </div>

              {/* Labeling guide */}
              <div className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden mb-4">
                <button onClick={() => { setShowGuide(!showGuide); if (!labelGuide) loadLabelGuide() }}
                  className="w-full px-5 py-4 flex items-center justify-between bg-amber-50 hover:bg-amber-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏷</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-amber-900">Guia de etiquetado — Nombres exactos</p>
                      <p className="text-xs text-amber-700">IMPORTANTE: Usa estos nombres tal cual al etiquetar en Label Studio</p>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-amber-600 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {showGuide && labelGuide && (
                  <div className="p-5">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <p className="text-xs text-red-800 font-medium">
                        Los nombres de etiqueta DEBEN coincidir exactamente con el &quot;Label para etiquetar&quot;.
                        Si pones &quot;Apuesta Total&quot; en vez de &quot;apuesta_total&quot;, el sistema no lo va a reconocer.
                      </p>
                    </div>

                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Label para etiquetar</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Nombre real</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Categoria</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labelGuide.sponsors.map((s: any, i: number) => (
                          <tr key={s.sponsor_id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td className="px-4 py-2.5">
                              <code className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-bold">{s.sponsor_id}</code>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-900">{s.nombre}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{s.categoria || '\u2014'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                s.tier_mvp === 1 ? 'bg-amber-100 text-amber-700' :
                                s.tier_mvp === 2 ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400'
                              }`}>{s.tier_mvp}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-4 bg-slate-800 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-2">Ejemplo en Label Studio:</p>
                      <p className="text-xs text-slate-300 font-mono">
                        Ves el logo de Apuesta Total en una camiseta → dibujas el rectangulo → seleccionas etiqueta: <span className="text-amber-400 font-bold">apuesta_total</span>
                      </p>
                      <p className="text-xs text-slate-300 font-mono mt-1">
                        Ves el logo de Nike en una valla → dibujas el rectangulo → seleccionas etiqueta: <span className="text-amber-400 font-bold">nike</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => setActiveStep('prepare')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                Ya etiquete, ir al paso 3
              </button>
            </>
          )}

          {/* Mostrar frames existentes si no hay extraccion reciente */}
          {!extractStatus && (
            <div>
              {existingFrames && Object.keys(existingFrames).length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                    <p className="text-sm font-medium text-emerald-800 mb-3">Frames ya extraidos</p>
                    <div className="space-y-2">
                      {Object.entries(existingFrames).map(([matchId, count]: [string, any]) => (
                        <div key={matchId} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-emerald-100">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{matchId}</p>
                            <p className="text-xs text-gray-400">{count.toLocaleString()} frames disponibles</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => {
                              setExtractStatus({ finished_at: true, frames: count, duracion_seg: 0, fps_video: 0, match_id: matchId })
                              setSelectedMatch(matchId)
                            }}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                              Usar estos frames
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 text-center">O ve al paso 1 para extraer frames de otro video</p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
                  <p className="text-sm text-amber-800">Primero sube un video y dale &quot;Extraer frames&quot; en el paso 1.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== PASO 3: PREPARE ZIP ==================== */}
      {activeStep === 'prepare' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">3. Preparar ZIP (generar data.yaml)</h2>
          <p className="text-sm text-gray-500 mb-6">
            Label Studio exporta el ZIP sin <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">data.yaml</code>.
            Sube el ZIP aqui y el sistema lo genera automaticamente a partir de <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">classes.txt</code>.
          </p>

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">Como exportar desde Label Studio</p>
                <p className="text-xs text-blue-800">
                  Usa <strong>&quot;YOLO with Images&quot;</strong> (NO &quot;YOLOv8 OBB&quot;). El export viene con <code className="bg-white/60 px-1 rounded">images/</code>,
                  {' '}<code className="bg-white/60 px-1 rounded">labels/</code>, <code className="bg-white/60 px-1 rounded">classes.txt</code>, <code className="bg-white/60 px-1 rounded">notes.json</code> — pero sin el <code className="bg-white/60 px-1 rounded">data.yaml</code> que YOLO necesita.
                </p>
              </div>
            </div>
          </div>

          <label className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            preparingZip ? 'border-gray-200 bg-gray-50' : 'border-amber-200 hover:border-amber-400 hover:bg-amber-50'
          }`}>
            <input type="file" accept=".zip" onChange={handlePrepareZip} className="hidden" disabled={preparingZip} />
            <p className="text-3xl mb-2">{preparingZip ? '\u23F3' : '\u{1F527}'}</p>
            <p className="text-sm font-medium text-gray-700">
              {preparingZip ? 'Procesando ZIP...' : 'Click para subir ZIP de Label Studio'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Genera el data.yaml automaticamente</p>
          </label>

          {/* Result: already has yaml */}
          {prepareResult?.alreadyReady && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <p className="text-sm font-semibold text-emerald-800">El ZIP ya tiene data.yaml</p>
              </div>
              <p className="text-xs text-emerald-700 mb-3">
                {prepareResult.images} imagenes, {prepareResult.labels} labels. Puedes subirlo directo al servidor.
              </p>
              <button onClick={uploadPreparedZip} disabled={uploading}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {uploading ? 'Subiendo...' : 'Subir al servidor y continuar'}
              </button>
            </div>
          )}

          {/* Result: success with generated yaml */}
          {prepareResult?.success && (
            <div className="mt-4 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <p className="text-sm font-semibold text-emerald-800">ZIP preparado</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><p className="text-xs text-gray-500">Imagenes</p><p className="text-lg font-bold text-gray-900">{prepareResult.images}</p></div>
                  <div><p className="text-xs text-gray-500">Labels</p><p className="text-lg font-bold text-gray-900">{prepareResult.labels}</p></div>
                  <div><p className="text-xs text-gray-500">Clases</p><p className="text-lg font-bold text-gray-900">{prepareResult.classes.length}</p></div>
                </div>
              </div>

              {/* Classes found */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900">Clases detectadas ({prepareResult.classes.length})</p>
                  {prepareResult.cleanedCount > 0 && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                      {prepareResult.cleanedCount} limpiada{prepareResult.cleanedCount !== 1 ? 's' : ''} (quitamos comas/espacios)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prepareResult.classes.map((c: string, i: number) => {
                    const wasCleaned = prepareResult.rawClasses?.[i] !== c
                    return (
                      <span key={i}
                        title={wasCleaned ? `Original: "${prepareResult.rawClasses[i]}"` : undefined}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                          wasCleaned ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                        <span className={`mr-1 ${wasCleaned ? 'text-amber-400' : 'text-indigo-400'}`}>{i}:</span>{c}
                      </span>
                    )
                  })}
                </div>
                {prepareResult.cleanedCount > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Las etiquetas en amarillo tenian comas/espacios/mayusculas que se limpiaron para que coincidan con los sponsor_id de la BD.
                  </p>
                )}
              </div>

              {/* YAML preview */}
              <div className="bg-slate-900 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-300 mb-2">data.yaml generado</p>
                <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap overflow-x-auto">{prepareResult.yamlPreview}</pre>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <button onClick={uploadPreparedZip} disabled={uploading}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {uploading ? 'Subiendo...' : 'Subir al servidor y continuar'}
                </button>
                <button onClick={downloadPreparedZip}
                  className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Descargar ZIP arreglado
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {prepareResult?.error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{prepareResult.error}</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== PASO 4: DATASET ==================== */}
      {activeStep === 'dataset' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">4. Subir dataset al servidor</h2>
          <p className="text-sm text-gray-500 mb-6">
            Si ya usaste el paso 3 (&quot;Subir al servidor y continuar&quot;) el dataset ya esta subido.
            Si no, sube aqui el ZIP (ya con data.yaml).
          </p>

          <label className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            uploading ? 'border-gray-200 bg-gray-50' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
          }`}>
            <input type="file" accept=".zip" onChange={handleDatasetUpload} className="hidden" disabled={uploading} />
            <p className="text-3xl mb-2">{uploading ? '\u23F3' : '\u{1F4E6}'}</p>
            <p className="text-sm font-medium text-gray-700">{uploading ? 'Subiendo...' : 'Click para seleccionar ZIP'}</p>
            <p className="text-xs text-gray-400 mt-1">ZIP con data.yaml (generado en el paso 3)</p>
          </label>

          {uploadResult && !uploadResult.error && (
            <div className="mt-4 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-medium text-emerald-800 mb-3">Dataset subido</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><p className="text-xs text-gray-500">Imagenes</p><p className="text-lg font-bold">{uploadResult.images}</p></div>
                  <div><p className="text-xs text-gray-500">Labels</p><p className="text-lg font-bold">{uploadResult.labels}</p></div>
                  <div><p className="text-xs text-gray-500">YAML</p><p className="text-lg font-bold">{uploadResult.yaml_files?.length || 0}</p></div>
                </div>
              </div>

              {/* Etiquetas detectadas */}
              {uploadResult.dataset_labels?.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Etiquetas detectadas en el dataset</p>

                  {/* Las que ya existen */}
                  {uploadResult.labels_in_db?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-2">Ya existen en la BD:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {uploadResult.labels_in_db.map((l: string) => (
                          <span key={l} className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Las nuevas */}
                  {uploadResult.labels_new?.length > 0 && (
                    <div>
                      <p className="text-xs text-amber-700 font-medium mb-2">Nuevas (no existen en la BD):</p>
                      <div className="space-y-2">
                        {uploadResult.labels_new.map((l: string) => (
                          <NewLabelRow key={l} label={l} />
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadResult.labels_new?.length === 0 && (
                    <p className="text-xs text-emerald-600 mt-2">Todas las etiquetas coinciden con la BD. Listo para entrenar.</p>
                  )}
                </div>
              )}

              <button onClick={() => setActiveStep('train')} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                Siguiente: Entrenar
              </button>
            </div>
          )}
          {uploadResult?.error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-sm text-red-700">{uploadResult.error}</p></div>
          )}
        </div>
      )}

      {/* ==================== PASO 5: TRAIN ==================== */}
      {activeStep === 'train' && <TrainStep
        trainConfig={trainConfig} setTrainConfig={setTrainConfig}
        trainingStatus={trainingStatus} startTraining={startTraining}
        setActiveStep={setActiveStep}
      />}

      {/* ==================== PASO 6: RUN ==================== */}
      {activeStep === 'run' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">6. Ejecutar pipeline</h2>
          <p className="text-sm text-gray-500 mb-6">Analiza el video con el modelo entrenado.</p>

          {!pipelineStatus?.running && (
            <div className="space-y-2 mb-6">
              {videos.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No hay videos.</p>}
              {videos.map((v: any) => (
                <div key={v.filename} className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{v.match_id}</p>
                    <p className="text-xs text-gray-400">{v.size_mb} MB</p>
                  </div>
                  <button onClick={() => runPipeline(v.match_id)} disabled={!modelInfo?.exists}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {modelInfo?.exists ? 'Ejecutar' : 'Necesitas modelo (paso 4)'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {pipelineStatus && (
            <div>
              <ProgressCard status={pipelineStatus} />
              {pipelineStatus.finished_at && !pipelineStatus.error && (
                <div className="mt-4 flex gap-3">
                  <a href="/admin/league" className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600">League View</a>
                  <a href="/admin/brands" className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600">Brand View</a>
                  <a href="/admin" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Dashboard</a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== TRAIN STEP ====================
function TrainStep({ trainConfig, setTrainConfig, trainingStatus, startTraining, setActiveStep }: any) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const token = getToken()
    const headers: any = token ? { 'Authorization': `Bearer ${token}` } : {}
    fetch(`${API_URL}/training/model/history`, { headers }).then(r => r.json()).then(setHistory).catch(() => {})
  }, [trainingStatus?.finished_at])

  const metrics = trainingStatus?.metrics
  const epochHistory = trainingStatus?.epoch_history || []

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-900 mb-1">5. Entrenar modelo YOLO</h2>
      <p className="text-sm text-gray-500 mb-6">Configura y entrena. Ves las metricas en tiempo real.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Epochs', key: 'epochs' as const },
          { label: 'Image Size', key: 'imgsz' as const },
          { label: 'Batch Size', key: 'batch' as const },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
            <input type="number" value={trainConfig[f.key]}
              onChange={(e: any) => setTrainConfig({ ...trainConfig, [f.key]: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
          </div>
        ))}
      </div>

      <button onClick={startTraining} disabled={trainingStatus?.running}
        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50">
        {trainingStatus?.running ? 'Entrenando...' : 'Iniciar entrenamiento'}
      </button>

      {trainingStatus && (
        <div className="mt-6">
          <ProgressCard status={trainingStatus} showBar />

          {/* Metricas en vivo */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <MetricCard label="Precision" value={metrics.precision} color="blue" desc="Detecciones correctas" />
              <MetricCard label="Recall" value={metrics.recall} color="emerald" desc="Logos encontrados" />
              <MetricCard label="mAP@50" value={metrics.mAP50} color="indigo" desc="Confianza general" />
              <MetricCard label="mAP@50-95" value={metrics.mAP50_95} color="purple" desc="Precision estricta" />
            </div>
          )}

          {/* Progreso por epoch */}
          {epochHistory.length > 1 && (
            <div className="mt-4 bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Progreso de mAP@50 por epoch</p>
              <div className="flex items-end gap-px h-24">
                {epochHistory.map((e: any, i: number) => {
                  const val = e.mAP50 || 0
                  const h = Math.max(val * 100, 2)
                  const isLast = i === epochHistory.length - 1
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                      <div className={`w-full rounded-t transition-all ${isLast ? 'bg-indigo-500' : 'bg-indigo-300'}`}
                        style={{ height: `${h}%` }} />
                      <div className="hidden group-hover:block absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        E{e.epoch}: {(val * 100).toFixed(1)}%
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400">Epoch 1</span>
                <span className="text-[10px] text-gray-400">Epoch {epochHistory.length}</span>
              </div>
            </div>
          )}

          {trainingStatus.finished_at && !trainingStatus.error && (
            <button onClick={() => setActiveStep('run')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              Siguiente: Ejecutar pipeline
            </button>
          )}
        </div>
      )}

      {/* Historial de entrenamientos */}
      {history.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-6">
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
            <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
            Historial de entrenamientos ({history.length})
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.slice().reverse().map((h: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'
                      }`}>{history.length - i}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(h.date).toLocaleDateString('es-PE')} {new Date(h.date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{h.epochs} epochs, img {h.imgsz}</span>
                  </div>
                  {h.final_metrics && (
                    <div className="grid grid-cols-4 gap-2">
                      <MiniMetric label="Precision" value={h.final_metrics.precision} />
                      <MiniMetric label="Recall" value={h.final_metrics.recall} />
                      <MiniMetric label="mAP@50" value={h.final_metrics.mAP50} />
                      <MiniMetric label="mAP@50-95" value={h.final_metrics.mAP50_95} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, color, desc }: { label: string; value: number; color: string; desc: string }) {
  const pct = (value || 0) * 100
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600', emerald: 'from-emerald-500 to-emerald-600',
    indigo: 'from-indigo-500 to-indigo-600', purple: 'from-purple-500 to-purple-600',
  }
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100', emerald: 'bg-emerald-50 border-emerald-100',
    indigo: 'bg-indigo-50 border-indigo-100', purple: 'bg-purple-50 border-purple-100',
  }
  return (
    <div className={`rounded-xl border p-3 ${bgMap[color] || 'bg-gray-50'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{pct.toFixed(1)}%</p>
      <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${colorMap[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{desc}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  const pct = ((value || 0) * 100).toFixed(1)
  return (
    <div className="text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${parseFloat(pct) >= 70 ? 'text-emerald-700' : parseFloat(pct) >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
        {pct}%
      </p>
    </div>
  )
}

// ==================== NEW LABEL ROW ====================
function NewLabelRow({ label }: { label: string }) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
  const [status, setStatus] = useState<'pending' | 'saving' | 'saved' | 'skipped'>('pending')
  const [nombre, setNombre] = useState(label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  const [categoria, setCategoria] = useState('')

  const save = async () => {
    setStatus('saving')
    try {
      const token = getToken()
      const res = await fetch(`${API_URL}/sponsors/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sponsor_id: label, nombre, categoria, tier_mvp: 3 }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      setStatus('saved')
    } catch { setStatus('pending') }
  }

  if (status === 'saved') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg">
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        <code className="text-xs font-bold text-emerald-800">{label}</code>
        <span className="text-xs text-emerald-600">— creado como &quot;{nombre}&quot;</span>
      </div>
    )
  }

  if (status === 'skipped') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
        <span className="text-xs text-gray-400 line-through">{label}</span>
        <span className="text-xs text-gray-400">— ignorado</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <code className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-xs font-bold">{label}</code>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre"
        className="flex-1 px-2 py-1 border border-amber-300 rounded-lg text-xs bg-white" />
      <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Categoria"
        className="w-28 px-2 py-1 border border-amber-300 rounded-lg text-xs bg-white" />
      <button onClick={save} disabled={status === 'saving'}
        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
        {status === 'saving' ? '...' : 'Crear'}
      </button>
      <button onClick={() => setStatus('skipped')}
        className="px-3 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-300">
        Ignorar
      </button>
    </div>
  )
}

// ==================== PROGRESS CARD ====================
function ProgressCard({ status, showBar }: { status: any; showBar?: boolean }) {
  const isRunning = status.running
  const isDone = status.finished_at && !status.error
  const isError = !!status.error
  const percent = typeof status.percent === 'number' ? status.percent : null
  const hasDetPercent = percent !== null && percent > 0
  const logRef = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedRef = useRef<number | null>(null)

  // Contador de tiempo transcurrido
  useEffect(() => {
    if (isRunning && startedRef.current === null) {
      startedRef.current = Date.now()
    }
    if (!isRunning) {
      startedRef.current = null
      return
    }
    const t = setInterval(() => {
      if (startedRef.current) setElapsed(Math.floor((Date.now() - startedRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [isRunning])

  // Auto-scroll log al final
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [status.log?.length])

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div>
      {/* Status banner */}
      <div className={`rounded-xl p-4 ${
        isError ? 'bg-red-50 border border-red-200' :
        isRunning ? 'bg-indigo-50 border border-indigo-200' :
        isDone ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isRunning && (
              <div className="relative w-5 h-5 flex-shrink-0">
                <div className="absolute inset-0 border-2 border-indigo-200 rounded-full" />
                <div className="absolute inset-0 border-2 border-indigo-600 rounded-full border-t-transparent animate-spin" />
              </div>
            )}
            {isDone && (
              <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            )}
            {isError && <span className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">!</span>}
            <p className={`text-sm font-medium truncate ${
              isError ? 'text-red-700' : isRunning ? 'text-indigo-700' : 'text-emerald-700'
            }`}>{status.progress || (isRunning ? 'Inicializando...' : isDone ? 'Completado' : '')}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isRunning && (
              <span className="text-xs font-mono text-indigo-600 bg-white/60 px-2 py-0.5 rounded">
                {formatElapsed(elapsed)}
              </span>
            )}
            {percent !== null && (
              <span className={`text-lg font-bold ${isError ? 'text-red-700' : isRunning ? 'text-indigo-700' : 'text-emerald-700'}`}>
                {percent}%
              </span>
            )}
          </div>
        </div>

        {/* Progress bar — siempre visible cuando corre */}
        {(showBar || isRunning) && (
          <div className="mt-3 w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
            {hasDetPercent ? (
              <div className={`h-full rounded-full transition-all duration-500 ease-out ${
                isError ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
              }`} style={{ width: `${percent}%` }}>
                <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"
                  style={{ backgroundSize: '200% 100%' }} />
              </div>
            ) : isRunning ? (
              // Indeterminado: barra animada sliding
              <div className="h-full absolute top-0 left-0 w-1/3 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
            ) : null}
          </div>
        )}

        {/* Hint cuando no hay progreso aun */}
        {isRunning && !hasDetPercent && (
          <p className="text-[11px] text-indigo-600 mt-2 italic">
            Preparando... (descargando modelo base y cargando dataset, puede tardar ~30s)
          </p>
        )}
      </div>

      {/* Log — siempre visible cuando esta corriendo o hay log */}
      {(isRunning || isError || (status.log?.length > 0)) && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              {isRunning && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
              Log en vivo
            </span>
            {status.log?.length > 0 && (
              <span className="text-[10px] text-gray-400">{status.log.length} lineas</span>
            )}
          </div>
          <div ref={logRef} className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto border border-slate-800">
            {status.log?.length > 0 ? (
              status.log.map((line: string, i: number) => (
                <p key={i} className={`text-xs font-mono leading-relaxed ${
                  line.includes('ERROR') ? 'text-red-400' :
                  line.includes('->') || line.includes('Completado') || line.includes('completado') ? 'text-emerald-400' :
                  line.includes('Epoch') ? 'text-indigo-300' :
                  'text-slate-400'
                }`}>{line}</p>
              ))
            ) : (
              <div className="flex items-center gap-2 py-2">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                <p className="text-xs font-mono text-slate-500 ml-2">Esperando primera linea del log...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
