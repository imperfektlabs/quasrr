/**
 * AI Suggest hook
 * Requests AI suggestions for which release to grab
 */

import { useState } from 'react'
import type { AISuggestion, Release, ReleaseResponse } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { sortReleasesForAi } from '@/utils/formatting'

export type AiSuggestResult = {
  suggestion: AISuggestion | null
  busy: boolean
  error: string | null
  suggest: (releases: Release[]) => Promise<void>
  clear: () => void
}

/**
 * Get AI recommendation for which release to grab
 * @param releaseData - Current release data context
 */
export function useAiSuggest(releaseData: ReleaseResponse | null): AiSuggestResult {
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggest = async (releases: Release[]) => {
    setBusy(true)
    setError(null)

    try {
      // Sort releases by size (smallest first) for AI analysis
      const sorted = sortReleasesForAi(releases)

      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/ai/release/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData?.type,
          title: releaseData?.title,
          year: releaseData?.year,
          runtime: releaseData?.runtime,
          season: releaseData?.season,
          releases: sorted,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'AI suggestion failed')
        setSuggestion(null)
        return
      }

      const data = await res.json()
      setSuggestion(data.suggestion)
    } catch (e) {
      setError('Network error while getting AI suggestion')
      setSuggestion(null)
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setSuggestion(null)
    setError(null)
    setBusy(false)
  }

  return {
    suggestion,
    busy,
    error,
    suggest,
    clear,
  }
}
