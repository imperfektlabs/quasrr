/**
 * AI Intent Search hook
 * Handles AI-powered search intent parsing with fallback availability
 */

import { useEffect, useState } from 'react'
import type { AIIntentPlan } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type AiIntentSearchResult = {
  plan: AIIntentPlan | null
  busy: boolean
  error: string | null
  enabled: boolean
  setEnabled: (e: boolean) => void
  execute: (query: string) => Promise<void>
  clear: () => void
}

/**
 * Execute AI-powered intent parsing for search queries
 * @param aiEnabled - Whether AI features are configured (from config)
 */
export function useAiIntentSearch(aiEnabled: boolean): AiIntentSearchResult {
  const [plan, setPlan] = useState<AIIntentPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)

  // Load AI intent preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ai_intent_enabled')
    if (stored !== null) {
      setEnabled(stored === 'true')
    }
  }, [])

  // Save preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem('ai_intent_enabled', enabled.toString())
  }, [enabled])

  const execute = async (query: string) => {
    console.log('[useAiIntentSearch.execute] Called with:', { query, aiEnabled, enabled })

    if (!aiEnabled || !enabled) {
      console.log('[useAiIntentSearch.execute] AI not enabled, clearing plan')
      setPlan(null)
      return
    }

    setBusy(true)
    setError(null)

    try {
      const backendUrl = getBackendUrl()
      console.log('[useAiIntentSearch.execute] Calling API:', `${backendUrl}/ai/intent`)
      const res = await fetch(`${backendUrl}/ai/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) {
        console.log('[useAiIntentSearch.execute] API failed, trying fallback')
        // Fallback: Try to get availability data instead
        try {
          const fallbackRes = await fetch(
            `${backendUrl}/availability?query=${encodeURIComponent(query)}`
          )

          if (fallbackRes.ok) {
            const availData = await fallbackRes.json()
            const fallbackPlan: AIIntentPlan = {
              query,
              intent: {
                media_type: 'unknown' as const,
                title: query,
                action: 'search' as const,
              },
              availability: availData.availability || null,
            }
            console.log('[useAiIntentSearch.execute] Fallback succeeded, setting plan:', fallbackPlan)
            setPlan(fallbackPlan)
            return
          }
        } catch (fallbackErr) {
          console.log('[useAiIntentSearch.execute] Fallback failed:', fallbackErr)
          // Ignore fallback errors
        }

        const errorData = await res.json()
        console.log('[useAiIntentSearch.execute] Error data:', errorData)
        setError(errorData.detail || 'AI intent parsing failed')
        setPlan(null)
        return
      }

      const intentData = await res.json()
      console.log('[useAiIntentSearch.execute] Success! Intent data:', intentData)
      setPlan(intentData)
    } catch (e) {
      console.log('[useAiIntentSearch.execute] Exception:', e)
      setError('Network error during AI intent parsing')
      setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setPlan(null)
    setError(null)
    setBusy(false)
  }

  return {
    plan,
    busy,
    error,
    enabled,
    setEnabled,
    execute,
    clear,
  }
}
