/**
 * Release Data hook
 * Fetches and manages release data for a specific title
 */

import { useState } from 'react'
import type { DiscoveryResult, ReleaseResponse } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type ReleaseDataResult = {
  releaseData: ReleaseResponse | null
  loading: boolean
  error: string | null
  fetchReleases: (result: DiscoveryResult, season?: number, episode?: number, episodeDate?: string) => Promise<void>
  clear: () => void
  clearError: () => void
}

/**
 * Fetch releases for a specific title from indexers
 * Supports both movies and TV shows (with optional season selection)
 */
export function useReleaseData(): ReleaseDataResult {
  const [releaseData, setReleaseData] = useState<ReleaseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReleases = async (result: DiscoveryResult, season?: number, episode?: number, episodeDate?: string) => {
    setLoading(true)
    setError(null)

    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({
        type: result.type,
        title: result.title,
      })

      // Add IDs based on media type
      if (result.type === 'movie' && result.tmdb_id) {
        params.set('tmdb_id', result.tmdb_id.toString())
      } else if (result.type === 'tv' && result.tvdb_id) {
        params.set('tvdb_id', result.tvdb_id.toString())
      }

      // Add season for TV shows
      if (result.type === 'tv' && season !== undefined) {
        params.set('season', season.toString())
      }

      // Add episode for TV shows
      if (result.type === 'tv' && episode !== undefined) {
        params.set('episode', episode.toString())
      }

      // Add episode date for TV shows
      if (result.type === 'tv' && episodeDate) {
        params.set('episode_date', episodeDate)
      }

      const res = await fetch(`${backendUrl}/releases?${params.toString()}`)

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'Failed to fetch releases')
        setReleaseData(null)
        return
      }

      const data = await res.json()
      setReleaseData(data)
    } catch (e) {
      setError('Network error while fetching releases')
      setReleaseData(null)
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setReleaseData(null)
    setError(null)
    setLoading(false)
  }

  const clearError = () => {
    setError(null)
  }

  return {
    releaseData,
    loading,
    error,
    fetchReleases,
    clear,
    clearError,
  }
}
