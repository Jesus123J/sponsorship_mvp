'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { getToken } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

const colorFor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 70%, 50%)`
}

type Box = {
  class: string
  x: number
  y: number
  w: number
  h: number
  confidence?: number      // de auto-detect
  suggested?: boolean      // true si vino del modelo y aun no fue aprobada
}

type DragMode =
  | { kind: 'create'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'move'; idx: number; offsetX: number; offsetY: number }
  | { kind: 'resize'; idx: number; corner: 'tl' | 'tr' | 'bl' | 'br' }
  | null

export default function EtiquetarPage() {
  const [videos, setVideos] = useState<any[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [selectedMatch, setSelectedMatch] = useState<string>('')
  const [framesData, setFramesData] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [currentFrame, setCurrentFrame] = useState<{ second: number; filename: string } | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [boxes, setBoxes] = useState<Box[]>([])
  const [activeClass, setActiveClass] = useState('')
  const [selectedBoxIdx, setSelectedBoxIdx] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragMode>(null)
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 })
  const [saving, setSaving] = useState(false)
  const [autoDetecting, setAutoDetecting] = useState(false)
  const [autoDetectOnLoad, setAutoDetectOnLoad] = useState(true)
  const [confThreshold, setConfThreshold] = useState(0.3)
  const [packaging, setPackaging] = useState(false)
  const [packageResult, setPackageResult] = useState<any>(null)
  const [filterClass, setFilterClass] = useState('')
  const [hasModel, setHasModel] = useState(true)
  // Selección por bloques
  const [selectMode, setSelectMode] = useState(false)
  const [selectedSeconds, setSelectedSeconds] = useState<Set<number>>(new Set())
  const [filterFrames, setFilterFrames] = useState<'all' | 'annotated' | 'pending' | 'trained' | 'untrained'>('all')
  const [onlyUntrained, setOnlyUntrained] = useState(true)
  // Crear clase nueva
  const [showNewClass, setShowNewClass] = useState(false)
  const [newClassForm, setNewClassForm] = useState({ sponsor_id: '', nombre: '', categoria: 'jersey' })
  // Batch auto-detect
  const [batchDetecting, setBatchDetecting] = useState(false)
  // Limite para empaquetar
  const [packageLimit, setPackageLimit] = useState<number>(0)
  // R2
  const [r2Videos, setR2Videos] = useState<any[]>([])
  const [r2Configured, setR2Configured] = useState(false)
  const [importingR2, setImportingR2] = useState<string>('')
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    authFetch(`${API}/labeling/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    authFetch(`${API}/labeling/classes`).then(r => r.json()).then(c => {
      setClasses(c)
      if (c.length > 0) setActiveClass(c[0])
    }).catch(() => {})
    authFetch(`${API}/training/model/info`).then(r => r.json()).then(info => {
      setHasModel(!!info?.exists)
    }).catch(() => setHasModel(false))
    // R2 — videos disponibles para importar
    authFetch(`${API}/storage/status`).then(r => r.ok ? r.json() : null).then(s => {
      if (s?.configured && !s.error) {
        setR2Configured(true)
        authFetch(`${API}/storage/videos`).then(r => r.ok ? r.json() : []).then(setR2Videos).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const importFromR2AndExtract = async (remoteKey: string) => {
    const filename = remoteKey.split('/').pop() || remoteKey
    const defaultId = filename.replace(/\.mp4$/i, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const matchId = prompt(`match_id para guardar:`, defaultId)
    if (!matchId) return
    setImportingR2(remoteKey)
    try {
      // 1. Importar de R2 a local
      let res = await authFetch(`${API}/storage/import-video`, {
        method: 'POST',
        body: JSON.stringify({ remote_key: remoteKey, match_id: matchId }),
      })
      let data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      // 2. Iniciar extraccion de frames
      res = await authFetch(`${API}/training/extract-frames?match_id=${matchId}`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail)
      alert(`✅ Importado y extrayendo frames. Ve a /admin/pipeline paso 2 para ver progreso. Cuando termine, vuelve aqui y aparecera en la lista.`)
    } catch (e: any) { alert(e.message) }
    setImportingR2('')
  }

  useEffect(() => {
    if (!selectedMatch) return
    authFetch(`${API}/labeling/${selectedMatch}/frames?page=${page}&per_page=60`)
      .then(r => r.json()).then(setFramesData).catch(() => {})
  }, [selectedMatch, page])

  // Cargar frame + anotaciones + auto-detect al abrir
  useEffect(() => {
    if (!currentFrame || !selectedMatch) return
    setSelectedBoxIdx(null)
    authFetch(`${API}/labeling/${selectedMatch}/frame/${currentFrame.second}/token`)
      .then(r => r.json()).then(t => setImageUrl(`${API}/labeling/${selectedMatch}/frame/${currentFrame.second}/image?token=${t.token}`))
      .catch(() => {})
    authFetch(`${API}/labeling/${selectedMatch}/frame/${currentFrame.second}/annotations`)
      .then(r => r.json()).then(d => {
        const existing = d.boxes || []
        setBoxes(existing)
        // Si no hay anotaciones manuales y auto-detect esta activo, sugerir
        if (existing.length === 0 && autoDetectOnLoad && hasModel) {
          runAutoDetect()
        }
      })
      .catch(() => setBoxes([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, selectedMatch])

  const runAutoDetect = useCallback(async () => {
    if (!currentFrame || !selectedMatch || !hasModel) return
    setAutoDetecting(true)
    try {
      const res = await authFetch(`${API}/labeling/${selectedMatch}/frame/${currentFrame.second}/auto-detect?conf=${confThreshold}`)
      if (!res.ok) throw new Error((await res.json()).detail)
      const data = await res.json()
      // Mezclar sugerencias con cajas manuales (si las hay)
      setBoxes(prev => {
        const manual = prev.filter(b => !b.suggested)
        return [...manual, ...data.suggestions]
      })
    } catch (e: any) { alert('Auto-detect: ' + e.message) }
    setAutoDetecting(false)
  }, [currentFrame, selectedMatch, hasModel, confThreshold])

  const onImageLoad = () => {
    if (imgRef.current) {
      setImgDims({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
    }
  }

  const getCanvasCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return null
    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = imgRef.current.naturalWidth / rect.width
    const scaleY = imgRef.current.naturalHeight / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const findBoxAt = (x: number, y: number): number => {
    // Buscar de adelante a atras (la mas reciente prevalece)
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i]
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i
    }
    return -1
  }

  const findCornerAt = (x: number, y: number, idx: number): 'tl' | 'tr' | 'bl' | 'br' | null => {
    if (idx < 0 || idx >= boxes.length) return null
    const b = boxes[idx]
    const tol = Math.max(15, Math.min(b.w, b.h) * 0.15)
    if (Math.abs(x - b.x) < tol && Math.abs(y - b.y) < tol) return 'tl'
    if (Math.abs(x - (b.x + b.w)) < tol && Math.abs(y - b.y) < tol) return 'tr'
    if (Math.abs(x - b.x) < tol && Math.abs(y - (b.y + b.h)) < tol) return 'bl'
    if (Math.abs(x - (b.x + b.w)) < tol && Math.abs(y - (b.y + b.h)) < tol) return 'br'
    return null
  }

  const onMouseDown = (e: React.MouseEvent) => {
    const c = getCanvasCoords(e)
    if (!c) return

    // Click en una caja seleccionada → mover o redimensionar
    if (selectedBoxIdx !== null) {
      const corner = findCornerAt(c.x, c.y, selectedBoxIdx)
      if (corner) {
        setDrag({ kind: 'resize', idx: selectedBoxIdx, corner })
        return
      }
      const b = boxes[selectedBoxIdx]
      if (c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h) {
        setDrag({ kind: 'move', idx: selectedBoxIdx, offsetX: c.x - b.x, offsetY: c.y - b.y })
        return
      }
    }

    // Click sobre alguna caja → seleccionar
    const idx = findBoxAt(c.x, c.y)
    if (idx >= 0) {
      setSelectedBoxIdx(idx)
      const b = boxes[idx]
      setDrag({ kind: 'move', idx, offsetX: c.x - b.x, offsetY: c.y - b.y })
      return
    }

    // Click en area vacia → empezar a dibujar nueva caja
    if (!activeClass) { alert('Elige una clase primero'); return }
    setSelectedBoxIdx(null)
    setDrag({ kind: 'create', x1: c.x, y1: c.y, x2: c.x, y2: c.y })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const c = getCanvasCoords(e)
    if (!c || !drag) return

    if (drag.kind === 'create') {
      setDrag({ ...drag, x2: c.x, y2: c.y })
    } else if (drag.kind === 'move') {
      const newX = Math.max(0, Math.min(imgDims.w - boxes[drag.idx].w, c.x - drag.offsetX))
      const newY = Math.max(0, Math.min(imgDims.h - boxes[drag.idx].h, c.y - drag.offsetY))
      setBoxes(boxes.map((b, i) => i === drag.idx ? { ...b, x: newX, y: newY, suggested: false } : b))
    } else if (drag.kind === 'resize') {
      const b = boxes[drag.idx]
      let newX = b.x, newY = b.y, newW = b.w, newH = b.h
      const cx = Math.max(0, Math.min(imgDims.w, c.x))
      const cy = Math.max(0, Math.min(imgDims.h, c.y))
      if (drag.corner === 'tl') {
        newW = b.x + b.w - cx; newH = b.y + b.h - cy; newX = cx; newY = cy
      } else if (drag.corner === 'tr') {
        newW = cx - b.x; newH = b.y + b.h - cy; newY = cy
      } else if (drag.corner === 'bl') {
        newW = b.x + b.w - cx; newH = cy - b.y; newX = cx
      } else if (drag.corner === 'br') {
        newW = cx - b.x; newH = cy - b.y
      }
      if (newW > 5 && newH > 5) {
        setBoxes(boxes.map((bx, i) => i === drag.idx
          ? { ...bx, x: newX, y: newY, w: newW, h: newH, suggested: false } : bx))
      }
    }
  }

  const onMouseUp = () => {
    if (!drag) return
    if (drag.kind === 'create') {
      const x = Math.min(drag.x1, drag.x2)
      const y = Math.min(drag.y1, drag.y2)
      const w = Math.abs(drag.x2 - drag.x1)
      const h = Math.abs(drag.y2 - drag.y1)
      if (w > 5 && h > 5 && activeClass) {
        const newBox: Box = { class: activeClass, x, y, w, h }
        setBoxes([...boxes, newBox])
        setSelectedBoxIdx(boxes.length)
      }
    }
    setDrag(null)
  }

  const removeBox = (idx: number) => {
    setBoxes(boxes.filter((_, i) => i !== idx))
    setSelectedBoxIdx(null)
  }

  const approveBox = (idx: number) => {
    setBoxes(boxes.map((b, i) => i === idx ? { ...b, suggested: false } : b))
  }

  const approveAllSuggestions = () => {
    setBoxes(boxes.map(b => ({ ...b, suggested: false })))
  }

  const rejectAllSuggestions = () => {
    setBoxes(boxes.filter(b => !b.suggested))
  }

  const changeClassOfSelected = (newClass: string) => {
    if (selectedBoxIdx === null) return
    setBoxes(boxes.map((b, i) => i === selectedBoxIdx ? { ...b, class: newClass, suggested: false } : b))
  }

  const saveAnnotations = useCallback(async () => {
    if (!currentFrame || !selectedMatch) return
    setSaving(true)
    try {
      // Solo guardamos cajas confirmadas (no las "suggested" que no fueron aprobadas)
      const finalBoxes = boxes.filter(b => !b.suggested).map(({ confidence, suggested, ...rest }) => rest)
      const res = await authFetch(`${API}/labeling/${selectedMatch}/frame/${currentFrame.second}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ boxes: finalBoxes }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      authFetch(`${API}/labeling/${selectedMatch}/frames?page=${page}&per_page=60`)
        .then(r => r.json()).then(setFramesData).catch(() => {})
      authFetch(`${API}/labeling/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }, [currentFrame, selectedMatch, boxes, page])

  const goToFrame = (delta: number) => {
    if (!framesData || !currentFrame) return
    const idx = framesData.frames.findIndex((f: any) => f.second === currentFrame.second)
    if (idx === -1) return
    const nextIdx = idx + delta
    if (nextIdx >= 0 && nextIdx < framesData.frames.length) {
      saveAnnotations()
      setCurrentFrame(framesData.frames[nextIdx])
    }
  }

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (!currentFrame) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBoxIdx !== null) { e.preventDefault(); removeBox(selectedBoxIdx) }
      } else if (e.key === 'Escape') {
        setSelectedBoxIdx(null); setDrag(null)
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault(); saveAnnotations()
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault(); runAutoDetect()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); goToFrame(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); goToFrame(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedBoxIdx !== null && boxes[selectedBoxIdx]?.suggested) approveBox(selectedBoxIdx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, selectedBoxIdx, boxes, saveAnnotations, runAutoDetect])

  const packageAndTrain = async (autoTrain: boolean, useSelection: boolean = false) => {
    setPackaging(true); setPackageResult(null)
    try {
      const payload: any = {
        match_id: selectedMatch || null,
        auto_train: autoTrain,
        epochs: 50, imgsz: 640, batch: 16,
      }
      if (useSelection && selectedSeconds.size > 0) {
        payload.frame_seconds = Array.from(selectedSeconds)
      } else {
        if (packageLimit > 0) payload.limit = packageLimit
        if (onlyUntrained) payload.only_untrained = true
      }
      const res = await authFetch(`${API}/labeling/package-and-train`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setPackageResult(data)
    } catch (e: any) { setPackageResult({ error: e.message }) }
    setPackaging(false)
  }

  const createNewClass = async () => {
    if (!newClassForm.sponsor_id) return alert('sponsor_id requerido')
    try {
      const res = await authFetch(`${API}/labeling/classes`, {
        method: 'POST',
        body: JSON.stringify(newClassForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      // Recargar clases
      const updated = await authFetch(`${API}/labeling/classes`).then(r => r.json())
      setClasses(updated)
      setActiveClass(data.sponsor_id)
      setShowNewClass(false)
      setNewClassForm({ sponsor_id: '', nombre: '', categoria: 'jersey' })
    } catch (e: any) { alert(e.message) }
  }

  const batchAutoDetect = async () => {
    if (!selectedMatch || selectedSeconds.size === 0) {
      return alert('Selecciona frames primero (modo seleccion)')
    }
    if (!confirm(`Correr auto-detect en ${selectedSeconds.size} frames? Las anotaciones existentes se sobrescriben.`)) return
    setBatchDetecting(true)
    try {
      const res = await authFetch(`${API}/labeling/${selectedMatch}/batch-auto-detect`, {
        method: 'POST',
        body: JSON.stringify({
          seconds: Array.from(selectedSeconds),
          conf: confThreshold,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ ${data.frames_processed} frames procesados, ${data.total_boxes_added} cajas agregadas`)
      // Recargar lista
      authFetch(`${API}/labeling/${selectedMatch}/frames?page=${page}&per_page=60`)
        .then(r => r.json()).then(setFramesData).catch(() => {})
      authFetch(`${API}/labeling/videos`).then(r => r.json()).then(setVideos).catch(() => {})
    } catch (e: any) { alert(e.message) }
    setBatchDetecting(false)
  }

  const toggleSelect = (second: number) => {
    const next = new Set(selectedSeconds)
    if (next.has(second)) next.delete(second)
    else next.add(second)
    setSelectedSeconds(next)
  }

  const selectAllVisible = () => {
    if (!framesData) return
    const visible = framesData.frames.filter((f: any) => {
      if (filterFrames === 'annotated') return f.boxes_count > 0
      if (filterFrames === 'pending') return f.boxes_count === 0
      return true
    })
    setSelectedSeconds(new Set(visible.map((f: any) => f.second)))
  }

  const clearSelection = () => setSelectedSeconds(new Set())

  const filteredClasses = classes.filter(c => !filterClass || c.toLowerCase().includes(filterClass.toLowerCase()))
  const suggestedCount = boxes.filter(b => b.suggested).length
  const confirmedCount = boxes.filter(b => !b.suggested).length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Etiquetado avanzado</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Auto-detección + edición + bloques. {hasModel ? '🤖 Modelo activo' : '⚠ Sin modelo entrenado'}.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={autoDetectOnLoad} onChange={e => setAutoDetectOnLoad(e.target.checked)} />
            Auto-detect al abrir
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={onlyUntrained} onChange={e => setOnlyUntrained(e.target.checked)} />
            Solo no entrenados
          </label>
          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs">
            <span className="text-gray-500">Limite:</span>
            <input type="number" min="0" value={packageLimit}
              onChange={e => setPackageLimit(parseInt(e.target.value) || 0)}
              placeholder="0=todos" className="w-14 outline-none" />
            <span className="text-gray-400">frames</span>
          </div>
          <button onClick={() => packageAndTrain(false, false)} disabled={packaging}
            className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
            📦 Empaquetar
          </button>
          <button onClick={() => packageAndTrain(true, false)} disabled={packaging}
            className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            🚀 Empaquetar + entrenar
          </button>
          {selectedSeconds.size > 0 && (
            <button onClick={() => packageAndTrain(true, true)} disabled={packaging}
              className="px-3 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
              🎯 Entrenar solo {selectedSeconds.size}
            </button>
          )}
        </div>
      </div>

      {packageResult && (
        <div className={`mb-6 rounded-xl p-4 ${packageResult.error ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          {packageResult.error ? (
            <p className="text-sm text-red-700">❌ {packageResult.error}</p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-emerald-900 mb-2">✅ {packageResult.message}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-white rounded-lg p-2"><strong>{packageResult.total_images}</strong> imagenes</div>
                <div className="bg-white rounded-lg p-2"><strong>{packageResult.total_boxes}</strong> cajas</div>
                <div className="bg-white rounded-lg p-2"><strong>{packageResult.classes_used.length}</strong> clases usadas</div>
                <div className="bg-white rounded-lg p-2"><strong>{packageResult.videos_packaged}</strong> videos</div>
              </div>
              {packageResult.training_started && (
                <p className="text-xs text-emerald-700 mt-3">
                  🚀 Entrenamiento iniciado. Ve a <a href="/admin/pipeline" className="underline">/admin/pipeline</a> paso 5.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Sidebar 1: videos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-h-[80vh] overflow-y-auto">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Videos disponibles</h3>

          {/* R2 — videos para importar */}
          {r2Configured && r2Videos.length > 0 && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-2">
              <p className="text-[10px] font-bold text-purple-900 uppercase mb-2">☁ Importar desde R2</p>
              <div className="space-y-1">
                {r2Videos.map((v: any) => (
                  <button key={v.key} onClick={() => importFromR2AndExtract(v.key)}
                    disabled={importingR2 === v.key}
                    className="w-full text-left p-1.5 bg-white rounded text-[10px] hover:bg-purple-100 disabled:opacity-50">
                    <p className="font-medium text-gray-900 truncate">{v.key.split('/').pop()}</p>
                    <p className="text-gray-500">{v.size_mb} MB · {importingR2 === v.key ? '⏳ importando...' : '⬇ Importar + extraer frames'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {videos.length === 0 && !r2Configured && (
            <p className="text-xs text-gray-400">
              No hay videos con frames. Ve a{' '}
              <a href="/admin/pipeline" className="text-indigo-600 underline">pipeline</a>.
            </p>
          )}
          <div className="space-y-2">
            {videos.map((v: any) => (
              <button key={v.match_id} onClick={() => { setSelectedMatch(v.match_id); setPage(1); setCurrentFrame(null) }}
                className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                  selectedMatch === v.match_id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                }`}>
                <p className="text-xs font-bold text-gray-900 truncate">{v.match_id}</p>
                <div className="text-[10px] text-gray-500 mt-1">
                  {v.annotated_frames}/{v.total_frames} etiquetados · {v.total_boxes} cajas
                </div>
                <div className="text-[10px] mt-0.5 flex gap-2">
                  <span className="text-purple-700">🚀 {v.trained_frames || 0} entrenados</span>
                  {(v.pending_train_frames || 0) > 0 && (
                    <span className="text-amber-700">⏳ {v.pending_train_frames} por entrenar</span>
                  )}
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden flex">
                  <div className="h-full bg-purple-500" style={{ width: `${(v.trained_frames / v.total_frames) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${((v.pending_train_frames || 0) / v.total_frames) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Centro: canvas */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {!selectedMatch ? (
            <div className="text-center text-gray-400 py-20">
              <p className="text-2xl mb-2">📁</p>
              <p>Selecciona un video</p>
            </div>
          ) : !currentFrame ? (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {selectedMatch}
                  {framesData && <span className="text-gray-400 ml-2 text-xs">({framesData.total} frames)</span>}
                </h3>
                <div className="flex gap-1 flex-wrap">
                  {/* Filtro de frames */}
                  <div className="flex bg-gray-100 rounded-lg p-0.5 flex-wrap">
                    {([
                      { k: 'all', label: 'Todos' },
                      { k: 'annotated', label: '✓ Etiquetados' },
                      { k: 'pending', label: 'Sin etiquetar' },
                      { k: 'untrained', label: '🚀 Por entrenar' },
                      { k: 'trained', label: '✅ Ya entrenados' },
                    ] as const).map(f => (
                      <button key={f.k} onClick={() => setFilterFrames(f.k as any)}
                        className={`px-2 py-1 text-xs rounded ${filterFrames === f.k ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {/* Selección */}
                  <button onClick={() => setSelectMode(!selectMode)}
                    className={`px-2 py-1 text-xs rounded font-semibold ${selectMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {selectMode ? '✓ Seleccionar ON' : '☐ Seleccionar'}
                  </button>
                  {/* Paginacion */}
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="px-2 py-1 bg-gray-100 rounded text-xs disabled:opacity-40">←</button>
                  <span className="px-2 py-1 text-xs text-gray-600">Pag {page}</span>
                  <button onClick={() => setPage(page + 1)} disabled={!framesData || page * 60 >= framesData.total}
                    className="px-2 py-1 bg-gray-100 rounded text-xs disabled:opacity-40">→</button>
                </div>
              </div>

              {/* Toolbar de selección */}
              {selectMode && (
                <div className="flex items-center gap-2 mb-3 p-2 bg-indigo-50 rounded-lg flex-wrap text-xs">
                  <strong className="text-indigo-700">{selectedSeconds.size} seleccionados</strong>
                  <button onClick={selectAllVisible}
                    className="px-2 py-1 bg-white rounded font-medium hover:bg-gray-50">
                    Seleccionar visibles
                  </button>
                  <button onClick={clearSelection}
                    className="px-2 py-1 bg-white rounded font-medium hover:bg-gray-50">
                    Limpiar selección
                  </button>
                  {selectedSeconds.size > 0 && hasModel && (
                    <button onClick={batchAutoDetect} disabled={batchDetecting}
                      className="px-2 py-1 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 disabled:opacity-50">
                      {batchDetecting ? '🔍 Detectando...' : `🤖 Auto-detect en ${selectedSeconds.size}`}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[70vh] overflow-y-auto">
                {framesData?.frames
                  .filter((f: any) => {
                    if (filterFrames === 'annotated') return f.boxes_count > 0
                    if (filterFrames === 'pending') return f.boxes_count === 0
                    if (filterFrames === 'trained') return (f.train_count || 0) > 0
                    if (filterFrames === 'untrained') return f.boxes_count > 0 && (f.train_count || 0) === 0
                    return true
                  })
                  .map((f: any) => (
                    <FrameThumb key={f.filename} matchId={selectedMatch} frame={f}
                      selectMode={selectMode}
                      isSelected={selectedSeconds.has(f.second)}
                      onToggleSelect={() => toggleSelect(f.second)}
                      onClick={() => selectMode ? toggleSelect(f.second) : setCurrentFrame(f)} />
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Toolbar superior */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <button onClick={() => { saveAnnotations(); setCurrentFrame(null) }}
                  className="text-xs text-indigo-600 hover:text-indigo-800">← Volver</button>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-gray-700">Frame <strong>{currentFrame.second}s</strong></span>
                  {confirmedCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">
                      ✓ {confirmedCount}
                    </span>
                  )}
                  {suggestedCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">
                      🤖 {suggestedCount} sugeridas
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => goToFrame(-1)}
                    className="px-2 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">← (←)</button>
                  <button onClick={() => goToFrame(1)}
                    className="px-2 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">(→) →</button>
                </div>
              </div>

              {/* Auto-detect bar */}
              {hasModel && (
                <div className="flex items-center gap-2 mb-3 p-2 bg-indigo-50 rounded-lg flex-wrap">
                  <button onClick={runAutoDetect} disabled={autoDetecting}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                    {autoDetecting ? '🔍 Detectando...' : '🤖 Auto-detect (A)'}
                  </button>
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    Confianza:
                    <input type="range" min="0.1" max="0.9" step="0.05"
                      value={confThreshold}
                      onChange={e => setConfThreshold(parseFloat(e.target.value))}
                      className="w-24" />
                    <span className="font-mono w-8">{(confThreshold * 100).toFixed(0)}%</span>
                  </label>
                  {suggestedCount > 0 && (
                    <>
                      <button onClick={approveAllSuggestions}
                        className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700">
                        ✓ Aprobar todas
                      </button>
                      <button onClick={rejectAllSuggestions}
                        className="px-2 py-1 bg-red-100 text-red-700 rounded text-[10px] font-bold hover:bg-red-200">
                        ✕ Rechazar todas
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Canvas */}
              <div ref={containerRef} className="relative inline-block w-full select-none"
                style={{ cursor: drag?.kind === 'move' ? 'grabbing' : drag?.kind === 'resize' ? 'nwse-resize' : 'crosshair' }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
                {imageUrl && (
                  <img ref={imgRef} src={imageUrl} alt={`frame ${currentFrame.second}`}
                    onLoad={onImageLoad}
                    className="w-full rounded-lg border border-gray-200 pointer-events-none" draggable={false} />
                )}

                {/* Cajas */}
                {imgDims.w > 0 && boxes.map((b, i) => {
                  const scaleX = (imgRef.current?.clientWidth || 1) / imgDims.w
                  const scaleY = (imgRef.current?.clientHeight || 1) / imgDims.h
                  const isSelected = selectedBoxIdx === i
                  const color = colorFor(b.class)
                  return (
                    <div key={i} className="absolute pointer-events-none"
                      style={{
                        left: b.x * scaleX, top: b.y * scaleY,
                        width: b.w * scaleX, height: b.h * scaleY,
                        border: `${isSelected ? 3 : 2}px ${b.suggested ? 'dashed' : 'solid'} ${color}`,
                        background: isSelected ? `${color}33` : `${color}1a`,
                        boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${color}` : 'none',
                      }}>
                      {/* Etiqueta superior */}
                      <div className="absolute -top-6 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white pointer-events-auto flex items-center gap-1"
                        style={{ background: color }}>
                        <span>{b.class}</span>
                        {b.confidence !== undefined && (
                          <span className="opacity-80">{(b.confidence * 100).toFixed(0)}%</span>
                        )}
                        {b.suggested && (
                          <button onClick={(e) => { e.stopPropagation(); approveBox(i) }}
                            title="Aprobar (Enter)"
                            className="ml-1 px-1 bg-white/30 hover:bg-white/50 rounded">✓</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); removeBox(i) }}
                          title="Eliminar (Del)"
                          className="ml-0.5 px-1 bg-white/30 hover:bg-white/50 rounded">✕</button>
                      </div>

                      {/* Resize handles cuando seleccionada */}
                      {isSelected && (
                        <>
                          {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
                            <div key={corner} className="absolute w-3 h-3 bg-white border-2 pointer-events-auto"
                              style={{
                                borderColor: color,
                                top: corner.startsWith('t') ? -6 : 'auto',
                                bottom: corner.startsWith('b') ? -6 : 'auto',
                                left: corner.endsWith('l') ? -6 : 'auto',
                                right: corner.endsWith('r') ? -6 : 'auto',
                                cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                              }} />
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Caja en construccion */}
                {drag?.kind === 'create' && imgDims.w > 0 && (() => {
                  const scaleX = (imgRef.current?.clientWidth || 1) / imgDims.w
                  const scaleY = (imgRef.current?.clientHeight || 1) / imgDims.h
                  const x = Math.min(drag.x1, drag.x2)
                  const y = Math.min(drag.y1, drag.y2)
                  const w = Math.abs(drag.x2 - drag.x1)
                  const h = Math.abs(drag.y2 - drag.y1)
                  return (
                    <div className="absolute border-2 border-dashed pointer-events-none"
                      style={{
                        left: x * scaleX, top: y * scaleY, width: w * scaleX, height: h * scaleY,
                        borderColor: colorFor(activeClass),
                        background: `${colorFor(activeClass)}22`,
                      }} />
                  )
                })()}
              </div>

              {/* Toolbar inferior */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={saveAnnotations} disabled={saving}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : '💾 Guardar (S)'}
                </button>
                <button onClick={() => { setBoxes(boxes.filter(b => !b.suggested)); setSelectedBoxIdx(null) }}
                  className="px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-medium hover:bg-amber-200">
                  Quitar sugerencias
                </button>
                <button onClick={() => { setBoxes([]); setSelectedBoxIdx(null) }}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-medium hover:bg-red-200">
                  Limpiar todo
                </button>
              </div>

              {/* Atajos */}
              <div className="mt-2 text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                <span><kbd className="bg-gray-100 px-1 rounded">←/→</kbd> frame</span>
                <span><kbd className="bg-gray-100 px-1 rounded">A</kbd> auto-detect</span>
                <span><kbd className="bg-gray-100 px-1 rounded">S</kbd> guardar</span>
                <span><kbd className="bg-gray-100 px-1 rounded">Del</kbd> borrar caja</span>
                <span><kbd className="bg-gray-100 px-1 rounded">Enter</kbd> aprobar sugerida</span>
                <span><kbd className="bg-gray-100 px-1 rounded">Esc</kbd> deseleccionar</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar 2: clases */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">
              {selectedBoxIdx !== null ? 'Caja seleccionada' : 'Clase activa'}
            </h3>
            <button onClick={() => setShowNewClass(true)}
              title="Crear clase nueva (ej. polo_alianza_local)"
              className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded font-bold hover:bg-indigo-700">
              + Nueva
            </button>
          </div>
          {selectedBoxIdx !== null && boxes[selectedBoxIdx] && (
            <div className="mb-3 p-2 rounded-lg border-2"
              style={{ borderColor: colorFor(boxes[selectedBoxIdx].class), background: `${colorFor(boxes[selectedBoxIdx].class)}11` }}>
              <p className="text-xs font-bold" style={{ color: colorFor(boxes[selectedBoxIdx].class) }}>
                {boxes[selectedBoxIdx].class}
              </p>
              <p className="text-[10px] text-gray-500">Click otra clase para reasignar</p>
            </div>
          )}
          {selectedBoxIdx === null && activeClass && (
            <div className="mb-3 p-2 rounded-lg border-2" style={{ borderColor: colorFor(activeClass), background: `${colorFor(activeClass)}11` }}>
              <p className="text-xs font-bold" style={{ color: colorFor(activeClass) }}>{activeClass}</p>
            </div>
          )}
          <input type="text" value={filterClass} onChange={e => setFilterClass(e.target.value)}
            placeholder="Filtrar..."
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-2" />
          <div className="space-y-1">
            {filteredClasses.map(c => (
              <button key={c} onClick={() => {
                if (selectedBoxIdx !== null) changeClassOfSelected(c)
                else setActiveClass(c)
              }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center gap-2 transition-all ${
                  (selectedBoxIdx !== null ? boxes[selectedBoxIdx]?.class : activeClass) === c
                    ? 'bg-indigo-50 ring-1 ring-indigo-500' : 'hover:bg-gray-50'
                }`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorFor(c) }} />
                <code className="text-[10px] font-bold">{c}</code>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal — Crear nueva clase */}
      {showNewClass && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewClass(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">Crear clase nueva</h3>
            <p className="text-xs text-gray-500 mb-4">
              Util para agregar polos de equipos (ej. <code>polo_alianza_local</code>) o sponsors nuevos sin tocar SQL.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ID (snake_case)</label>
                <input type="text" value={newClassForm.sponsor_id}
                  onChange={e => setNewClassForm({ ...newClassForm, sponsor_id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="polo_alianza_local"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre legible (opcional)</label>
                <input type="text" value={newClassForm.nombre}
                  onChange={e => setNewClassForm({ ...newClassForm, nombre: e.target.value })}
                  placeholder="Polo Alianza Local"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
                <select value={newClassForm.categoria}
                  onChange={e => setNewClassForm({ ...newClassForm, categoria: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                  <option value="jersey">jersey (polo de equipo)</option>
                  <option value="custom">custom</option>
                  <option value="casa_apuestas">casa_apuestas</option>
                  <option value="bebida">bebida</option>
                  <option value="banca">banca</option>
                  <option value="kit_tecnico">kit_tecnico</option>
                  <option value="automotriz">automotriz</option>
                  <option value="telecomunicaciones">telecomunicaciones</option>
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-800">
                💡 Después de crear, etiqueta varios frames con esta clase y re-entrena. Mínimo 30-50 ejemplos por clase.
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNewClass(false)}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createNewClass}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                Crear clase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FrameThumb({ matchId, frame, onClick, selectMode, isSelected, onToggleSelect }: any) {
  const [imgUrl, setImgUrl] = useState('')
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { rootMargin: '100px' },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || imgUrl) return
    authFetch(`${API}/labeling/${matchId}/frame/${frame.second}/token`)
      .then(r => r.json()).then(t => setImgUrl(`${API}/labeling/${matchId}/frame/${frame.second}/image?token=${t.token}`))
      .catch(() => {})
  }, [visible, matchId, frame.second, imgUrl])

  return (
    <button ref={ref} onClick={onClick}
      className={`relative aspect-video rounded overflow-hidden bg-gray-100 transition-all ${
        isSelected ? 'ring-3 ring-indigo-600 scale-95' : 'hover:ring-2 hover:ring-indigo-500'
      }`}>
      {imgUrl && <img src={imgUrl} alt="" loading="lazy" className={`w-full h-full object-cover ${isSelected ? 'opacity-70' : ''}`} />}
      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-mono rounded">
        {frame.second}s
      </div>
      {frame.boxes_count > 0 && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded">
          ✓ {frame.boxes_count}
        </div>
      )}
      {(frame.train_count || 0) > 0 && (
        <div title={`Entrenado ${frame.train_count}x. Ultimo: ${frame.last_trained?.slice(0, 16) || ''}`}
          className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-purple-600 text-white text-[9px] font-bold rounded">
          🚀 {frame.train_count}
        </div>
      )}
      {selectMode && (
        <div className={`absolute bottom-1 left-1 w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm ${
          isSelected ? 'bg-indigo-600 text-white' : 'bg-white/80 text-gray-400'
        }`}>
          {isSelected ? '✓' : '☐'}
        </div>
      )}
    </button>
  )
}
