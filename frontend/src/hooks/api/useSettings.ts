/**
 * Settings management hook
 * Handles user settings (country, AI model) and streaming service toggles
 */

import { useEffect, useState } from 'react'
import type { ConfigStatus } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type SettingsResult = {
  country: string
  setCountry: (c: string) => void
  aiModel: string
  setAiModel: (m: string) => void
  saving: boolean
  error: string | null
  saved: boolean
  setSaved: (s: boolean) => void
  streamingBusy: boolean
  streamingError: string | null
  toggleStreaming: (id: string, enabled: boolean) => Promise<void>
  saveSettings: () => Promise<void>
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
  const [aiModel, setAiModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [streamingBusy, setStreamingBusy] = useState(false)
  const [streamingError, setStreamingError] = useState<string | null>(null)

  // Sync form state from config
  useEffect(() => {
    if (config) {
      setCountry(config.user.country)
      setAiModel(config.ai.model)
    }
  }, [config])

  const toggleStreaming = async (id: string, enabled: boolean) => {
    if (!config) return

    setStreamingBusy(true)
    setStreamingError(null)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/streaming_services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: config.streaming_services.map((s) =>
            s.id === id ? { ...s, enabled } : s
          ),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setStreamingError(errorData.detail || 'Failed to update streaming services')
        return
      }

      const updatedConfig = await res.json()
      onConfigUpdate(updatedConfig)
    } catch (e) {
      setStreamingError('Network error while updating streaming services')
    } finally {
      setStreamingBusy(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { country },
          ai: { model: aiModel },
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'Failed to save settings')
        return
      }

      const updatedConfig = await res.json()
      onConfigUpdate(updatedConfig)
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
    aiModel,
    setAiModel,
    saving,
    error,
    saved,
    setSaved,
    streamingBusy,
    streamingError,
    toggleStreaming,
    saveSettings,
  }
}
