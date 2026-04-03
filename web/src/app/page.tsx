'use client'
import Link from 'next/link'
import { useState } from 'react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ===================== NAVBAR ===================== */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-gray-100 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">SM</span>
            </div>
            <span className="font-bold text-gray-900">SponsorMetrics</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#como-funciona" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Como funciona</a>
            <a href="#beneficios" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Beneficios</a>
            <a href="#planes" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Planes</a>
            <a href="#contacto" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Contacto</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Iniciar sesion
            </Link>
            <Link href="/plans"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              Ver planes
            </Link>
          </div>
        </div>
      </nav>

      {/* ===================== HERO ===================== */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-indigo-50 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 bg-indigo-500 rounded-full" />
              <span className="text-indigo-700 text-xs font-medium">Liga 1 Peru 2025 — Sistema activo</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Mide el valor real de cada{' '}
              <span className="text-indigo-600">segundo de exposicion</span>{' '}
              de tu marca
            </h1>
            <p className="text-xl text-gray-500 mt-6 leading-relaxed max-w-2xl">
              Analizamos cada frame de la transmision televisiva con inteligencia artificial
              para calcular exactamente cuanto vale tu sponsorship deportivo en la Liga 1 peruana.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <Link href="/plans"
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/25">
                Solicitar demo
              </Link>
              <a href="#como-funciona"
                className="px-6 py-3 text-gray-700 font-semibold rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                Como funciona
              </a>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-10 border-t border-gray-100">
            <Stat value="1 fps" label="Analisis frame a frame" />
            <Stat value="+27" label="Sponsors monitoreados" />
            <Stat value="6" label="Dimensiones de calidad" />
            <Stat value="S/." label="SMV en soles peruanos" />
          </div>
        </div>
      </section>

      {/* ===================== CLIENTES ===================== */}
      <section className="py-16 bg-gray-50 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-400 font-medium uppercase tracking-wider mb-8">Disenado para todos los actores del ecosistema</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { title: 'Liga / L1MAX', desc: 'Valor total de la transmision' },
              { title: 'Sponsors', desc: 'ROI de su inversion' },
              { title: 'Clubes', desc: 'Argumento para renovar contratos' },
              { title: 'Agencias', desc: 'Inventario completo por posicion' },
            ].map(c => (
              <div key={c.title} className="text-center">
                <p className="font-semibold text-gray-900">{c.title}</p>
                <p className="text-sm text-gray-500 mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== COMO FUNCIONA ===================== */}
      <section id="como-funciona" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Como funciona</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              Desde el video de la transmision hasta el valor en soles, todo automatizado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Video', desc: 'Procesamos la transmision completa del partido a 1 frame por segundo (~5,400 frames por partido).', color: 'bg-blue-50 text-blue-600 border-blue-100' },
              { step: '02', title: 'Deteccion IA', desc: 'Nuestro modelo YOLOv8 detecta cada logo de sponsor, su posicion (camiseta, valla, overlay) y el equipo.', color: 'bg-purple-50 text-purple-600 border-purple-100' },
              { step: '03', title: 'Quality Index', desc: '6 dimensiones de calidad: tamano, claridad, posicion en pantalla, momento, exclusividad y duracion.', color: 'bg-amber-50 text-amber-600 border-amber-100' },
              { step: '04', title: 'SMV en soles', desc: 'Formula de la industria: audiencia x CPM x calidad = valor monetario real de cada aparicion.', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
            ].map(s => (
              <div key={s.step} className="relative">
                <div className={`w-12 h-12 rounded-2xl ${s.color} border flex items-center justify-center font-bold text-sm mb-4`}>
                  {s.step}
                </div>
                <h3 className="font-semibold text-gray-900 text-lg">{s.title}</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== BENEFICIOS ===================== */}
      <section id="beneficios" className="py-20 bg-gray-50 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Por que elegirnos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'Trazabilidad total', desc: 'Cada numero del dashboard es clickeable. Puedes ver el arbol completo de como se calculo cada valor, hasta el frame exacto.', icon: '🔍' },
              { title: 'Datos reales, no estimaciones', desc: 'No usamos muestreo ni estimaciones. Analizamos el 100% de los frames del partido con deteccion automatica.', icon: '📊' },
              { title: 'Broadcast + Audio', desc: 'Medimos la exposicion visual del logo y las menciones del narrador. El valor completo de tu sponsorship.', icon: '🎙' },
              { title: 'Reportes PDF exportables', desc: 'Genera reportes profesionales con un click para presentar a tu directorio, clientes o sponsors.', icon: '📄' },
              { title: 'Metodologia estandar', desc: 'Usamos la formula SMV aceptada por la industria con CPM por posicion, audiencia IBOPE y multiplicadores por contexto.', icon: '✓' },
              { title: 'Dashboard en tiempo real', desc: 'Accede desde cualquier dispositivo. Los datos se actualizan automaticamente cuando se procesa un nuevo partido.', icon: '⚡' },
            ].map(b => (
              <div key={b.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <span className="text-2xl">{b.icon}</span>
                <h3 className="font-semibold text-gray-900 mt-3">{b.title}</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FORMULA ===================== */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">La formula detras del valor</h2>
          <p className="text-gray-500 mb-10">Sponsor Media Value — Formula estandar de la industria</p>

          <div className="bg-slate-900 rounded-2xl p-8 text-left">
            <code className="text-indigo-300 text-sm block mb-4">
              SMV por segundo = (1/30) x (Audiencia / 1,000) x CPM_posicion x QI_Score x Multiplicador_Contexto
            </code>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                { label: 'Audiencia', range: '500K — 1.5M' },
                { label: 'CPM posicion', range: 'S/. 22 — 38' },
                { label: 'QI Score', range: '0.30 — 1.50' },
                { label: 'Multiplicador', range: '0.60 — 1.10' },
              ].map(v => (
                <div key={v.label} className="bg-white/5 rounded-xl p-3">
                  <p className="text-xs text-slate-400">{v.label}</p>
                  <p className="text-sm text-white font-medium mt-1">{v.range}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== PLANES PREVIEW ===================== */}
      <section id="planes" className="py-20 bg-gray-50 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Planes</h2>
          <p className="text-gray-500 mb-12 max-w-xl mx-auto">
            Desde sponsors individuales hasta ligas completas. Elige el plan que se adapte a tu necesidad.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <PlanPreview name="Starter" price="S/. 2,500" desc="1 marca, 2 partidos/mes" />
            <PlanPreview name="Professional" price="S/. 6,500" desc="3 marcas, todos los partidos" popular />
            <PlanPreview name="Enterprise" price="Contactar" desc="Marcas ilimitadas + API + white-label" />
          </div>

          <Link href="/plans"
            className="inline-flex items-center gap-2 mt-10 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
            Ver detalle de planes
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section id="contacto" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Listo para medir tu sponsorship?
            </h2>
            <p className="text-indigo-200 mb-8 max-w-lg mx-auto">
              Solicita una demo y te mostramos los datos reales de un partido de la Liga 1 con tu marca.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/plans"
                className="px-6 py-3 bg-white text-indigo-700 font-semibold rounded-xl hover:bg-indigo-50 transition-colors">
                Solicitar demo
              </Link>
              <Link href="/login"
                className="px-6 py-3 text-white font-semibold rounded-xl border border-white/30 hover:bg-white/10 transition-colors">
                Ya tengo cuenta
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">SM</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">SponsorMetrics</span>
          </div>
          <p className="text-xs text-gray-400">Confidencial — Liga 1 Peru 2025 — v3.0</p>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs text-gray-500 hover:text-gray-700">Portal sponsor</Link>
            <Link href="/plans" className="text-xs text-gray-500 hover:text-gray-700">Planes</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
}

function PlanPreview({ name, price, desc, popular }: { name: string; price: string; desc: string; popular?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border-2 p-6 text-left ${popular ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-gray-100'}`}>
      {popular && <span className="text-xs font-bold text-indigo-600 uppercase">Mas popular</span>}
      <h3 className="font-bold text-gray-900 text-lg mt-1">{name}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-2">{price}<span className="text-sm text-gray-400 font-normal">{price !== 'Contactar' ? '/mes' : ''}</span></p>
      <p className="text-sm text-gray-500 mt-2">{desc}</p>
    </div>
  )
}
