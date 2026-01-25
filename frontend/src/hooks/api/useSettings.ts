/**
 * Settings management hook
 * Handles user settings (country) and streaming service toggles
 */

import { useEffect, useState } from 'react'
import type { ConfigStatus } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type SettingsResult = {
  country: string
  setCountry: (c: string) => void
  showSonarr: boolean
  setShowSonarr: (next: boolean) => void
  showRadarr: boolean
  setShowRadarr: (next: boolean) => void
  showSabnzbd: boolean
  setShowSabnzbd: (next: boolean) => void
  showPlex: boolean
  setShowPlex: (next: boolean) => void
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
  const [showSonarr, setShowSonarr] = useState(true)
  const [showRadarr, setShowRadarr] = useState(true)
  const [showSabnzbd, setShowSabnzbd] = useState(true)
  const [showPlex, setShowPlex] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [streamingBusy, setStreamingBusy] = useState(false)
  const [streamingError, setStreamingError] = useState<string | null>(null)

  // Sync form state from config
  useEffect(() => {
    if (config) {
      setCountry(config.user.country)
      setShowSonarr(config.dashboard.show_sonarr)
      setShowRadarr(config.dashboard.show_radarr)
      setShowSabnzbd(config.dashboard.show_sabnzbd)
      setShowPlex(config.dashboard.show_plex)
    }
  }, [config])

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
  }>) => {
    setSaving(true)
    setError(null)
    setSaved(false)

    const nextCountry = next?.country ?? country

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: nextCountry,
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

  return {
    country,
    setCountry,
    showSonarr,
    setShowSonarr,
    showRadarr,
    setShowRadarr,
    showSabnzbd,
    setShowSabnzbd,
    showPlex,
    setShowPlex,
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
