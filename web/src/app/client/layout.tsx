'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { getSession, logout } from '@/lib/auth'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const user = getSession()

  return (
    <AuthGuard requiredRole="client">
      <div className="min-h-screen bg-gray-50">
        {/* Client Navbar */}
        <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xs">SM</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 text-sm block leading-tight">SponsorMetrics</span>
                    <span className="text-[10px] text-gray-400 leading-tight">Portal del Sponsor</span>
                  </div>
                </Link>

                <div className="hidden sm:flex items-center gap-1 ml-4">
                  <NavLink href="/client" label="Dashboard" active={pathname === '/client'} />
                  <NavLink href="/client/reports" label="Reportes" active={pathname === '/client/reports'} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link href="/plans"
                  className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                  Mejorar plan
                </Link>

                {/* User menu */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-medium text-gray-900">{user?.nombre || 'Cliente'}</p>
                    <p className="text-[10px] text-gray-400">{user?.email}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">
                      {user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'C'}
                    </span>
                  </div>
                  <button onClick={logout}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors ml-1">
                    Salir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
      }`}>
      {label}
    </Link>
  )
}
