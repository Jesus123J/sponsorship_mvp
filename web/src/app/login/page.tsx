'use client'
import { useState } from 'react'
import { loginUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const user = await loginUser(email, password)
      if (user.rol === 'admin') {
        router.push('/admin')
      } else {
        router.push('/client')
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="text-white font-bold">SM</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mt-4">Iniciar sesion</h1>
          <p className="text-sm text-slate-400 mt-2">Accede a tu dashboard de sponsorship</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Tu password"
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p className="text-center text-xs text-gray-400 mt-4">
            No tienes cuenta?{' '}
            <Link href="/plans" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Ver planes
            </Link>
          </p>
        </form>

        {/* Demo credentials */}
        <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 font-medium mb-2">Cuentas de prueba:</p>
          <div className="space-y-1.5 text-xs text-slate-500">
            <p><span className="text-slate-300">Admin:</span> admin@sponsorshipmvp.pe / demo2025</p>
            <p><span className="text-slate-300">Cliente:</span> cliente@apuestatotal.pe / demo2025</p>
          </div>
        </div>
      </div>
    </div>
  )
}
