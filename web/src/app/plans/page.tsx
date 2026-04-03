'use client'
import Link from 'next/link'
import { useState } from 'react'

const plans = [
  {
    name: 'Starter',
    description: 'Para sponsors que quieren empezar a medir',
    price: 'S/. 2,500',
    period: '/mes',
    color: 'border-gray-200',
    buttonColor: 'bg-gray-900 hover:bg-gray-800 text-white',
    features: [
      'Dashboard basico de SMV',
      '1 marca monitoreada',
      'Hasta 2 partidos/mes',
      'Reporte PDF mensual',
      'Soporte por email',
    ],
    notIncluded: [
      'Menciones de audio',
      'Social media tracking',
      'API de datos',
    ],
  },
  {
    name: 'Professional',
    description: 'Para sponsors con multiples presencias',
    price: 'S/. 6,500',
    period: '/mes',
    popular: true,
    color: 'border-indigo-500 ring-2 ring-indigo-500/20',
    buttonColor: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    features: [
      'Dashboard completo de SMV',
      'Hasta 3 marcas monitoreadas',
      'Todos los partidos de la temporada',
      'Reportes PDF ilimitados',
      'Menciones de audio incluidas',
      'Desglose por posicion y contexto',
      'Trazabilidad completa',
      'Soporte prioritario',
    ],
    notIncluded: [
      'API de datos',
    ],
  },
  {
    name: 'Enterprise',
    description: 'Para ligas, clubes y agencias de medios',
    price: 'Contactar',
    period: '',
    color: 'border-gray-200',
    buttonColor: 'bg-gray-900 hover:bg-gray-800 text-white',
    features: [
      'Todo lo de Professional',
      'Marcas ilimitadas',
      'Social media tracking',
      'API de datos en tiempo real',
      'Dashboard white-label personalizable',
      'Integracion con sistemas internos',
      'Account manager dedicado',
      'SLA garantizado',
      'Entrenamiento del equipo',
    ],
    notIncluded: [],
  },
]

export default function PlansPage() {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950">
      {/* Header */}
      <nav className="px-6 py-4 flex justify-between items-center max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="font-bold text-white text-lg">Sponsorship MVP</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">Mi Dashboard</Link>
          <Link href="/" className="px-4 py-2 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
            Volver
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Planes de Medicion de Sponsorship
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Elige el plan que mejor se adapte a tu necesidad. Todos incluyen acceso al dashboard
            con datos reales de video de la Liga 1 peruana.
          </p>

          {/* Toggle annual/monthly */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm ${!annual ? 'text-white' : 'text-slate-500'}`}>Mensual</span>
            <button onClick={() => setAnnual(!annual)}
              className={`w-12 h-6 rounded-full transition-colors relative ${annual ? 'bg-indigo-600' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-sm ${annual ? 'text-white' : 'text-slate-500'}`}>
              Anual
              <span className="ml-1 text-xs text-emerald-400 font-medium">-20%</span>
            </span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map(plan => (
            <div key={plan.name}
              className={`relative bg-white rounded-2xl border-2 ${plan.color} p-6 flex flex-col card-hover ${plan.popular ? 'scale-105' : ''}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full shadow-lg shadow-indigo-500/30">
                    Mas popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-gray-900">
                  {plan.price === 'Contactar' ? plan.price : (annual ? `S/. ${(parseInt(plan.price.replace(/[^\d]/g, '')) * 10).toLocaleString()}` : plan.price)}
                </span>
                {plan.period && (
                  <span className="text-gray-500 text-sm">{annual ? '/ano' : plan.period}</span>
                )}
              </div>

              <button className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors mb-6 ${plan.buttonColor}`}>
                {plan.price === 'Contactar' ? 'Contactar ventas' : 'Comenzar ahora'}
              </button>

              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Incluye:</p>
                <ul className="space-y-2.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.notIncluded.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-5">No incluido:</p>
                    <ul className="space-y-2.5">
                      {plan.notIncluded.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                          <svg className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Preguntas frecuentes</h2>
          <div className="space-y-4">
            <FAQ
              question="Como se mide el sponsorship?"
              answer="Analizamos cada segundo de la transmision televisiva usando IA (YOLOv8) para detectar logos de sponsors. Cada deteccion se clasifica por posicion (camiseta, valla LED, overlay, etc.), contexto (juego vivo, replay, gol) y equipo. Luego calculamos el SMV usando la formula estandar de la industria."
            />
            <FAQ
              question="Que tan preciso es el sistema?"
              answer="Nuestro modelo de IA tiene un mAP superior al 70% y cada deteccion pasa por un proceso de Quality Assurance. Los resultados son trazables frame por frame."
            />
            <FAQ
              question="Puedo exportar los datos?"
              answer="Si. Todos los planes incluyen exportacion en PDF. El plan Enterprise ademas ofrece acceso a una API de datos para integracion con tus sistemas."
            />
            <FAQ
              question="Incluye social media?"
              answer="El tracking de social media (Instagram de clubes y liga) esta disponible en el plan Enterprise. Mide la exposicion adicional de sponsors en publicaciones del club."
            />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-slate-400 mb-4">Tienes preguntas? Contactanos directamente.</p>
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">
            Hablar con ventas
          </button>
        </div>
      </div>
    </div>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between text-left">
        <span className="text-sm font-medium text-white">{question}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-slate-400 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}
