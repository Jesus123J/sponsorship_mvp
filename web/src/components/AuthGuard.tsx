'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, User } from '@/lib/auth'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole: 'admin' | 'client'
}

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const session = getSession()

    if (!session) {
      router.replace('/login')
      return
    }

    if (requiredRole === 'admin' && session.rol !== 'admin') {
      router.replace('/client')
      return
    }

    if (requiredRole === 'client' && session.rol !== 'client' && session.rol !== 'admin') {
      router.replace('/login')
      return
    }

    setUser(session)
    setChecking(false)
  }, [requiredRole, router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Verificando sesion...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
