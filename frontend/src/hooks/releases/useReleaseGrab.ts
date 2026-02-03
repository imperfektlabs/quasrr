/**
 * Release Grab hook
 * Handles grabbing releases (single and batch) to download client
 */

import { useState } from 'react'
import type { Release, ReleaseResponse } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { getReleaseKey } from '@/utils/formatting'

export type GrabFeedback = {
  type: 'error' | 'success'
  text: string
}

type DownloadToastEvent = {
  status: 'success' | 'error'
  message: string
  title?: string
  releaseTitle?: string
  mediaType?: 'movie' | 'tv'
  season?: number
  episode?: number
  count?: number
}

const emitDownloadToast = (detail: DownloadToastEvent) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('quasrr:download-toast', { detail }))
}

export type ReleaseGrabResult = {
  busyIds: Set<string>
  feedback: GrabFeedback | null
  setFeedback: (f: GrabFeedback | null) => void
  grab: (release: Release) => Promise<void>
  grabAll: (releases: Release[]) => Promise<void>
  clear: () => void
}

/**
 * Handle grabbing releases to download client
 * @param releaseData - Current release data context
 * @param sabConfigured - Whether SABnzbd is configured
 * @param onRefreshSab - Callback to refresh SABnzbd queue after successful grab
 */
export function useReleaseGrab(
  releaseData: ReleaseResponse | null,
  sabConfigured: boolean,
  onRefreshSab: () => Promise<void>
): ReleaseGrabResult {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<GrabFeedback | null>(null)

  const grab = async (release: Release) => {
    const key = getReleaseKey(release)
    const episodeValue = Array.isArray(release.episode) ? release.episode[0] : release.episode
    const mediaType = releaseData?.type as 'movie' | 'tv' | undefined

    setBusyIds((prev) => new Set(prev).add(key))
    setFeedback(null)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/releases/grab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData?.type,
          title: releaseData?.title,
          tmdb_id: releaseData?.tmdb_id,
          tvdb_id: releaseData?.tvdb_id,
          radarr_id: releaseData?.radarr_id,
          sonarr_id: releaseData?.sonarr_id,
          season: releaseData?.season,
          guid: release.guid,
          indexer_id: release.indexer_id,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        emitDownloadToast({
          status: 'error',
          message: errorData.detail || 'Failed to grab release',
          title: releaseData?.title,
          releaseTitle: release.title,
          mediaType,
          season: release.season,
          episode: episodeValue,
        })
        return
      }

      emitDownloadToast({
        status: 'success',
        message: 'Sent to downloader',
        title: releaseData?.title,
        releaseTitle: release.title,
        mediaType,
        season: release.season,
        episode: episodeValue,
      })

      // Refresh SABnzbd queue if configured
      if (sabConfigured) {
        await onRefreshSab()
      }
    } catch (e) {
      emitDownloadToast({
        status: 'error',
        message: 'Network error while grabbing release',
        title: releaseData?.title,
        releaseTitle: release.title,
        mediaType,
        season: release.season,
        episode: episodeValue,
      })
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const grabAll = async (releases: Release[]) => {
    // Mark all as busy
    const keys = releases.map(getReleaseKey)
    setBusyIds(new Set(keys))
    setFeedback(null)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/releases/grab-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData?.type,
          title: releaseData?.title,
          tmdb_id: releaseData?.tmdb_id,
          tvdb_id: releaseData?.tvdb_id,
          radarr_id: releaseData?.radarr_id,
          sonarr_id: releaseData?.sonarr_id,
          season: releaseData?.season,
          releases: releases.map((r) => ({
            guid: r.guid,
            indexer_id: r.indexer_id,
            season: r.season,
            episode: r.episode,
          })),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        emitDownloadToast({
          status: 'error',
          message: errorData.detail || 'Failed to grab releases',
          title: releaseData?.title,
          mediaType: releaseData?.type as 'movie' | 'tv' | undefined,
        })
        return
      }

      const result = await res.json()
      const { success = 0, failed = 0 } = result

      if (failed > 0) {
        emitDownloadToast({
          status: 'error',
          message: `Grabbed ${success}, failed ${failed}`,
          title: releaseData?.title,
          mediaType: releaseData?.type as 'movie' | 'tv' | undefined,
          count: success,
        })
      } else {
        emitDownloadToast({
          status: 'success',
          message: `Successfully grabbed ${success} release${success > 1 ? 's' : ''}`,
          title: releaseData?.title,
          mediaType: releaseData?.type as 'movie' | 'tv' | undefined,
          count: success,
        })
      }

      // Refresh SABnzbd queue if configured
      if (sabConfigured && success > 0) {
        await onRefreshSab()
      }
    } catch (e) {
      emitDownloadToast({
        status: 'error',
        message: 'Network error while grabbing releases',
        title: releaseData?.title,
          mediaType: releaseData?.type as 'movie' | 'tv' | undefined,
      })
    } finally {
      setBusyIds(new Set())
    }
  }

  const clear = () => {
    setBusyIds(new Set())
    setFeedback(null)
  }

  return {
    busyIds,
    feedback,
    setFeedback,
    grab,
    grabAll,
    clear,
  }
}
