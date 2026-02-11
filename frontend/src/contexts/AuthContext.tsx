'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getBackendUrl } from '@/utils/backend'

type AuthContextValue = {
  token: string | null
  isAuthenticated: boolean
  isHydrated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  updateCredentials: (payload: {
    current_username: string
    current_password: string
    new_username: string
    new_password: string
  }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const TOKEN_KEY = 'quasrr_auth_token'
const LOGOUT_EVENT = 'quasrr:auth-logout'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY))
    } finally {
      setIsHydrated(true)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) {
        setToken(event.newValue)
      }
    }

    const onForcedLogout = () => {
      logout()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(LOGOUT_EVENT, onForcedLogout)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LOGOUT_EVENT, onForcedLogout)
    }
  }, [logout])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const backendOrigin = getBackendUrl()

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = request.url
      const isBackend = backendOrigin && url.startsWith(backendOrigin)
      const isLoginEndpoint = url.startsWith(`${backendOrigin}/api/auth/login`)

      let finalRequest = request
      if (isBackend && !isLoginEndpoint) {
        const currentToken = localStorage.getItem(TOKEN_KEY)
        if (currentToken) {
          const headers = new Headers(request.headers)
          headers.set('Authorization', `Bearer ${currentToken}`)
          finalRequest = new Request(request, { headers })
        }
      }

      const response = await originalFetch(finalRequest)

      if (isBackend && !isLoginEndpoint && response.status === 401) {
        window.dispatchEvent(new Event(LOGOUT_EVENT))
      }

      return response
    }) as typeof window.fetch

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const backendUrl = getBackendUrl()
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.detail || 'Login failed')
    }

    const data = await response.json()
    const nextToken = data.access_token as string | undefined
    if (!nextToken) {
      throw new Error('Invalid auth response')
    }

    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
  }, [])

  const updateCredentials = useCallback(async (payload: {
    current_username: string
    current_password: string
    new_username: string
    new_password: string
  }) => {
    const backendUrl = getBackendUrl()
    const response = await fetch(`${backendUrl}/api/auth/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.detail || 'Credential update failed')
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    token,
    isAuthenticated: Boolean(token),
    isHydrated,
    login,
    logout,
    updateCredentials,
  }), [token, isHydrated, login, logout, updateCredentials])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isHydrated, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isHydrated) return

    const isPublic = pathname === '/login'
    if (!isAuthenticated && !isPublic) {
      router.replace('/login')
      return
    }

    if (isAuthenticated && pathname === '/login') {
      router.replace('/')
    }
  }, [isHydrated, isAuthenticated, pathname, router])

  if (!isHydrated) {
    return null
  }

  if (!isAuthenticated && pathname !== '/login') {
    return null
  }

  if (isAuthenticated && pathname === '/login') {
    return null
  }

  return <>{children}</>
}
