'use client'

import { FormEvent, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section className="glass-panel rounded-xl p-6 w-full max-w-sm border border-slate-700/40">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Sign In</h1>
        <p className="text-sm text-slate-400 mb-4">Enter your Quasrr credentials</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs text-slate-300">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-3 py-2 text-sm text-slate-100"
              required
            />
          </label>

          <label className="block text-xs text-slate-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-3 py-2 text-sm text-slate-100"
              required
            />
          </label>

          {error && <div className="text-xs text-rose-300">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-cyan-500/90 hover:bg-cyan-400 disabled:bg-slate-700/70 disabled:cursor-not-allowed text-white rounded py-2 text-sm font-medium"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
