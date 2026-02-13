/**
 * Settings management hook
 * Handles user settings (country) and streaming service toggles
 */

import { useEffect, useState } from 'react'
import type { ConfigStatus } from '@/types'
import { getBackendUrl } from '@/utils/backend'

const DISCOVERY_SEARCH_POSITION_KEY = 'quasrr.layout.discovery_search_position'
const LIBRARY_SEARCH_POSITION_KEY = 'quasrr.layout.library_search_position'

const readCachedPosition = (
  key: string,
  fallback: 'top' | 'bottom' = 'bottom',
): 'top' | 'bottom' => {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  return value === 'top' || value === 'bottom' ? value : fallback
}

export type SettingsResult = {
  country: string
  setCountry: (c: string) => void
  aiProvider: string
  setAiProvider: (p: string) => void
  showSonarr: boolean
  setShowSonarr: (next: boolean) => void
  showRadarr: boolean
  setShowRadarr: (next: boolean) => void
  showSabnzbd: boolean
  setShowSabnzbd: (next: boolean) => void
  showPlex: boolean
  setShowPlex: (next: boolean) => void
  sabRecentLimit: number
  setSabRecentLimit: (next: number) => void
  discoverySearchPosition: 'top' | 'bottom'
  setDiscoverySearchPosition: (next: 'top' | 'bottom') => void
  librarySearchPosition: 'top' | 'bottom'
  setLibrarySearchPosition: (next: 'top' | 'bottom') => void
  viewMode: 'grid' | 'list'
  setViewMode: (next: 'grid' | 'list') => void
  saving: boolean
  error: string | null
  saved: boolean
  setSaved: (s: boolean) => void
  streamingBusy: boolean
  streamingError: string | null
  toggleStreaming: (id: string, enabled: boolean) => Promise<void>
  saveDashboard: (next?: Partial<{
    show_sonarr: boolean
    show_radarr: boolean
    show_sabnzbd: boolean
    show_plex: boolean
  }>) => Promise<void>
  saveSettings: (next?: Partial<{
    country: string
    ai_provider: string
    ai_model: string
    sab_recent_group_limit: number
    discovery_search_position: 'top' | 'bottom'
    library_search_position: 'top' | 'bottom'
    view_mode: 'grid' | 'list'
  }>) => Promise<void>
}

/**
 * Manage user settings and streaming service configuration
 * @param config - Current config state (from useBackendApiSetup)
 * @param onConfigUpdate - Callback to update parent config state
 */
export function useSettings(
  config: ConfigStatus,
  onConfigUpdate: (newConfig: ConfigStatus) => void
): SettingsResult {
  const [country, setCountry] = useState('')
  const [aiProvider, setAiProvider] = useState('')
  const [showSonarr, setShowSonarr] = useState(true)
  const [showRadarr, setShowRadarr] = useState(true)
  const [showSabnzbd, setShowSabnzbd] = useState(true)
  const [showPlex, setShowPlex] = useState(false)
  const [sabRecentLimit, setSabRecentLimit] = useState(10)
  const [discoverySearchPosition, setDiscoverySearchPosition] = useState<'top' | 'bottom'>(
    () => readCachedPosition(DISCOVERY_SEARCH_POSITION_KEY, 'bottom')
  )
  const [librarySearchPosition, setLibrarySearchPosition] = useState<'top' | 'bottom'>(
    () => readCachedPosition(LIBRARY_SEARCH_POSITION_KEY, 'bottom')
  )
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [streamingBusy, setStreamingBusy] = useState(false)
  const [streamingError, setStreamingError] = useState<string | null>(null)

  // Sync form state from config
  useEffect(() => {
    if (config) {
      setCountry(config.user.country)
      setAiProvider(config.ai.provider)
      setShowSonarr(config.dashboard.show_sonarr)
      setShowRadarr(config.dashboard.show_radarr)
      setShowSabnzbd(config.dashboard.show_sabnzbd)
      setShowPlex(config.dashboard.show_plex)
      setSabRecentLimit(config.sabnzbd?.recent_group_limit ?? 10)
      const nextDiscoveryPosition = config.layout?.discovery_search_position ?? 'bottom'
      const nextLibraryPosition = config.layout?.library_search_position ?? 'bottom'
      setDiscoverySearchPosition(nextDiscoveryPosition)
      setLibrarySearchPosition(nextLibraryPosition)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DISCOVERY_SEARCH_POSITION_KEY, nextDiscoveryPosition)
        window.localStorage.setItem(LIBRARY_SEARCH_POSITION_KEY, nextLibraryPosition)
      }
      setViewMode((config.layout?.view_mode as 'grid' | 'list') ?? 'grid')
    }
  }, [config])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DISCOVERY_SEARCH_POSITION_KEY, discoverySearchPosition)
  }, [discoverySearchPosition])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LIBRARY_SEARCH_POSITION_KEY, librarySearchPosition)
  }, [librarySearchPosition])

  const toggleStreaming = async (id: string, enabled: boolean) => {
    if (!config) return

    setStreamingBusy(true)
    setStreamingError(null)

    try {
      const backendUrl = getBackendUrl()
      const enabledIds = config.streaming_services
        .map((service) => {
          if (service.id === id) {
            return enabled ? service.id : null
          }
          return service.enabled ? service.id : null
        })
        .filter((serviceId): serviceId is string => Boolean(serviceId))
      const res = await fetch(`${backendUrl}/config/streaming_services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled_ids: enabledIds,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setStreamingError(errorData.detail || 'Failed to update streaming services')
        return
      }

      const updatedResponse = await res.json()
      onConfigUpdate(updatedResponse.config)
    } catch (e) {
      setStreamingError('Network error while updating streaming services')
    } finally {
      setStreamingBusy(false)
    }
  }

  const saveDashboard = async (next?: Partial<{
    show_sonarr: boolean
    show_radarr: boolean
    show_sabnzbd: boolean
    show_plex: boolean
  }>) => {
    setSaving(true)
    setError(null)
    setSaved(false)

    const dashboard = {
      show_sonarr: showSonarr,
      show_radarr: showRadarr,
      show_sabnzbd: showSabnzbd,
      show_plex: showPlex,
      ...next,
    }

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          ai_provider: aiProvider,
          dashboard,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'Failed to save settings')
        return
      }

      const updatedResponse = await res.json()
      onConfigUpdate(updatedResponse.config)
      setSaved(true)

      // Clear "saved" message after 2 seconds
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError('Network error while saving settings')
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async (next?: Partial<{
    country: string
    ai_provider: string
    ai_model: string
    sab_recent_group_limit: number
    discovery_search_position: 'top' | 'bottom'
    library_search_position: 'top' | 'bottom'
    view_mode: 'grid' | 'list'
  }>) => {
    setSaving(true)
    setError(null)
    setSaved(false)

    const nextCountry = next?.country ?? country
    const nextAiProvider = next?.ai_provider ?? aiProvider
    const nextAiModel = next?.ai_model
    const nextSabRecentLimit = next?.sab_recent_group_limit ?? sabRecentLimit
    const nextDiscoverySearchPosition = next?.discovery_search_position ?? discoverySearchPosition
    const nextLibrarySearchPosition = next?.library_search_position ?? librarySearchPosition
    const nextViewMode = next?.view_mode ?? viewMode

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: nextCountry,
          ai_provider: nextAiProvider,
          ai_model: nextAiModel,
          layout: {
            discovery_search_position: nextDiscoverySearchPosition,
            library_search_position: nextLibrarySearchPosition,
            view_mode: nextViewMode,
          },
          sabnzbd: {
            recent_group_limit: nextSabRecentLimit,
          },
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'Failed to save settings')
        return
      }

      const updatedResponse = await res.json()
      onConfigUpdate(updatedResponse.config)
      setDiscoverySearchPosition(nextDiscoverySearchPosition)
      setLibrarySearchPosition(nextLibrarySearchPosition)
      setSaved(true)

      // Clear "saved" message after 2 seconds
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError('Network error while saving settings')
    } finally {
      setSaving(false)
    }
  }

  return {
    country,
    setCountry,
    aiProvider,
    setAiProvider,
    showSonarr,
    setShowSonarr,
    showRadarr,
    setShowRadarr,
    showSabnzbd,
    setShowSabnzbd,
    showPlex,
    setShowPlex,
    sabRecentLimit,
    setSabRecentLimit,
    discoverySearchPosition,
    setDiscoverySearchPosition,
    librarySearchPosition,
    setLibrarySearchPosition,
    viewMode,
    setViewMode,
    saving,
    error,
    saved,
    setSaved,
    streamingBusy,
    streamingError,
    toggleStreaming,
    saveDashboard,
    saveSettings,
  }
}
