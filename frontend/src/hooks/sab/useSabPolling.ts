/**
 * SABnzbd Polling hook
 * Polls SABnzbd queue and recent downloads at a configurable interval
 */

import { useEffect, useRef, useState } from 'react'
import type { SabQueueResponse, SabRecentResponse } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type SabPollingResult = {
  queue: SabQueueResponse | null
  recent: SabRecentResponse | null
  loading: boolean
  queueError: string | null
  recentError: string | null
  refetch: (silent?: boolean) => Promise<void>
}

/**
 * Poll SABnzbd queue and recent downloads
 * @param enabled - Whether SABnzbd is configured and polling should be active
 * @param pollingInterval - Polling interval in milliseconds (default: 2000ms)
 */
export function useSabPolling(
  enabled: boolean,
  pollingInterval: number = 2000
): SabPollingResult {
  const [queue, setQueue] = useState<SabQueueResponse | null>(null)
  const [recent, setRecent] = useState<SabRecentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [recentError, setRecentError] = useState<string | null>(null)

  const pollInFlight = useRef(false)

  const fetchSabData = async (silent: boolean = false) => {
    // Prevent duplicate concurrent requests
    if (pollInFlight.current) return

    // Skip if document not visible (browser tab in background)
    if (document.visibilityState !== 'visible') return

    pollInFlight.current = true

    if (!silent) setLoading(true)

    try {
      const backendUrl = getBackendUrl()

      const [queueRes, recentRes] = await Promise.all([
        fetch(`${backendUrl}/sab/queue`),
        fetch(`${backendUrl}/sab/recent?limit=5`),
      ])

      // Handle queue response
      if (queueRes.ok) {
        const queueData = await queueRes.json()
        setQueue(queueData)
        setQueueError(null)
      } else {
        setQueueError('Failed to fetch SABnzbd queue')
      }

      // Handle recent response
      if (recentRes.ok) {
        const recentData = await recentRes.json()
        setRecent(recentData)
        setRecentError(null)
      } else {
        setRecentError('Failed to fetch SABnzbd recent downloads')
      }
    } catch (e) {
      setQueueError('Network error while fetching SABnzbd queue')
      setRecentError('Network error while fetching SABnzbd recent downloads')
    } finally {
      setLoading(false)
      pollInFlight.current = false
    }
  }

  // Initial fetch when enabled
  useEffect(() => {
    if (enabled) {
      fetchSabData()
    }
  }, [enabled])

  // Polling interval
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      fetchSabData(true) // Silent polling
    }, pollingInterval)

    return () => clearInterval(interval)
  }, [enabled, pollingInterval])

  return {
    queue,
    recent,
    loading,
    queueError,
    recentError,
    refetch: fetchSabData,
  }
}
