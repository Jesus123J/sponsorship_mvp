/**
 * Manejo de autenticacion — login, logout, sesion, JWT
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
  const data = await res.json()

  // Guardar token y usuario por separado
  saveToken(data.access_token)
  saveSession(data.user)
  return data.user
}

export function saveToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token)
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
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
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
}

export function isAdmin(user: User | null): boolean {
  return user?.rol === 'admin'
}

export function isClient(user: User | null): boolean {
  return user?.rol === 'client'
}
