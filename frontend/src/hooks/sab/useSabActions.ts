/**
 * SABnzbd Actions hook
 * Executes SABnzbd queue actions (pause, resume, delete)
 */

import { useState } from 'react'
import { getBackendUrl } from '@/utils/backend'

export type SabActionsResult = {
  busy: boolean
  error: string | null
  clearError: () => void
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  pauseJob: (jobId: string) => Promise<void>
  resumeJob: (jobId: string) => Promise<void>
  deleteJob: (jobId: string) => Promise<void>
}

/**
 * Execute SABnzbd queue actions
 * @param onRefreshQueue - Callback to refresh queue after action
 */
export function useSabActions(onRefreshQueue: () => Promise<void>): SabActionsResult {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const performAction = async (path: string) => {
    setBusy(true)
    setError(null)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}${path}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const errorData = await res.json()
        setError(errorData.detail || 'Action failed')
        return
      }

      // Refresh queue after successful action
      await onRefreshQueue()
    } catch (e) {
      setError('Network error while performing action')
    } finally {
      setBusy(false)
    }
  }

  const pauseAll = () => performAction('/sab/queue/pause')
  const resumeAll = () => performAction('/sab/queue/resume')
  const pauseJob = (jobId: string) => performAction(`/sab/queue/item/${jobId}/pause`)
  const resumeJob = (jobId: string) => performAction(`/sab/queue/item/${jobId}/resume`)
  const deleteJob = (jobId: string) => performAction(`/downloads/queue/item/${jobId}/delete`)

  const clearError = () => setError(null)

  return {
    busy,
    error,
    clearError,
    pauseAll,
    resumeAll,
    pauseJob,
    resumeJob,
    deleteJob,
  }
}
