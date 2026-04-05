'use client'
import { useEffect, useState, useRef } from 'react'
import { getToken } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

interface ProcessInfo {
  key: string
  label: string
  icon: string
  running: boolean
  progress: string
  percent?: number
  error?: string | null
  finished_at?: string | null
  match_id?: string
  download_url?: string | null
}

const ENDPOINTS = [
  { key: 'youtube', label: 'Descarga YouTube', icon: '📥', endpoint: '/training/download-youtube/status' },
  { key: 'extract', label: 'Extraccion frames', icon: '🎞️', endpoint: '/training/extract-frames/status' },
  { key: 'zip', label: 'Preparando ZIP', icon: '📦', endpoint: '/training/zip/status' },
  { key: 'training', label: 'Entrenamiento YOLO', icon: '🧠', endpoint: '/training/train/status' },
  { key: 'pipeline', label: 'Pipeline deteccion', icon: '⚡', endpoint: '/training/pipeline/status' },
]

export default function ProcessMonitor() {
  // useRef para el estado estable — no causa re-renders entre polls
  const stableProcesses = useRef<Record<string, ProcessInfo>>({})
  const [display, setDisplay] = useState<ProcessInfo[]>([])
  const [minimized, setMinimized] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [show, setShow] = useState(false)
  const pollRef = useRef<any>(null)

  useEffect(() => {
    const poll = async () => {
      const token = getToken()
      if (!token) return

      const headers: any = { 'Authorization': `Bearer ${token}` }

      for (const ep of ENDPOINTS) {
        try {
          const res = await fetch(`${API}${ep.endpoint}`, { headers })
          if (!res.ok) continue
          const data = await res.json()

          const prev = stableProcesses.current[ep.key]

          if (data.running) {
            stableProcesses.current[ep.key] = {
              key: ep.key, label: ep.label, icon: ep.icon,
              running: true,
              progress: data.progress || 'Procesando...',
              percent: data.percent,
              error: null, finished_at: null,
              match_id: data.match_id,
              download_url: data.download_url,
            }
          } else if (data.error) {
            stableProcesses.current[ep.key] = {
              key: ep.key, label: ep.label, icon: ep.icon,
              running: false,
              progress: data.progress || '',
              percent: data.percent,
              error: data.error,
              finished_at: data.finished_at,
              match_id: data.match_id,
              download_url: data.download_url,
            }
          } else if (data.finished_at || (data.progress && data.progress.length > 0)) {
            stableProcesses.current[ep.key] = {
              key: ep.key, label: ep.label, icon: ep.icon,
              running: false,
              progress: data.progress || 'Completado',
              percent: 100,
              error: null,
              finished_at: data.finished_at || 'done',
              match_id: data.match_id,
              download_url: data.download_url,
            }
          } else if (prev) {
            // Backend vacío — mantener estado anterior
          }
        } catch {
          // No borrar datos existentes si falla la peticion
        }
      }

      // Crear lista de display desde el ref estable
      const list = Object.values(stableProcesses.current).filter(
        p => p.running || p.error || (p.finished_at && !dismissed.includes(p.key))
      )

      if (list.length > 0) setShow(true)
      setDisplay(list)
    }

    poll()
    pollRef.current = setInterval(poll, 3000)

    // Re-poll inmediato al volver a la pestaña
    const onVisible = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', poll)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', poll)
    }
  }, [dismissed])

  const activeCount = display.filter(p => p.running).length

  const dismiss = (key: string) => {
    setDismissed(prev => [...prev, key])
    delete stableProcesses.current[key]
  }

  // No mostrar nada si nunca hubo procesos
  if (!show) return null

  return (
    <div className="fixed bottom-6 right-6 z-50" style={{ maxWidth: '400px' }}>
      {/* Boton flotante — SIEMPRE visible */}
      <button
        onClick={() => setMinimized(!minimized)}
        className={`ml-auto mb-2 flex items-center gap-2 px-4 py-2 rounded-full shadow-2xl transition-all text-sm font-medium ${
          activeCount > 0
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
        }`}
      >
        {activeCount > 0 && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
        )}
        {activeCount > 0
          ? `${activeCount} proceso${activeCount > 1 ? 's' : ''} activo${activeCount > 1 ? 's' : ''}`
          : display.length > 0 ? 'Procesos finalizados' : 'Monitor'
        }
        <svg className={`w-4 h-4 transition-transform ${minimized ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel de procesos */}
      {!minimized && display.length > 0 && (
        <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          {display.map(proc => (
            <div key={proc.key} className="px-4 py-3 border-b border-slate-700/50 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{proc.icon}</span>
                  <span className="text-white text-sm font-medium">{proc.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {proc.running && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
                  {!proc.running && (
                    <button onClick={() => dismiss(proc.key)} className="text-gray-500 hover:text-gray-300 text-xs">
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {proc.running && proc.percent !== undefined && (
                <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1.5">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(proc.percent, 100)}%` }}
                  />
                </div>
              )}

              {/* Status text */}
              <p className={`text-xs truncate ${
                proc.error ? 'text-red-400' :
                proc.running ? 'text-blue-300' :
                'text-emerald-400'
              }`}>
                {proc.error ? `Error: ${proc.error}` : proc.progress}
              </p>

              {proc.match_id && (
                <p className="text-xs text-gray-500 mt-0.5">{proc.match_id}</p>
              )}

              {/* Boton de descarga para ZIP completado */}
              {proc.key === 'zip' && !proc.running && !proc.error && proc.download_url && (
                <button
                  onClick={async () => {
                    try {
                      const token = getToken()
                      const url = `${API}${proc.download_url!.replace('/api', '')}`
                      const res = await fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
                      if (!res.ok) throw new Error('Error al descargar')
                      const blob = await res.blob()
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = proc.download_url!.split('file=')[1] || 'frames.zip'
                      a.click()
                      URL.revokeObjectURL(a.href)
                      dismiss(proc.key)
                    } catch { }
                  }}
                  className="mt-2 w-full px-3 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar ZIP
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
