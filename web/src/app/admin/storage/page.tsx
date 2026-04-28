'use client'
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: any = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

export default function StoragePage() {
  const [tab, setTab] = useState<'models' | 'videos' | 'annotated' | 'browse'>('browse')
  const [status, setStatus] = useState<any>(null)
  const [models, setModels] = useState<any[]>([])
  const [videos, setVideos] = useState<any[]>([])
  const [annotated, setAnnotated] = useState<any[]>([])
  const [allObjects, setAllObjects] = useState<any[]>([])
  const [localVideos, setLocalVideos] = useState<any[]>([])
  const [working, setWorking] = useState<string>('')
  const [versionInput, setVersionInput] = useState('')

  const reload = () => {
    authFetch(`${API}/storage/status`).then(r => r.json()).then(setStatus).catch(() => {})
    authFetch(`${API}/storage/models`).then(r => r.ok ? r.json() : []).then(setModels).catch(() => {})
    authFetch(`${API}/storage/videos`).then(r => r.ok ? r.json() : []).then(setVideos).catch(() => {})
    authFetch(`${API}/storage/annotated`).then(r => r.ok ? r.json() : []).then(setAnnotated).catch(() => {})
    authFetch(`${API}/storage/browse`).then(r => r.ok ? r.json() : []).then(setAllObjects).catch(() => {})
    authFetch(`${API}/training/videos`).then(r => r.json()).then(setLocalVideos).catch(() => {})
  }

  useEffect(() => { reload() }, [])

  const uploadCurrentModel = async () => {
    const v = versionInput || prompt('Versión (ej. v1.0, v1.1) — vacío = auto:')
    if (v === null) return
    setWorking('upload-model')
    try {
      const res = await authFetch(`${API}/storage/models/upload`, {
        method: 'POST',
        body: JSON.stringify({ version: v || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ Modelo subido: ${data.key} (${data.size_mb} MB)`)
      setVersionInput('')
      reload()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const useModel = async (key: string) => {
    const version = key.split('/')[1]
    if (!confirm(`Usar el modelo ${version} como activo? Esto sobrescribe el best.pt local.`)) return
    setWorking(key)
    try {
      const res = await authFetch(`${API}/storage/models/${version}/use`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ Modelo ${version} activado. Re-analiza videos para ver el cambio.`)
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const deleteModel = async (key: string) => {
    const version = key.split('/')[1]
    if (!confirm(`Eliminar modelo ${version} de R2 permanentemente?`)) return
    setWorking(key)
    try {
      await authFetch(`${API}/storage/models/${version}`, { method: 'DELETE' })
      reload()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const uploadVideo = async (matchId: string) => {
    setWorking(`vid-${matchId}`)
    try {
      const res = await authFetch(`${API}/storage/videos/${matchId}/upload`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ Video subido: ${data.size_mb} MB`)
      reload()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const uploadAnnotated = async (matchId: string) => {
    setWorking(`ann-${matchId}`)
    try {
      const res = await authFetch(`${API}/storage/annotated/${matchId}/upload`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      alert(`✅ Video anotado subido: ${data.size_mb} MB`)
      reload()
    } catch (e: any) { alert(e.message) }
    setWorking('')
  }

  const getDownloadUrl = async (key: string) => {
    try {
      const res = await authFetch(`${API}/storage/url?key=${encodeURIComponent(key)}&expires=3600`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      window.open(data.url, '_blank')
    } catch (e: any) { alert(e.message) }
  }

  if (!status) {
    return <div className="p-6 text-gray-500">Cargando...</div>
  }

  if (!status.configured) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cloud Storage</h1>
          <p className="text-gray-500 mt-1">Cloudflare R2 — modelos y videos en cloud</p>
        </div>

        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
          <h2 className="font-semibold text-amber-900 mb-2">⚠ Cloudflare R2 no esta configurado</h2>
          <p className="text-sm text-amber-800 mb-4">
            Para usar esta funcion, agrega estas variables al archivo <code className="bg-amber-100 px-1 rounded">.env</code> del backend:
          </p>
          <pre className="bg-slate-900 text-slate-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
{`R2_ACCESS_KEY_ID=tu_access_key
R2_SECRET_ACCESS_KEY=tu_secret_key
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=sponsorship-mvp`}
          </pre>
          <p className="text-xs text-amber-700 mt-3">
            Después: <code>docker-compose restart api</code>
          </p>
        </div>
      </div>
    )
  }

  if (status.error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Cloud Storage</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">❌ Error: {status.error}</p>
        </div>
      </div>
    )
  }

  const fmt = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
  const ago = (iso: string) => {
    const d = new Date(iso); const diff = Date.now() - d.getTime()
    if (diff < 60000) return 'hace seg'
    if (diff < 3600000) return `hace ${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString('es-PE')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cloud Storage</h1>
        <p className="text-gray-500 mt-1">
          Cloudflare R2 — bucket <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{status.bucket}</code> ✅
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([
          { k: 'browse', label: '🗂 Todo el bucket', count: allObjects.length },
          { k: 'models', label: '🧠 Modelos', count: models.length },
          { k: 'videos', label: '🎬 Videos', count: videos.length },
          { k: 'annotated', label: '🎯 Anotados', count: annotated.length },
        ] as const).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">{t.count}</span>
          </button>
        ))}
      </div>

      {/* BROWSE — todo el bucket */}
      {tab === 'browse' && (
        <div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-slate-900">🗂 Vista completa del bucket</p>
            <p className="text-xs text-slate-600 mt-1">
              Lista TODO lo que hay en R2, sin importar la carpeta. Útil si subiste videos con paths personalizados.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Archivo / Path</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subido</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acción</th>
                </tr>
              </thead>
              <tbody>
                {allObjects.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">El bucket está vacío.</td></tr>
                )}
                {allObjects.map((obj) => {
                  const isVideo = obj.key.toLowerCase().endsWith('.mp4')
                  const isModel = obj.key.endsWith('.pt')
                  const icon = isVideo ? '🎬' : isModel ? '🧠' : '📄'
                  return (
                    <tr key={obj.key} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="mr-2">{icon}</span>
                        <code className="text-xs">{obj.key}</code>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(obj.size_mb)}</td>
                      <td className="px-4 py-3 text-gray-500">{ago(obj.last_modified)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => getDownloadUrl(obj.key)}
                          className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200">
                          🔗 URL
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {allObjects.length > 0 && (
            <p className="text-xs text-gray-500 mt-3 text-center">
              Total: {allObjects.length} objetos · {fmt(allObjects.reduce((a, b) => a + b.size_mb, 0))}
            </p>
          )}
        </div>
      )}

      {/* MODELS */}
      {tab === 'models' && (
        <div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-semibold text-indigo-900">☁ Subir el best.pt actual a R2</p>
              <p className="text-xs text-indigo-700 mt-0.5">Backup del modelo entrenado actual con metadata (mAP, precision, etc.)</p>
            </div>
            <input type="text" value={versionInput} onChange={e => setVersionInput(e.target.value)}
              placeholder="v1.0 (opcional, auto si vacio)"
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs w-48" />
            <button onClick={uploadCurrentModel} disabled={working === 'upload-model'}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {working === 'upload-model' ? 'Subiendo...' : '☁ Subir best.pt'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Versión</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subido</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">
                    Sin modelos en R2. Sube el primero con el boton de arriba.
                  </td></tr>
                )}
                {models.map((m) => {
                  const version = m.key.split('/')[1] || '?'
                  return (
                    <tr key={m.key} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3"><code className="font-bold text-indigo-700">{version}</code></td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(m.size_mb)}</td>
                      <td className="px-4 py-3 text-gray-500">{ago(m.last_modified)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-center">
                          <button onClick={() => useModel(m.key)} disabled={working === m.key}
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-50">
                            ⬇ Activar
                          </button>
                          <button onClick={() => getDownloadUrl(m.key)}
                            className="px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded text-[10px] font-medium hover:bg-gray-50">
                            🔗 URL
                          </button>
                          <button onClick={() => deleteModel(m.key)} disabled={working === m.key}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-[10px] font-medium hover:bg-red-200 disabled:opacity-50">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIDEOS */}
      {tab === 'videos' && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-blue-900">🎬 Videos originales en R2</p>
            <p className="text-xs text-blue-700 mt-1">Backup de tus MP4 en cloud para no perderlos si el VPS se reformatea.</p>
          </div>

          {/* Subir desde local */}
          {localVideos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Videos en VPS (subir a R2)</p>
              <div className="flex flex-wrap gap-2">
                {localVideos.map((v: any) => {
                  const alreadyInR2 = videos.some(rv => rv.key === `videos/${v.match_id}.mp4`)
                  return (
                    <button key={v.filename} onClick={() => uploadVideo(v.match_id)}
                      disabled={alreadyInR2 || working === `vid-${v.match_id}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        alreadyInR2 ? 'bg-emerald-100 text-emerald-700 cursor-default' :
                        working === `vid-${v.match_id}` ? 'bg-gray-100 text-gray-400' :
                        'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}>
                      {alreadyInR2 ? '✓' : '☁'} {v.match_id} ({v.size_mb} MB)
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Archivo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subido</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {videos.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">Sin videos en R2 todavia.</td></tr>
                )}
                {videos.map(v => (
                  <tr key={v.key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3"><code className="text-xs">{v.key.replace('videos/', '')}</code></td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(v.size_mb)}</td>
                    <td className="px-4 py-3 text-gray-500">{ago(v.last_modified)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => getDownloadUrl(v.key)}
                        className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200">
                        🔗 URL temporal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ANNOTATED */}
      {tab === 'annotated' && (
        <div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-purple-900">🎯 Videos con bounding boxes</p>
            <p className="text-xs text-purple-700 mt-1">
              Los videos resultado de "Analizar video" — perfectos para compartir con clientes via URL.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Match</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subido</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">URL pública</th>
                </tr>
              </thead>
              <tbody>
                {annotated.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">Sin videos anotados en R2 todavia.</td></tr>
                )}
                {annotated.map(v => (
                  <tr key={v.key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3"><code className="text-xs">{v.key.replace('annotated/', '').replace('_annotated.mp4', '')}</code></td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(v.size_mb)}</td>
                    <td className="px-4 py-3 text-gray-500">{ago(v.last_modified)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => getDownloadUrl(v.key)}
                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200">
                        🔗 Obtener URL (1h)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
