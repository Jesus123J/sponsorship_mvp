/**
 * Manejo de autenticacion — login, logout, sesion
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export interface User {
  id: number
  email: string
  nombre: string
  rol: 'admin' | 'client'
  sponsor_id: string | null
  suscripcion: any | null
}

export async function loginUser(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de conexion' }))
    throw new Error(err.detail || 'Error al iniciar sesion')
  }
  const user = await res.json()
  saveSession(user)
  return user
}

export function saveSession(user: User) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user))
  }
}

export function getSession(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
}

export function isAdmin(user: User | null): boolean {
  return user?.rol === 'admin'
}

export function isClient(user: User | null): boolean {
  return user?.rol === 'client'
}
