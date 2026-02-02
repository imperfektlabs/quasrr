'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AIIntentPlan,
  AIAvailability,
  DiscoveryResult,
  Release,
  ReleaseResponse,
  SonarrLibraryItem,
  RadarrLibraryItem,
  SonarrEpisode,
} from '@/types'
import { useReleaseGrab } from '@/hooks'
import { getBackendUrl } from '@/utils/backend'
import { getRatingLink, formatSeriesYearSpan, formatSize, getReleaseKey } from '@/utils/formatting'
import { getStreamingLogoForProvider } from '@/utils/streaming'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'
import { DownloadIcon } from './Icons'

type LibraryItem = (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' })

type DetailModalProps = {
  mode: 'ai' | 'discovery' | 'library'
  // AI mode props
  plan?: AIIntentPlan
  releaseData?: ReleaseResponse | null
  busy?: boolean
  error?: string | null
  onConfirm?: (plan: AIIntentPlan) => void
  onSearch?: (query: string) => void
  // Discovery mode props
  result?: DiscoveryResult
  // Library mode props
  libraryItem?: LibraryItem
  onLibraryDelete?: (item: LibraryItem) => void
  autoSearch?: boolean
  autoDeleteOpen?: boolean
  autoExpandSeason?: number | null
  // Common props
  onClose: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
}

export function DetailModal({
  mode,
  plan,
  result,
  libraryItem,
  releaseData,
  busy = false,
  error = null,
  onConfirm,
  onSearch,
  onClose,
  onShowReleases,
  onLibraryDelete,
  autoSearch = false,
  autoDeleteOpen = false,
  autoExpandSeason = null,
}: DetailModalProps) {
  const [manualQuery, setManualQuery] = useState(plan?.query || '')
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')
  const [availability, setAvailability] = useState<AIAvailability | null>(plan?.availability || null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  // Library mode: episode data
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, SonarrEpisode[]>>({})
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [episodeSearchBusyIds, setEpisodeSearchBusyIds] = useState<Set<number>>(new Set())
  const [episodeSearchStatus, setEpisodeSearchStatus] = useState<Record<number, string>>({})
  const [episodeReleaseOpenKeys, setEpisodeReleaseOpenKeys] = useState<Set<string>>(new Set())
  const [episodeReleaseLoadingKeys, setEpisodeReleaseLoadingKeys] = useState<Set<string>>(new Set())
  const [episodeReleaseErrors, setEpisodeReleaseErrors] = useState<Record<string, string>>({})
  const [seasonReleaseCache, setSeasonReleaseCache] = useState<Record<number, {
    byEpisode: Record<number, Release[]>
  }>>({})
  const [seasonSearchBusy, setSeasonSearchBusy] = useState<Set<number>>(new Set())
  const [episodeDeleteBusyIds, setEpisodeDeleteBusyIds] = useState<Set<number>>(new Set())
  const [episodeDeleteStatus, setEpisodeDeleteStatus] = useState<Record<number, string>>({})
  const [episodeDeleteConfirmId, setEpisodeDeleteConfirmId] = useState<number | null>(null)
  const [libraryActionBusy, setLibraryActionBusy] = useState(false)
  const [libraryActionMessage, setLibraryActionMessage] = useState<string | null>(null)
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [libraryReleaseData, setLibraryReleaseData] = useState<ReleaseResponse | null>(null)
  const [libraryReleaseLoading, setLibraryReleaseLoading] = useState(false)
  const [libraryReleaseError, setLibraryReleaseError] = useState<string | null>(null)
  const libraryResultsRef = useRef<HTMLDivElement | null>(null)
  const deleteConfirmRef = useRef<HTMLDivElement | null>(null)
  const autoSearchHandled = useRef(false)
  const seasonSearchInFlight = useRef<Map<number, Promise<void>>>(new Map())

  const libraryReleaseContext = useMemo<ReleaseResponse | null>(() => {
    if (libraryReleaseData) return libraryReleaseData
    if (mode !== 'library' || !libraryItem) return null
    const isTv = libraryItem.mediaType === 'tv'
    return {
      title: libraryItem.title,
      type: isTv ? 'tv' : 'movie',
      releases: [],
      tvdb_id: isTv ? libraryItem.tvdbId : undefined,
      tmdb_id: !isTv ? libraryItem.tmdbId : undefined,
      sonarr_id: isTv ? libraryItem.id : undefined,
      radarr_id: !isTv ? libraryItem.id : undefined,
    }
  }, [libraryReleaseData, libraryItem, mode])

  const {
    busyIds: libraryGrabBusyIds,
    feedback: libraryGrabFeedback,
    setFeedback: setLibraryGrabFeedback,
    grab: grabLibraryRelease,
    clear: clearLibraryGrab,
  } = useReleaseGrab(libraryReleaseContext, false, async () => {})

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (!isIOS) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [onClose])

  // Fetch availability for AI, discovery, and library modes
  useEffect(() => {
    if (mode === 'ai') {
      setAvailability(plan?.availability || null)
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      setManualQuery(plan?.query || '')
      return
    }

    if ((mode === 'discovery' && result) || (mode === 'library' && libraryItem)) {
      let active = true
      const fetchAvailability = async () => {
        setAvailability(null)
        setAvailabilityError(null)
        setAvailabilityLoading(true)
        try {
          const backendUrl = getBackendUrl()
          const query = mode === 'library' && libraryItem ? libraryItem.title : result?.title
          const type = mode === 'library' && libraryItem
            ? (libraryItem.mediaType === 'tv' ? 'tv' : 'movie')
            : result?.type
          if (!query || !type) {
            if (active) {
              setAvailability(null)
              setAvailabilityLoading(false)
            }
            return
          }
          const params = new URLSearchParams({ query, type })
          const response = await fetch(`${backendUrl}/availability?${params}`)
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.detail || `HTTP ${response.status}`)
          }
          const data = await response.json()
          if (active) setAvailability(data.availability || null)
        } catch (err) {
          if (active) setAvailabilityError(err instanceof Error ? err.message : 'Failed to fetch availability')
        } finally {
          if (active) setAvailabilityLoading(false)
        }
      }
      fetchAvailability()
      return () => { active = false }
    }
  }, [mode, plan?.availability, plan?.query, result, libraryItem])

  // Fetch episodes for library TV shows
  useEffect(() => {
    if (mode !== 'library' || !libraryItem || libraryItem.mediaType !== 'tv') return
    let active = true
    setExpandedSeasons(new Set())
    const fetchEpisodes = async () => {
      setEpisodesLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/sonarr/series/${libraryItem.id}/episodes`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (active && Array.isArray(data)) {
          const grouped: Record<number, SonarrEpisode[]> = {}
          for (const ep of data) {
            const sn = ep.seasonNumber ?? 0
            if (!grouped[sn]) grouped[sn] = []
            grouped[sn].push(ep)
          }
          for (const key of Object.keys(grouped)) {
            grouped[Number(key)].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
          }
          setEpisodesBySeason(grouped)
        }
      } catch {
        // Silently fail
      } finally {
        if (active) setEpisodesLoading(false)
      }
    }
    fetchEpisodes()
    return () => { active = false }
  }, [mode, libraryItem])

  useEffect(() => {
    if (mode !== 'library') return
    setEpisodeSearchBusyIds(new Set())
    setEpisodeSearchStatus({})
    setEpisodeDeleteBusyIds(new Set())
    setEpisodeDeleteStatus({})
    setLibraryActionBusy(false)
    setLibraryActionMessage(null)
    setLibraryActionError(null)
    setDeleteConfirmOpen(false)
    setDeleteFiles(false)
    setDeleteBusy(false)
    setDeleteError(null)
    setLibraryReleaseData(null)
    setLibraryReleaseLoading(false)
    setLibraryReleaseError(null)
    setEpisodeReleaseOpenKeys(new Set())
    setEpisodeReleaseLoadingKeys(new Set())
    setEpisodeReleaseErrors({})
    setSeasonReleaseCache({})
    setSeasonSearchBusy(new Set())
    clearLibraryGrab()
    setLibraryGrabFeedback(null)
    autoSearchHandled.current = false
  }, [mode, libraryItem?.id])

  useEffect(() => {
    if (mode !== 'library') return
    if (!libraryItem || libraryItem.mediaType !== 'tv') return
    if (autoExpandSeason == null) return
    setExpandedSeasons((prev) => {
      const next = new Set(prev)
      next.add(autoExpandSeason)
      return next
    })
  }, [mode, libraryItem, autoExpandSeason])


  useEffect(() => {
    if (mode !== 'library') return
    if (libraryItem?.mediaType === 'tv') return
    if (!libraryReleaseLoading && !libraryReleaseError && !libraryReleaseData) return
    libraryResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [mode, libraryReleaseData, libraryReleaseError, libraryReleaseLoading, libraryItem?.mediaType])

  useEffect(() => {
    if (mode !== 'library') return
    if (autoDeleteOpen) {
      setDeleteConfirmOpen(true)
    }
  }, [mode, autoDeleteOpen])

  useEffect(() => {
    if (!deleteConfirmOpen) return
    requestAnimationFrame(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [deleteConfirmOpen])

  const buildEpisodeKey = (seasonNumber: number, episodeNumber: number) =>
    `${seasonNumber}:${episodeNumber}`

  const fetchSeasonReleases = async (seasonNumber: number) => {
    if (!libraryItem || libraryItem.mediaType !== 'tv') {
      throw new Error('Missing TV library item')
    }

    const existing = seasonSearchInFlight.current.get(seasonNumber)
    if (existing) return existing

    const promise = (async () => {
      setSeasonSearchBusy((prev) => new Set(prev).add(seasonNumber))
      try {
        const backendUrl = getBackendUrl()
        if (!libraryItem.tvdbId) {
          throw new Error('Missing TVDB ID')
        }
        const params = new URLSearchParams({
          type: 'tv',
          title: libraryItem.title,
          tvdb_id: libraryItem.tvdbId.toString(),
          season: seasonNumber.toString(),
        })

        const response = await fetch(`${backendUrl}/releases?${params.toString()}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || `HTTP ${response.status}`)
        }
        const data = await response.json()
        const byEpisode: Record<number, Release[]> = {}

        for (const release of data.releases || []) {
          if (release.full_season) continue
          const releaseSeason = typeof release.season === 'number' ? release.season : seasonNumber
          if (releaseSeason !== seasonNumber) continue
          const episodes = Array.isArray(release.episode) ? release.episode : []
          if (episodes.length === 0) continue
          for (const epNumber of episodes) {
            if (!byEpisode[epNumber]) byEpisode[epNumber] = []
            byEpisode[epNumber].push(release)
          }
        }

        const seasonEpisodes = episodesBySeason[seasonNumber] || []
        for (const episode of seasonEpisodes) {
          const epNumber = episode.episodeNumber
          if (typeof epNumber !== 'number') continue
          if (!byEpisode[epNumber]) byEpisode[epNumber] = []
        }

        setSeasonReleaseCache((prev) => ({
          ...prev,
          [seasonNumber]: { byEpisode },
        }))
        setEpisodeReleaseErrors((prev) => {
          const next = { ...prev }
          for (const episode of seasonEpisodes) {
            const epNumber = episode.episodeNumber
            if (typeof epNumber !== 'number') continue
            const key = buildEpisodeKey(seasonNumber, epNumber)
            delete next[key]
          }
          return next
        })
      } finally {
        setSeasonSearchBusy((prev) => {
          const next = new Set(prev)
          next.delete(seasonNumber)
          return next
        })
        seasonSearchInFlight.current.delete(seasonNumber)
      }
    })()

    seasonSearchInFlight.current.set(seasonNumber, promise)
    return promise
  }

  const getSizeWarning = (release: Release, mediaType: 'movie' | 'tv'): string | null => {
    const sizeGB = release.size_gb
    const sizeMB = sizeGB * 1024
    const quality = (release.quality || '').toLowerCase()

    if (quality.includes('720') && sizeMB < 300) return 'Suspiciously small for 720p'
    if (mediaType === 'tv' && !release.full_season && sizeGB > 3) return 'Very large for single episode'
    if (mediaType === 'movie') {
      if (sizeGB < 1 && quality.includes('720')) return 'May be low quality'
      if (sizeGB > 10) return 'Very large file'
    }
    return null
  }

  const getSizeRecommendation = (release: Release, mediaType: 'movie' | 'tv'): { text: string; color: string } | null => {
    const sizeGB = release.size_gb
    const sizeMB = sizeGB * 1024

    if (mediaType === 'movie') {
      if (sizeGB >= 2 && sizeGB <= 4) {
        return { text: 'Good size', color: 'text-green-400' }
      }
    } else if (mediaType === 'tv') {
      if (release.full_season) return null
      if (sizeMB >= 400 && sizeMB <= 1200) {
        return { text: 'Good size', color: 'text-green-400' }
      }
    }
    return null
  }

  const renderInlineReleaseList = (releases: Release[], mediaType: 'movie' | 'tv', contextKey: string) => {
    if (!releases || releases.length === 0) {
      return <div className="text-xs text-slate-400">No releases found.</div>
    }

    return (
      <div className="divide-y divide-slate-800/60 min-w-0 overflow-x-hidden">
        {releases.map((release, index) => {
          const key = release.guid || `${contextKey}-${index}`
          const releaseKey = getReleaseKey(release)
          const isGrabBusy = libraryGrabBusyIds.has(releaseKey)
          const warning = getSizeWarning(release, mediaType)
          const recommendation = getSizeRecommendation(release, mediaType)
          const rejectionText = release.rejected && release.rejections && release.rejections.length > 0
            ? release.rejections.join(', ')
            : null
          return (
            <div key={key} className="py-2 min-w-0">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs text-slate-100 break-words break-all">{release.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => grabLibraryRelease(release)}
                  disabled={isGrabBusy}
                  className={`h-6 w-6 inline-flex items-center justify-center rounded text-[10px] flex-none ${
                    isGrabBusy
                      ? 'bg-slate-700/60 text-slate-300 cursor-not-allowed'
                      : 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                  }`}
                  title="Send to download client"
                  aria-label="Grab release"
                >
                  {isGrabBusy ? (
                    <span className="text-[9px]">...</span>
                  ) : (
                    <DownloadIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>{release.size_formatted}</span>
                <span className="text-cyan-300">{release.quality}</span>
                <span>{release.age}</span>
                <span className={`px-1.5 rounded ${
                  release.protocol === 'usenet'
                    ? 'bg-purple-900/60 text-purple-200'
                    : 'bg-orange-900/60 text-orange-200'
                }`}>
                  {release.protocol}
                </span>
                {recommendation && !warning && !rejectionText && (
                  <span
                    title={recommendation.text}
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-cyan-400 text-cyan-300 text-[11px]"
                  >
                    OK
                  </span>
                )}
                {(warning || rejectionText) && (
                  <span
                    title={warning || rejectionText || ''}
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-red-400 text-red-300 text-[11px]"
                  >
                    !
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const fetchEpisodeReleases = async (seasonNumber: number, episodeNumber: number) => {
    if (!libraryItem || libraryItem.mediaType !== 'tv') {
      throw new Error('Missing TV library item')
    }

    const backendUrl = getBackendUrl()
    if (!libraryItem.tvdbId) {
      throw new Error('Missing TVDB ID')
    }
    const params = new URLSearchParams({
      type: 'tv',
      title: libraryItem.title,
      tvdb_id: libraryItem.tvdbId.toString(),
      season: seasonNumber.toString(),
      episode: episodeNumber.toString(),
    })

    console.log('[library-episode-search]', {
      title: libraryItem.title,
      tvdb_id: libraryItem.tvdbId,
      season: seasonNumber,
      episode: episodeNumber,
    })
    const response = await fetch(`${backendUrl}/releases?${params.toString()}`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    const data = await response.json()
    const releases = (data.releases || []).filter((release: Release) => !release.full_season)

    setSeasonReleaseCache((prev) => {
      const existing = prev[seasonNumber]?.byEpisode ?? {}
      return {
        ...prev,
        [seasonNumber]: {
          byEpisode: {
            ...existing,
            [episodeNumber]: releases,
          },
        },
      }
    })

    setEpisodeReleaseErrors((prev) => {
      const next = { ...prev }
      delete next[buildEpisodeKey(seasonNumber, episodeNumber)]
      return next
    })
  }

  const fetchLibraryReleases = async (options?: { season?: number; episode?: number }) => {
    if (!libraryItem) throw new Error('Missing library item')
    setLibraryReleaseLoading(true)
    setLibraryReleaseError(null)
    setLibraryReleaseData(null)
    setLibraryGrabFeedback(null)
    try {
      const backendUrl = getBackendUrl()
      const isTv = libraryItem.mediaType === 'tv'
      const params = new URLSearchParams({
        type: isTv ? 'tv' : 'movie',
        title: libraryItem.title,
      })

      if (isTv) {
        if (!libraryItem.tvdbId) {
          throw new Error('Missing TVDB ID')
        }
        params.set('tvdb_id', libraryItem.tvdbId.toString())
        if (typeof options?.season === 'number') {
          params.set('season', options.season.toString())
        }
        if (typeof options?.episode === 'number') {
          params.set('episode', options.episode.toString())
        }
      } else {
        if (!libraryItem.tmdbId) {
          throw new Error('Missing TMDB ID')
        }
        params.set('tmdb_id', libraryItem.tmdbId.toString())
      }

      console.log('[library-release-search]', {
        title: libraryItem.title,
        type: isTv ? 'tv' : 'movie',
        tvdb_id: isTv ? libraryItem.tvdbId : undefined,
        tmdb_id: !isTv ? libraryItem.tmdbId : undefined,
        season: options?.season,
        episode: options?.episode,
      })
      const response = await fetch(`${backendUrl}/releases?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      setLibraryReleaseData(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      setLibraryReleaseError(message)
      throw err
    } finally {
      setLibraryReleaseLoading(false)
    }
  }

  const handleEpisodeSearch = async (episodeId?: number, seasonNumber?: number, episodeNumber?: number) => {
    if (!episodeId || seasonNumber == null || episodeNumber == null) return
    const episodeKey = buildEpisodeKey(seasonNumber, episodeNumber)
    const cachedSeason = seasonReleaseCache[seasonNumber]
    const hasCache = Boolean(cachedSeason?.byEpisode?.[episodeNumber])
    const isOpen = episodeReleaseOpenKeys.has(episodeKey)

    if (hasCache) {
      setEpisodeReleaseOpenKeys((prev) => {
        const next = new Set(prev)
        if (isOpen) next.delete(episodeKey)
        else next.add(episodeKey)
        return next
      })
      return
    }

    if (episodeReleaseLoadingKeys.has(episodeKey)) return

    setEpisodeSearchBusyIds((prev) => {
      const next = new Set(prev)
      next.add(episodeId)
      return next
    })
    setEpisodeSearchStatus((prev) => ({ ...prev, [episodeId]: 'Searching...' }))
    setEpisodeReleaseLoadingKeys((prev) => new Set(prev).add(episodeKey))
    setEpisodeReleaseErrors((prev) => {
      const next = { ...prev }
      delete next[episodeKey]
      return next
    })
    setEpisodeReleaseOpenKeys((prev) => new Set(prev).add(episodeKey))

    try {
      await fetchEpisodeReleases(seasonNumber, episodeNumber)
      setEpisodeSearchStatus((prev) => ({ ...prev, [episodeId]: '' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      setEpisodeSearchStatus((prev) => ({ ...prev, [episodeId]: `Search failed: ${message}` }))
      setEpisodeReleaseErrors((prev) => ({ ...prev, [episodeKey]: message }))
    } finally {
      setEpisodeSearchBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(episodeId)
        return next
      })
      setEpisodeReleaseLoadingKeys((prev) => {
        const next = new Set(prev)
        next.delete(episodeKey)
        return next
      })
    }
  }

  const handleEpisodeDelete = async (episodeFileId?: number, episodeId?: number) => {
    if (!episodeFileId || !episodeId) return
    setEpisodeDeleteConfirmId(null)
    setEpisodeDeleteBusyIds((prev) => {
      const next = new Set(prev)
      next.add(episodeId)
      return next
    })
    setEpisodeDeleteStatus((prev) => ({ ...prev, [episodeId]: 'Deleting...' }))
    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/sonarr/episodefile/${episodeFileId}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      setEpisodeDeleteStatus((prev) => ({ ...prev, [episodeId]: 'Deleted' }))
      setEpisodesBySeason((prev) => {
        const next = { ...prev }
        for (const [seasonKey, episodes] of Object.entries(next)) {
          next[Number(seasonKey)] = episodes.map((episode) =>
            episode.id === episodeId
              ? { ...episode, hasFile: false, quality: null, episodeFileId: undefined }
              : episode
          )
        }
        return next
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setEpisodeDeleteStatus((prev) => ({ ...prev, [episodeId]: `Delete failed: ${message}` }))
    } finally {
      setEpisodeDeleteConfirmId((prev) => (prev === episodeId ? null : prev))
      setEpisodeDeleteBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(episodeId)
        return next
      })
    }
  }

  const handleLibrarySearch = async () => {
    if (mode !== 'library' || !libraryItem || libraryActionBusy) return
    setLibraryActionBusy(true)
    setLibraryActionMessage('Searching...')
    setLibraryActionError(null)
    try {
      await fetchLibraryReleases()
      setLibraryActionMessage(null)
    } catch (err) {
      setLibraryActionError(err instanceof Error ? err.message : 'Search failed')
      setLibraryActionMessage(null)
    } finally {
      setLibraryActionBusy(false)
    }
  }

  const handleSeasonSearch = async (seasonNumber: number) => {
    if (seasonSearchBusy.has(seasonNumber)) return
    if (seasonReleaseCache[seasonNumber]) return
    try {
      await fetchSeasonReleases(seasonNumber)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      setEpisodeReleaseErrors((prev) => {
        const next = { ...prev }
        for (const episode of episodesBySeason[seasonNumber] || []) {
          const epNumber = episode.episodeNumber
          if (typeof epNumber !== 'number') continue
          const key = buildEpisodeKey(seasonNumber, epNumber)
          next[key] = message
        }
        return next
      })
    }
  }

  useEffect(() => {
    if (mode !== 'library' || !autoSearch || autoSearchHandled.current) return
    autoSearchHandled.current = true
    if (libraryItem?.mediaType === 'tv') return
    void handleLibrarySearch()
  }, [mode, autoSearch, handleLibrarySearch, libraryItem?.mediaType])

  const handleLibraryDelete = async () => {
    if (mode !== 'library' || !libraryItem || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const backendUrl = getBackendUrl()
      const endpoint =
        libraryItem.mediaType === 'tv'
          ? `${backendUrl}/sonarr/series/${libraryItem.id}`
          : `${backendUrl}/radarr/movie/${libraryItem.id}`
      const params = new URLSearchParams({
        delete_files: deleteFiles ? 'true' : 'false',
      })
      const response = await fetch(`${endpoint}?${params.toString()}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      onLibraryDelete?.(libraryItem)
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleteBusy(false)
    }
  }

  // Early return checks
  if (mode === 'ai' && !plan) return null
  if (mode === 'discovery' && !result) return null
  if (mode === 'library' && !libraryItem) return null

  const intent = plan?.intent

  // ============================================
  // UNIFIED DATA EXTRACTION - compute once, render once
  // ============================================

  let headerTitle = ''
  let headerSubtitle = ''
  let poster: string | undefined
  let displayTitle = ''
  let metadata = ''
  let overview: string | undefined
  let chips: React.ReactNode[] = []
  let ratings: React.ReactNode = null
  let genres: React.ReactNode = null
  let status: 'not_in_library' | 'in_library' | 'downloaded' = 'not_in_library'

  if (mode === 'ai') {
    const availabilityYearLabel = intent?.media_type === 'tv'
      ? formatSeriesYearSpan({
        year: availability?.year ? Number.parseInt(availability.year, 10) : undefined,
        firstAired: availability?.first_aired,
        lastAired: availability?.last_aired,
        ended: availability?.ended ?? undefined,
      }) || availability?.year
      : availability?.year
    headerTitle = 'AI Suggests…'
    headerSubtitle = plan?.query ? `"${plan.query}"` : ''
    poster = availability?.poster_url
    displayTitle = availability?.title || intent?.title || plan?.query || 'Unknown'
    metadata = `${availabilityYearLabel || 'Unknown year'}${intent?.media_type && intent.media_type !== 'unknown' ? ` • ${intent.media_type}` : ''}`
    overview = availability?.overview

    // AI-specific chips
    if (releaseData?.requested_season || intent?.season) {
      const s = (releaseData?.requested_season || intent?.season)?.toString().padStart(2, '0')
      const e = (releaseData?.requested_episode || intent?.episode)?.toString().padStart(2, '0')
      chips.push(<span key="season" className="glass-chip px-2 py-1 rounded text-xs">S{s}{e ? `E${e}` : ''}</span>)
    }
    if (intent?.episode_date) chips.push(<span key="date" className="glass-chip px-2 py-1 rounded text-xs">{intent.episode_date}</span>)
    if (intent?.quality) chips.push(<span key="quality" className="glass-chip px-2 py-1 rounded text-xs">{intent.quality}</span>)
  } else if (mode === 'discovery' && result) {
    const discoveryYearLabel = result.type === 'tv'
      ? formatSeriesYearSpan({
        year: result.year,
        firstAired: result.first_aired,
        lastAired: result.last_aired,
        ended: result.ended,
      }) || (result.year ? `${result.year}` : '')
      : (result.year ? `${result.year}` : '')
    headerTitle = result.title
    headerSubtitle = `${result.type === 'movie' ? 'Movie' : 'TV Series'}${discoveryYearLabel ? ` • ${discoveryYearLabel}` : ''}`
    poster = result.poster
    displayTitle = result.title
    metadata = `${discoveryYearLabel}${result.type === 'movie' && result.runtime ? ` • ${result.runtime} min` : ''}${result.type === 'tv' && result.seasons ? ` • ${result.seasons} season${result.seasons !== 1 ? 's' : ''}` : ''}${result.network ? ` • ${result.network}` : ''}`
    overview = result.overview
    status = result.status

    // Discovery chips
    if (result.series_status) chips.push(<span key="series_status" className="glass-chip px-2 py-1 rounded text-xs">{result.series_status}</span>)

    // Ratings
    if (result.ratings && result.ratings.length > 0) {
      ratings = (
        <div className="flex flex-wrap gap-2">
          {result.ratings
            .filter((r) => r.source.toLowerCase() !== 'trakt')
            .map((r) => <RatingBadge key={r.source} rating={r} href={getRatingLink(result, r)} />)}
        </div>
      )
    }

    // Genres
    if (result.genres && result.genres.length > 0) {
      genres = (
        <div className="flex flex-wrap gap-2">
          {result.genres.slice(0, 5).map((g) => <span key={g} className="glass-chip px-2 py-1 rounded text-xs">{g}</span>)}
        </div>
      )
    }
  } else if (mode === 'library' && libraryItem) {
    const libraryYearLabel = libraryItem.mediaType === 'tv'
      ? formatSeriesYearSpan({
        year: libraryItem.year,
        firstAired: libraryItem.firstAired,
        lastAired: libraryItem.lastAired,
        ended: libraryItem.ended,
      })
      : (libraryItem.year ? `${libraryItem.year}` : '—')
    headerTitle = libraryItem.title
    headerSubtitle = `${libraryYearLabel || '—'}${libraryItem.mediaType === 'tv' && 'network' in libraryItem && libraryItem.network ? ` • ${libraryItem.network}` : ''}`
    poster = libraryItem.poster
    displayTitle = libraryItem.title
    metadata = libraryYearLabel
    overview = libraryItem.overview

    // Library status
    if (libraryItem.mediaType === 'movies') {
      status = libraryItem.hasFile ? 'downloaded' : 'not_in_library'
    } else {
      status = libraryItem.episodeCount && libraryItem.episodeFileCount === libraryItem.episodeCount
        ? 'downloaded'
        : 'not_in_library'
    }

    // Library chips
    chips.push(
      <span key="media_type" className="glass-chip px-2 py-1 rounded text-xs">
        {libraryItem.mediaType === 'movies' ? 'Movie' : 'TV'}
      </span>
    )
    if (libraryItem.mediaType === 'tv') {
      chips.push(<span key="eps" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.episodeFileCount || 0}/{libraryItem.episodeCount || 0} eps</span>)
    }
    chips.push(<span key="size" className="glass-chip px-2 py-1 rounded text-xs">{formatSize(libraryItem.sizeOnDisk)}</span>)
    if (libraryItem.path) chips.push(<span key="path" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.path}</span>)
    chips.push(<span key="monitored" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.monitored ? 'Monitored' : 'Unmonitored'}</span>)
  }

  // ============================================
  // STREAMING OPTIONS (shared between AI, discovery, and library)
  // ============================================
  const streamingSection = (mode === 'ai' || mode === 'discovery' || mode === 'library') ? (
    <div className="space-y-2">
      {availabilityLoading && <div className="text-xs text-gray-400">Loading streaming options...</div>}
      {availability?.flatrate && availability.flatrate.length > 0 && (
        <div>
          <div className="text-gray-400 text-xs mb-2">Streaming options</div>
          <div className="flex flex-wrap gap-2">
            {availability.flatrate.map((provider) => {
              const isSubscribed = availability.subscribed?.includes(provider.name)
              const logoUrl = provider.logo_url || getStreamingLogoForProvider(provider.name)
              return (
                <div
                  key={provider.name}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-xs border ${
                    isSubscribed
                      ? 'border-cyan-400/70 bg-cyan-900/20 text-cyan-200'
                      : 'border-slate-700/60 bg-slate-800/60 text-slate-200'
                  }`}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={provider.name} className="h-5 w-5 object-contain" />
                  ) : (
                    <span className="text-gray-500">?</span>
                  )}
                  <span>{provider.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {availability?.link && (
        <a href={availability.link} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-cyan-300 hover:text-cyan-200">
          View streaming options
        </a>
      )}
      {availabilityError && <div className="text-xs text-red-400">Streaming: {availabilityError}</div>}
    </div>
  ) : null

  // ============================================
  // SEASON SELECTOR (shared between discovery and library for TV)
  // ============================================
  const seasonCount = mode === 'discovery' && result?.type === 'tv' ? result.seasons : 0
  const seasonSelector = seasonCount && seasonCount > 0 ? (
    <div>
      <label className="text-xs text-gray-400">Season</label>
      <select
        value={selectedSeason}
        onChange={(e) => setSelectedSeason(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
      >
        <option value="all">All seasons</option>
        {Array.from({ length: seasonCount }, (_, i) => i + 1).map((s) => (
          <option key={s} value={s}>Season {s}</option>
        ))}
      </select>
    </div>
  ) : null

  // ============================================
  // EPISODE LIST (library mode only for TV)
  // ============================================
  const episodeList = mode === 'library' && libraryItem?.mediaType === 'tv' && 'seasons' in libraryItem && libraryItem.seasons && libraryItem.seasons.length > 0 && (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm text-slate-400">Seasons</span>
        <button
          type="button"
          onClick={() => setDeleteConfirmOpen(true)}
          title="Remove title from library"
          aria-label="Remove title from library"
          className="h-6 w-6 inline-flex items-center justify-center rounded bg-rose-500/70 hover:bg-rose-500/80 text-white text-xs font-medium transition-colors"
        >
          ✕
        </button>
      </div>
      {libraryActionMessage && <div className="text-xs text-cyan-200 mb-2">{libraryActionMessage}</div>}
      {libraryActionError && <div className="text-xs text-amber-300 mb-2">Search: {libraryActionError}</div>}
      {deleteConfirmOpen && (
        <div ref={deleteConfirmRef} className="mb-3 rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-slate-200 space-y-2">
          <div className="font-semibold text-rose-200">Confirm removal</div>
          <p className="text-slate-300">
            This will remove the title from your Sonarr library.
          </p>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(event) => setDeleteFiles(event.target.checked)}
            />
            Delete files from disk
          </label>
          {deleteError && <div className="text-amber-300">Delete: {deleteError}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLibraryDelete}
              disabled={deleteBusy}
              className="bg-rose-500/80 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-semibold"
            >
              {deleteBusy ? 'Removing...' : 'Confirm remove'}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="bg-slate-800/70 hover:bg-slate-700/70 text-slate-200 px-3 py-1.5 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="grid gap-2">
        {[...libraryItem.seasons]
          .sort((a, b) => (b.seasonNumber ?? 0) - (a.seasonNumber ?? 0))
          .map((season) => {
          const seasonNumber = season.seasonNumber ?? 0
          const isExpanded = expandedSeasons.has(seasonNumber)
          const episodes = episodesBySeason[seasonNumber] || []
          return (
            <div key={seasonNumber} className="glass-card rounded-md px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedSeasons((prev) => {
                      const next = new Set(prev)
                      if (next.has(seasonNumber)) next.delete(seasonNumber)
                      else next.add(seasonNumber)
                      return next
                    })
                  }}
                  className="flex-1 flex items-center justify-between text-left"
                >
                  <span>Season {season.seasonNumber ?? '—'}</span>
                  <span className="text-slate-300">
                    {season.episodeFileCount || 0}/{season.totalEpisodeCount ?? season.episodeCount ?? 0} eps
                  </span>
                </button>
                <div className="grid grid-cols-[auto_auto_auto_auto] items-center justify-end gap-2 text-slate-500">
                  <span className="w-[72px]" />
                  <span className="w-4" />
                  <button
                    type="button"
                    onClick={() => handleSeasonSearch(seasonNumber)}
                    disabled={seasonSearchBusy.has(seasonNumber)}
                    title="Search season"
                    aria-label="Search season"
                    className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded border ${
                      seasonReleaseCache[seasonNumber]
                        ? 'bg-emerald-500/25 text-emerald-100 border-emerald-300/40'
                        : 'bg-slate-800/60 text-slate-200 border-transparent'
                    } ${seasonSearchBusy.has(seasonNumber)
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:bg-slate-700/60'
                    }`}
                  >
                    ⌕
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    title="Remove title from library"
                    aria-label="Remove title from library"
                    className="h-6 w-6 inline-flex items-center justify-center rounded bg-rose-500/70 hover:bg-rose-500/80 text-white text-xs font-medium transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  {episodes.length === 0 && (
                    <div className="text-slate-500">{episodesLoading ? 'Loading episodes...' : 'No episodes found'}</div>
                  )}
                  {episodes.map((ep) => {
                    const formatAirDate = (value?: string | null) => {
                      if (!value) return null
                      const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
                      if (match) return match[1]
                      const parsed = new Date(value)
                      if (Number.isNaN(parsed.getTime())) return value
                      return parsed.toISOString().slice(0, 10)
                    }
                    const airDateLabel = formatAirDate(ep.airDate)
                    const qualityTitle = ep.hasFile ? (ep.quality || 'On disk') : 'Missing'
                    const qualityIcon = ep.hasFile ? '✓' : '○'
                    const qualityClass = ep.hasFile ? 'text-cyan-300' : 'text-slate-500'
                    const titleText = ep.title || 'Untitled'
                    const episodePrefix = ep.episodeNumber != null ? `E${String(ep.episodeNumber).padStart(2, '0')}` : 'E--'
                    const fullTitle = `${episodePrefix} ${titleText}`
                    const searchStatus = ep.id ? episodeSearchStatus[ep.id] : ''
                    const deleteStatus = ep.id ? episodeDeleteStatus[ep.id] : ''
                    const canSearchEpisode =
                      ep.id != null && ep.seasonNumber != null && ep.episodeNumber != null
                    const isSearching = ep.id ? episodeSearchBusyIds.has(ep.id) : false
                    const isDeleting = ep.id ? episodeDeleteBusyIds.has(ep.id) : false
                    const canDeleteEpisode = Boolean(ep.episodeFileId) && Boolean(ep.hasFile)
                    const isConfirmingDelete = ep.id ? episodeDeleteConfirmId === ep.id : false
                    const episodeKey = (ep.seasonNumber != null && ep.episodeNumber != null)
                      ? buildEpisodeKey(ep.seasonNumber, ep.episodeNumber)
                      : ''
                    const cachedSeason = ep.seasonNumber != null ? seasonReleaseCache[ep.seasonNumber] : undefined
                    const cachedReleases = (ep.episodeNumber != null && cachedSeason)
                      ? cachedSeason.byEpisode[ep.episodeNumber] || []
                      : []
                    const hasCachedReleases = cachedReleases.length > 0
                    const isReleaseOpen = episodeKey ? episodeReleaseOpenKeys.has(episodeKey) : false
                    const isReleaseLoading = episodeKey ? episodeReleaseLoadingKeys.has(episodeKey) : false
                    const releaseError = episodeKey ? episodeReleaseErrors[episodeKey] : null
                    const statusLine = deleteStatus || (searchStatus && !isReleaseOpen ? searchStatus : '')
                    return (
                      <div key={ep.id} className="space-y-2">
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="min-w-0">
                            <span className="block truncate" title={fullTitle}>
                              {fullTitle}
                            </span>
                            {statusLine && (
                              <span className="block text-xs text-slate-400">{statusLine}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-[auto_auto_auto_auto] items-center justify-end gap-2 text-slate-500">
                            <span className="text-slate-400 w-[72px] text-right">{airDateLabel || ''}</span>
                            <span className={`text-xs w-4 text-center ${qualityClass}`} title={qualityTitle}>{qualityIcon}</span>
                            <button
                              type="button"
                              onClick={() => handleEpisodeSearch(ep.id, ep.seasonNumber, ep.episodeNumber)}
                              disabled={!canSearchEpisode || isSearching}
                              title={isReleaseOpen ? 'Hide releases' : 'Search for episode'}
                              aria-label={isReleaseOpen ? 'Hide releases' : 'Search for episode'}
                              className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded border transition-colors ${
                                hasCachedReleases
                                  ? 'bg-emerald-500/25 text-emerald-100 border-emerald-300/40'
                                  : 'bg-slate-800/60 text-slate-200 border-transparent'
                              } ${isSearching || !canSearchEpisode
                                ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                                : 'hover:bg-slate-700/60'
                              }`}
                            >
                              ⌕
                            </button>
                            {isConfirmingDelete ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEpisodeDelete(ep.episodeFileId, ep.id)}
                                  disabled={!canDeleteEpisode || isDeleting}
                                  title="Confirm delete episode"
                                  aria-label="Confirm delete episode"
                                  className="h-6 w-14 inline-flex items-center justify-center text-xs rounded bg-rose-500/80 text-white hover:bg-rose-500 disabled:bg-rose-900/40 disabled:text-slate-300 disabled:cursor-not-allowed"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEpisodeDeleteConfirmId(null)}
                                  disabled={isDeleting}
                                  title="Cancel delete"
                                  aria-label="Cancel delete"
                                  className="h-6 w-14 inline-flex items-center justify-center text-xs rounded bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 disabled:bg-slate-800/30 disabled:text-slate-500 disabled:cursor-not-allowed"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canDeleteEpisode) return
                                  setEpisodeDeleteConfirmId(ep.id ?? null)
                                }}
                                disabled={!canDeleteEpisode || isDeleting}
                                title="Delete episode"
                                aria-label="Delete episode"
                                className="h-6 w-6 inline-flex items-center justify-center text-xs rounded bg-rose-500/70 text-white hover:bg-rose-500/80 disabled:bg-rose-900/40 disabled:text-slate-300 disabled:cursor-not-allowed"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        {isReleaseOpen && (
                          <div className="rounded-md border border-slate-800/60 bg-slate-900/30 px-3 py-2 text-xs text-slate-200 space-y-2 w-full max-w-full min-w-0 overflow-x-hidden">
                            {libraryGrabFeedback && (
                              <div className={`text-xs ${libraryGrabFeedback.type === 'error' ? 'text-amber-300' : 'text-emerald-200'}`}>
                                {libraryGrabFeedback.text}
                              </div>
                            )}
                            {isReleaseLoading && (
                              <div className="text-xs text-slate-400">Searching...</div>
                            )}
                            {!isReleaseLoading && releaseError && (
                              <div className="text-xs text-amber-300">Search: {releaseError}</div>
                            )}
                            {!isReleaseLoading && !releaseError && (
                              renderInlineReleaseList(cachedReleases, 'tv', episodeKey)
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ============================================
  // ACTION BUTTONS - mode-specific
  // ============================================
  let actionButtons: React.ReactNode = null

  if (mode === 'ai') {
    actionButtons = (
      <>
        <div className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = manualQuery.trim()
              if (!trimmed || busy) return
              onSearch?.(trimmed)
            }}
            className="mt-1 flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Search again…"
                className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 pr-9 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              />
              {manualQuery && (
                <button
                  type="button"
                  onClick={() => setManualQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !manualQuery.trim()}
              className="bg-slate-700/60 hover:bg-slate-600/70 disabled:bg-slate-700/40 disabled:cursor-not-allowed text-white py-2 px-3 rounded text-sm"
            >
              {busy ? '...' : 'Search this'}
            </button>
          </form>
        </div>
        <div className="mt-5 flex w-full flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={() => plan && onConfirm?.(plan)}
            disabled={busy}
            className="flex-1 min-w-0 whitespace-nowrap bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed text-white py-2 px-3 sm:px-4 text-xs sm:text-sm rounded font-medium"
          >
            {busy ? 'Working...' : 'Search this title'}
          </button>
          <button
            type="button"
            onClick={() => plan && onSearch?.(plan.query)}
            disabled={busy}
            className="flex-1 min-w-0 whitespace-nowrap bg-slate-800/70 hover:bg-slate-700/70 text-white py-2 px-3 sm:px-4 text-xs sm:text-sm rounded"
          >
            Search original query
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-w-0 whitespace-nowrap bg-slate-700/60 hover:bg-slate-600/70 text-white py-2 px-3 sm:px-4 text-xs sm:text-sm rounded"
          >
            Cancel
          </button>
        </div>
      </>
    )
  } else if (mode === 'discovery' && result) {
    actionButtons = (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!onShowReleases) return
            if (result.type === 'tv' && selectedSeason !== 'all') {
              onShowReleases(result, selectedSeason)
            } else {
              onShowReleases(result)
            }
            onClose()
          }}
          className="bg-cyan-500/80 hover:bg-cyan-400 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
        >
          Find Releases
        </button>
      </div>
    )
  } else if (mode === 'library' && libraryItem && libraryItem.mediaType !== 'tv') {
    actionButtons = (
      <div className="mt-4 space-y-3">
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleLibrarySearch}
            disabled={libraryActionBusy}
            title="Search All"
            aria-label="Search All"
            className="h-6 w-6 inline-flex items-center justify-center bg-slate-800/60 hover:bg-slate-700/60 disabled:bg-slate-800/30 disabled:cursor-not-allowed text-slate-200 rounded text-xs font-medium transition-colors"
          >
            ⌕
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            title="Remove title from library"
            aria-label="Remove title from library"
            className="h-6 w-6 inline-flex items-center justify-center bg-rose-500/70 hover:bg-rose-500/80 text-white rounded text-xs font-medium transition-colors"
          >
            ✕
          </button>
        </div>
        {libraryActionMessage && <div className="text-xs text-cyan-200">{libraryActionMessage}</div>}
        {libraryActionError && <div className="text-xs text-amber-300">Search: {libraryActionError}</div>}
        {deleteConfirmOpen && (
          <div ref={deleteConfirmRef} className="rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-slate-200 space-y-2">
            <div className="font-semibold text-rose-200">Confirm removal</div>
            <p className="text-slate-300">
              This will remove the title from your Radarr library.
            </p>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(event) => setDeleteFiles(event.target.checked)}
              />
              Delete files from disk
            </label>
            {deleteError && <div className="text-amber-300">Delete: {deleteError}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleLibraryDelete}
                disabled={deleteBusy}
                className="bg-rose-500/80 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-semibold"
              >
                {deleteBusy ? 'Removing...' : 'Confirm remove'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="bg-slate-800/70 hover:bg-slate-700/70 text-slate-200 px-3 py-1.5 rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============================================
  // SINGLE UNIFIED RETURN
  // ============================================
  return (
    <div className="fixed inset-0 glass-modal z-50 overflow-auto" onClick={onClose}>
      <div className="min-h-screen p-4">
        <div
          className="mx-auto glass-panel rounded-lg p-4 md:p-6 max-w-3xl w-full max-h-[calc(100vh-2rem)] min-h-[calc(100vh-2rem)] overflow-y-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >

          {/* HEADER - identical for all modes */}
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold">{headerTitle}</h2>
              <p className="text-gray-400 text-sm">{headerSubtitle}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl px-2">X</button>
          </div>

          {/* MAIN CONTENT - unified grid layout */}
          <div className="mt-4 grid md:grid-cols-[160px,1fr] gap-4">
            {/* Poster column */}
            <div className="w-full">
              {poster ? (
                <img src={poster} alt={displayTitle} className="w-full rounded-lg object-cover" />
              ) : (
                <div className="w-full h-56 rounded-lg bg-slate-800/60 flex items-center justify-center text-gray-500 text-xs">
                  No poster
                </div>
              )}
            </div>

            {/* Content column */}
            <div className="space-y-3">
              {/* Title (for AI mode where header title is different) */}
              {mode === 'ai' && (
                <div className="text-slate-200 text-lg font-semibold">{displayTitle}</div>
              )}

              {/* Metadata line */}
              {metadata && <div className="text-gray-400 text-xs">{metadata}</div>}

              {/* Status badge + chips */}
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={status} />
                {chips}
              </div>

              {/* Genres (discovery only) */}
              {genres}

              {/* Ratings (discovery only) */}
              {ratings}

              {/* Overview */}
              {overview && <p className="text-gray-300 text-sm leading-relaxed line-clamp-4">{overview}</p>}

              {/* AI-specific messages */}
              {mode === 'ai' && releaseData?.message && <div className="text-xs text-amber-300">{releaseData.message}</div>}
              {mode === 'ai' && intent?.notes && <p className="text-gray-300 text-xs line-clamp-2">{intent.notes}</p>}
              {mode === 'ai' && plan?.recommendation === 'watch' && (
                <div className="text-amber-300 text-xs">Recommendation: stream instead of downloading.</div>
              )}
              {mode === 'ai' && error && <div className="text-red-400 text-xs">AI: {error}</div>}

              {/* Streaming options (AI and discovery) */}
              {streamingSection}

              {/* Season selector (discovery TV only) */}
              {seasonSelector}
            </div>
          </div>

          {/* EPISODE LIST - library TV only, full width below the grid */}
          {episodeList}

          {/* ACTION BUTTONS - mode-specific */}
          {actionButtons}

          {mode === 'library' && libraryItem?.mediaType !== 'tv' && (libraryReleaseLoading || libraryReleaseError || libraryReleaseData) && (
            <div ref={libraryResultsRef} className="mt-4 space-y-2">
              {libraryGrabFeedback && (
                <div className={`text-xs ${libraryGrabFeedback.type === 'error' ? 'text-amber-300' : 'text-emerald-200'}`}>
                  {libraryGrabFeedback.text}
                </div>
              )}
              {libraryReleaseLoading && !libraryActionMessage && (
                <div className="text-xs text-slate-300">Searching...</div>
              )}
              {libraryReleaseError && (
                <div className="text-xs text-amber-300">Search: {libraryReleaseError}</div>
              )}
              {libraryReleaseData && (
                <div className="rounded-md border border-slate-800/60 bg-slate-900/30 px-3 py-2 text-xs text-slate-200 w-full max-w-full min-w-0 overflow-x-hidden">
                  {renderInlineReleaseList(libraryReleaseData.releases || [], 'movie', 'movie')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
