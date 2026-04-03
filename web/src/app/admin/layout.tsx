'use client'
import AdminSidebar from '@/components/AdminSidebar'
import AuthGuard from '@/components/AuthGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredRole="admin">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-40">
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-400 font-medium">Liga 1 Peru 2025</p>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-xs font-medium text-green-700">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  Sistema activo
                </span>
                <LogoutButton />
              </div>
            </div>
          </header>
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return (
    <button onClick={handleLogout}
      className="text-xs text-gray-400 hover:text-red-600 transition-colors">
      Cerrar sesion
    </button>
  )
}
