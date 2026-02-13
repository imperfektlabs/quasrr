'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Type imports
import type {
  DiscoveryResult,
  SearchSortField,
  AIIntentPlan,
  DashboardSummary,
  SonarrLibraryItem,
  RadarrLibraryItem,
} from '@/types'

// Utility imports
import { getBackendUrl, getLocalToolUrl } from '@/utils/backend'
import { showRouteTransitionOverlay, hideRouteTransitionOverlay } from '@/utils/transitionOverlay'
import {
  normalizeIdQuery,
  formatSize,
} from '@/utils/formatting'

// Custom hooks
import {
  useBackendApiSetup,
  useSettings,
  useDiscoverySearch,
  useAiIntentSearch,
  useSabPolling,
  useClickOutside,
} from '@/hooks'

// Component imports
import {
  DetailModal,
  MediaCardGrid,
  MediaCardList,
  NavigationMenu,
  SearchPanel,
  ProjectorIcon,
  TvIcon,
  ArrowUpLineIcon,
  ArrowDownLineIcon,
  SearchIcon,
  ReelIcon,
} from '@/components'

function HomeContent() {
  const router = useRouter()

  // Backend API setup (health, config, integrations)
  const { config, setConfig, integrationsStatus } = useBackendApiSetup()

  // Derived values from config
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)
  const availableAiProviders = config?.ai.available_providers ?? []
  const selectedAiProvider = (config?.ai.provider ?? '').toLowerCase()
  const aiEnabled = Boolean(
    config?.features.ai_suggestions &&
    selectedAiProvider &&
    availableAiProviders.includes(selectedAiProvider)
  )
  const dashboardConfig = config?.dashboard ?? {
    show_sonarr: true,
    show_radarr: true,
    show_sabnzbd: true,
    show_plex: false,
  }

  // Local UI state (declared early as hooks depend on these)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const searchPanelRef = useRef<HTMLDivElement | null>(null)
  const topSearchAnchorRef = useRef<HTMLDivElement | null>(null)
  const [aiTranslation, setAiTranslation] = useState<string | null>(null)
  const [showAiAvailability, setShowAiAvailability] = useState(false)
  const [aiModalSearchBusy, setAiModalSearchBusy] = useState(false)
  const [libraryFlowBusy, setLibraryFlowBusy] = useState(false)
  const [libraryFlowError, setLibraryFlowError] = useState<string | null>(null)
  const [activeDiscoverySearchKey, setActiveDiscoverySearchKey] = useState<string | null>(null)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [trendingItemsByType, setTrendingItemsByType] = useState<Record<'all' | 'movie' | 'tv', DiscoveryResult[]>>({
    all: [],
    movie: [],
    tv: [],
  })
  const [trendingLoading, setTrendingLoading] = useState(false)
  const [trendingErrorByType, setTrendingErrorByType] = useState<Record<'all' | 'movie' | 'tv', string | null>>({
    all: null,
    movie: null,
    tv: null,
  })
  const [trendingSourceByType, setTrendingSourceByType] = useState<Record<'all' | 'movie' | 'tv', 'justwatch' | 'tmdb' | null>>({
    all: null,
    movie: null,
    tv: null,
  })
  const [trendingFilter, setTrendingFilter] = useState<'all' | 'movie' | 'tv'>('all')
  const [topSearchViewportTop, setTopSearchViewportTop] = useState(64)
  const [searchPanelHeight, setSearchPanelHeight] = useState(0)

  // Discovery search (query, filters, results, pagination)
  const {
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    page: _page,
    setPage,
    searchResults,
    searching,
    submittingSearch,
    searchError,
    selectedResult,
    setSelectedResult,
    submitSearch,
    searchInputRef,
  } = useDiscoverySearch()

  // AI intent search
  const {
    plan: aiIntentPlan,
    busy: aiIntentBusy,
    error: aiIntentError,
    enabled: aiIntentEnabled,
    setEnabled: setAiIntentEnabled,
    execute: executeAiIntent,
    clear: clearAiIntent,
  } = useAiIntentSearch(aiEnabled)

  const aiModalResult = useMemo(() => {
    if (!aiIntentPlan || !searchResults?.results?.length) return null
    const intent = aiIntentPlan.intent
    const availability = aiIntentPlan.availability
    const results = searchResults.results

    if (intent.media_type === 'movie' && availability?.tmdb_id) {
      const match = results.find((item) => item.tmdb_id === availability.tmdb_id)
      if (match) return match
    }

    const intentTitle = (availability?.title || intent.title || '').trim().toLowerCase()
    if (intentTitle) {
      const match = results.find((item) => (item.title || '').trim().toLowerCase() === intentTitle)
      if (match) return match
    }

    return results[0] || null
  }, [aiIntentPlan, searchResults])

  useEffect(() => {
    const controller = new AbortController()
    const fetchSummary = async () => {
      setDashboardLoading(true)
      setDashboardError(null)
      try {
        const backendUrl = getBackendUrl()
        const res = await fetch(`${backendUrl}/dashboard/summary`, { signal: controller.signal })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          setDashboardError(errorData.detail || 'Unable to load dashboard summary')
          return
        }
        const data = await res.json()
        setDashboardSummary(data)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setDashboardError('Unable to load dashboard summary')
      } finally {
        setDashboardLoading(false)
      }
    }

    void fetchSummary()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!config) return
    let cancelled = false
    const controller = new AbortController()

    const loadTrending = async () => {
      setTrendingLoading(true)
      setTrendingErrorByType((prev) => ({ ...prev, [trendingFilter]: null }))
      setTrendingSourceByType((prev) => ({ ...prev, [trendingFilter]: null }))
      try {
        const backendUrl = getBackendUrl()
        const trendingLimit = 24

        const mapJustWatch = (items: Array<Record<string, unknown>>) => (
          (items ?? [])
            .map((item) => {
              const title = String(item.title || '').trim()
              if (!title) return null
              const typeRaw = String(item.media_type || '')
              const type: 'movie' | 'tv' = typeRaw === 'tv' ? 'tv' : 'movie'
              const yearRaw = item.year
              const year = Number.isFinite(yearRaw as number) ? Number(yearRaw) : undefined
              const objectIdRaw = Number(item.object_id)
              return {
                type,
                title,
                year,
                overview: String(item.overview || ''),
                poster: String(item.poster_url || item.backdrop_url || '') || undefined,
                status: 'not_in_library',
                tmdb_id: type === 'movie' && Number.isFinite(objectIdRaw) ? objectIdRaw : undefined,
                external_url: String(item.link || '').trim() || undefined,
              } as DiscoveryResult
            })
            .filter((item: DiscoveryResult | null): item is DiscoveryResult => Boolean(item))
        )

        const mapTmdb = (items: Array<Record<string, unknown>>, requestedType: 'all' | 'movie' | 'tv') => (
          (items ?? [])
            .slice(0, trendingLimit)
            .map((item) => {
              const title = String(item.title || item.name || '').trim()
              if (!title) return null
              const typeRaw = String(item.media_type || '')
              const type: 'movie' | 'tv' =
                requestedType === 'all'
                  ? (typeRaw === 'tv' ? 'tv' : 'movie')
                  : requestedType
              const dateRaw = String(item.release_date || item.first_air_date || '')
              const year = /^\d{4}/.test(dateRaw) ? Number(dateRaw.slice(0, 4)) : undefined
              const posterPath = String(item.poster_path || '')
              const tmdbId = Number(item.id)
              return {
                type,
                title,
                year,
                overview: String(item.overview || ''),
                poster: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : undefined,
                status: 'not_in_library',
                tmdb_id: Number.isFinite(tmdbId) ? tmdbId : undefined,
              } as DiscoveryResult
            })
            .filter((item: DiscoveryResult | null): item is DiscoveryResult => Boolean(item))
        )

        const loadForType = async (mediaType: 'all' | 'movie' | 'tv') => {
          let source: 'justwatch' | 'tmdb' | null = null
          let error: string | null = null
          let mapped: DiscoveryResult[] = []
          let toppedUpFromFallback = false

          const dedupeKey = (item: DiscoveryResult) => {
            const normalizedTitle = item.title.trim().toLowerCase()
            if (item.type === 'movie' && item.tmdb_id) return `movie:tmdb:${item.tmdb_id}`
            if (item.type === 'tv' && item.tvdb_id) return `tv:tvdb:${item.tvdb_id}`
            return `${item.type}:title:${normalizedTitle}:${item.year ?? ''}`
          }

          const mergeUnique = (primary: DiscoveryResult[], secondary: DiscoveryResult[]) => {
            const seen = new Set(primary.map(dedupeKey))
            const merged = [...primary]
            for (const item of secondary) {
              const key = dedupeKey(item)
              if (seen.has(key)) continue
              seen.add(key)
              merged.push(item)
              if (merged.length >= trendingLimit) break
            }
            return merged
          }

          try {
            const justWatchRes = await fetch(`${backendUrl}/justwatch/popular?media_type=${mediaType}&limit=${trendingLimit}`, {
              signal: controller.signal,
            })
            if (justWatchRes.ok) {
              const data = await justWatchRes.json()
              mapped = mapJustWatch(data.results ?? [])
              if (mapped.length > 0) source = 'justwatch'
            }
          } catch {
            // Fall back to TMDB below.
          }

          if (mapped.length < trendingLimit) {
            const tmdbRes = await fetch(`${backendUrl}/tmdb/trending?media_type=${mediaType}&time_window=week`, {
              signal: controller.signal,
            })
            if (tmdbRes.status === 503) {
              return { source, error: 'Trending feed unavailable (TMDB not configured).', items: [] as DiscoveryResult[] }
            }
            if (!tmdbRes.ok) {
              const errorData = await tmdbRes.json().catch(() => ({}))
              error = errorData.detail || 'Unable to load trending titles'
            } else {
              const data = await tmdbRes.json()
              const tmdbMapped = mapTmdb(data.results ?? [], mediaType)
              if (mapped.length === 0) {
                mapped = tmdbMapped
                if (mapped.length > 0) source = 'tmdb'
              } else {
                mapped = mergeUnique(mapped, tmdbMapped)
                toppedUpFromFallback = mapped.length > 0
              }
            }
          }

          return {
            source: toppedUpFromFallback && source === 'justwatch' ? 'justwatch' : source,
            error,
            items: mapped.slice(0, trendingLimit),
          }
        }

        const hydrateTrendingStatuses = async (items: DiscoveryResult[]): Promise<DiscoveryResult[]> => {
          const [sonarrRes, radarrRes] = await Promise.all([
            fetch(`${backendUrl}/sonarr/library`, { signal: controller.signal }),
            fetch(`${backendUrl}/radarr/library`, { signal: controller.signal }),
          ])

          const sonarrItems: SonarrLibraryItem[] = sonarrRes.ok ? await sonarrRes.json() : []
          const radarrItems: RadarrLibraryItem[] = radarrRes.ok ? await radarrRes.json() : []

          const moviesByTmdb = new Map<number, RadarrLibraryItem>()
          const moviesByTitleYear = new Map<string, RadarrLibraryItem>()
          for (const movie of radarrItems) {
            if (movie.tmdbId) {
              moviesByTmdb.set(movie.tmdbId, movie)
            }
            const movieKey = `${movie.title.trim().toLowerCase()}::${movie.year ?? ''}`
            moviesByTitleYear.set(movieKey, movie)
          }

          const seriesByTvdb = new Map<number, SonarrLibraryItem>()
          const seriesByTitleYear = new Map<string, SonarrLibraryItem>()
          for (const series of sonarrItems) {
            if (series.tvdbId) {
              seriesByTvdb.set(series.tvdbId, series)
            }
            const seriesKey = `${series.title.trim().toLowerCase()}::${series.year ?? ''}`
            seriesByTitleYear.set(seriesKey, series)
          }

          const getTvStatus = (series: SonarrLibraryItem): DiscoveryResult['status'] => {
            const totalEpisodes = series.totalEpisodeCount ?? series.episodeCount ?? 0
            const downloadedEpisodes = series.episodeFileCount ?? 0
            if (totalEpisodes > 0 && downloadedEpisodes >= totalEpisodes) return 'downloaded'
            if (downloadedEpisodes > 0) return 'partial'
            return 'in_library'
          }

          const hydrateItem = (item: DiscoveryResult): DiscoveryResult => {
            if (item.type === 'movie') {
              const matchedMovie = (item.tmdb_id ? moviesByTmdb.get(item.tmdb_id) : undefined)
                ?? moviesByTitleYear.get(`${item.title.trim().toLowerCase()}::${item.year ?? ''}`)
              if (!matchedMovie) {
                return { ...item, status: 'not_in_library' }
              }
              return {
                ...item,
                status: matchedMovie.hasFile ? 'downloaded' : 'in_library',
                tmdb_id: item.tmdb_id ?? matchedMovie.tmdbId,
              }
            }

            const matchedSeries = (item.tvdb_id ? seriesByTvdb.get(item.tvdb_id) : undefined)
              ?? seriesByTitleYear.get(`${item.title.trim().toLowerCase()}::${item.year ?? ''}`)
            if (!matchedSeries) {
              return { ...item, status: 'not_in_library' }
            }
            return {
              ...item,
              status: getTvStatus(matchedSeries),
              tvdb_id: item.tvdb_id ?? matchedSeries.tvdbId,
            }
          }

          return items.map(hydrateItem)
        }

        const result = await loadForType(trendingFilter)

        let statusHydratedItems = result.items
        try {
          statusHydratedItems = await hydrateTrendingStatuses(result.items)
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.warn('[trending-status-hydration] Falling back to default status map', err)
          }
        }

        if (!cancelled) {
          setTrendingItemsByType((prev) => ({ ...prev, [trendingFilter]: statusHydratedItems }))
          setTrendingSourceByType((prev) => ({ ...prev, [trendingFilter]: result.source ?? null }))
          setTrendingErrorByType((prev) => ({ ...prev, [trendingFilter]: result.error ?? null }))
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load trending titles'
          setTrendingErrorByType((prev) => ({ ...prev, [trendingFilter]: message }))
        }
      } finally {
        if (!cancelled) setTrendingLoading(false)
      }
    }

    void loadTrending()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [config, trendingFilter])

  // Close menu when clicking outside
  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  // When AI intent returns, show translation and optionally show modal
  useEffect(() => {
    if (!aiIntentPlan || !aiIntentPlan.intent) return

    const intent = aiIntentPlan.intent
    if (!intent.title) return

    console.log('[AI Intent Effect] Processing intent')

    // Build AI translation display string
    let translation = intent.title
    if (intent.season) translation += ` S${String(intent.season).padStart(2, '0')}`
    if (intent.episode) translation += `E${String(intent.episode).padStart(2, '0')}`
    if (aiIntentPlan.availability?.year) translation += ` • ${aiIntentPlan.availability.year}`
    if (intent.episode_date) translation += ` • ${intent.episode_date}`

    setAiTranslation(translation)
    console.log('[AI Intent Effect] Translation set:', translation)

    // Show modal for confident AI results (movie or tv with known title)
    // Skip modal only if media_type is 'unknown' (AI couldn't determine what user wants)
    const confidence = intent.confidence ?? 1.0
    if (intent.media_type !== 'unknown' && confidence >= 0.5) {
      console.log('[AI Intent Effect] Showing modal and searching for:', intent.title, 'confidence:', confidence)
      setShowAiAvailability(true)
      // Also update the background search to use the show title (not the episode-specific query)
      submitSearch(intent.title)
    } else {
      // Low confidence or unknown media type - just search with the AI title
      console.log('[AI Intent Effect] Low confidence or unknown, searching for:', intent.title)
      submitSearch(intent.title)
    }
  }, [aiIntentPlan])

  const handleTypeToggle = (type: 'movie' | 'tv') => {
    setFilterType(type)
    setPage(1)
  }

  // SABnzbd polling (dashboard only)
  const sabPollingEnabled = sabConfigured && dashboardConfig.show_sabnzbd

  const {
    queue: sabQueue,
  } = useSabPolling(sabPollingEnabled, 2000, config?.sabnzbd?.recent_group_limit ?? 10)

  // Settings
  const {
    discoverySearchPosition: settingsDiscoverySearchPosition,
    setDiscoverySearchPosition: setSettingsDiscoverySearchPosition,
    saveSettings,
  } = useSettings(config, setConfig)

  // View mode (grid/list) from backend config
  const viewMode = (config?.layout?.view_mode as 'grid' | 'list') ?? 'grid'
  const isGridView = viewMode === 'grid'
  const isListView = viewMode === 'list'

  const discoverySearchAtBottom = settingsDiscoverySearchPosition === 'bottom'
  const discoverySearchStickyClass = discoverySearchAtBottom
    ? 'fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] md:w-[calc(100%-4rem)] max-w-5xl'
    : 'fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] md:w-[calc(100%-4rem)] max-w-5xl'
  const discoverySearchStickyStyle = discoverySearchAtBottom
    ? undefined
    : { top: `${topSearchViewportTop}px` }
  const searchContentVisible = Boolean(searching || searchError || searchResults)
  const showTrending = !searchResults


  const handleHome = () => {
    // Note: setSearchQuery, setActiveQuery, setPage, setSelectedResult are managed by useDiscoverySearch
    // These would need to be exposed as a "reset" method from the hook for proper implementation
    // For now, we'll work around it by direct navigation
    clearAiIntent()
    window.location.href = '/' // Force full reset via navigation
  }

  useEffect(() => {
    if (discoverySearchAtBottom) return

    const updateTop = () => {
      const anchor = topSearchAnchorRef.current
      if (!anchor) return
      const minTop = 64
      const nextTop = Math.max(minTop, Math.round(anchor.getBoundingClientRect().top))
      setTopSearchViewportTop((prev) => (prev === nextTop ? prev : nextTop))
    }

    updateTop()
    window.addEventListener('scroll', updateTop, { passive: true })
    window.addEventListener('resize', updateTop)

    return () => {
      window.removeEventListener('scroll', updateTop)
      window.removeEventListener('resize', updateTop)
    }
  }, [discoverySearchAtBottom, dashboardLoading, dashboardError, searchContentVisible])

  useEffect(() => {
    const measure = () => {
      const node = searchPanelRef.current
      if (!node) return
      const next = Math.ceil(node.getBoundingClientRect().height)
      setSearchPanelHeight((prev) => (prev === next ? prev : next))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [discoverySearchAtBottom, searchContentVisible, searchQuery, searching, submittingSearch, aiIntentBusy, sortField, sortDirection, filterType, aiTranslation])

  const handleFindReleases = async (
    result: DiscoveryResult,
    season?: number,
    episode?: number,
    episodeDate?: string,
  ) => {
    const searchKey = result.type === 'movie'
      ? `movie:${result.tmdb_id ?? result.title}`
      : `tv:${result.tvdb_id ?? result.title}`
    setLibraryFlowError(null)
    setActiveDiscoverySearchKey(searchKey)
    setLibraryFlowBusy(true)
    showRouteTransitionOverlay({
      title: 'Opening library title...',
      subtitle: 'Adding to library if needed',
    })
    let navigating = false
    try {
      const shouldEnsure = result.status === 'not_in_library'

      if (shouldEnsure) {
        const backendUrl = getBackendUrl()
        const payload: Record<string, unknown> = {
          type: result.type,
          title: result.title,
        }

        if (result.type === 'movie') {
          if (!result.tmdb_id) {
            throw new Error('Missing TMDB ID for movie')
          }
          payload.tmdb_id = result.tmdb_id
        } else {
          if (!result.tvdb_id) {
            throw new Error('Missing TVDB ID for TV series')
          }
          payload.tvdb_id = result.tvdb_id
        }

        const ensureRes = await fetch(`${backendUrl}/library/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!ensureRes.ok) {
          const errorData = await ensureRes.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Failed to add title to library')
        }
      }

      const params = new URLSearchParams()
      if (result.type === 'movie') {
        if (!result.tmdb_id) {
          throw new Error('Missing TMDB ID for movie')
        }
        params.set('tmdb', String(result.tmdb_id))
        params.set('action', 'search')
      } else {
        if (!result.tvdb_id) {
          throw new Error('Missing TVDB ID for TV series')
        }
        params.set('tvdb', String(result.tvdb_id))
        if (typeof season === 'number' && Number.isFinite(season) && season > 0) {
          params.set('season', String(season))
        }
        if (typeof episode === 'number' && Number.isFinite(episode) && episode > 0) {
          params.set('episode', String(episode))
        }
        if (episodeDate) {
          params.set('episodeDate', episodeDate)
        }
      }

      navigating = true
      router.push(`/library?${params.toString()}`)
    } catch (err) {
      setLibraryFlowError(err instanceof Error ? err.message : 'Failed to open library title')
    } finally {
      if (!navigating) {
        hideRouteTransitionOverlay()
        setActiveDiscoverySearchKey(null)
      }
      setLibraryFlowBusy(false)
    }
  }

  const handleSubmitSearch = async (
    overrideQuery?: string,
    options?: { keepAiModal?: boolean },
  ) => {
    const rawQuery = overrideQuery ?? searchQuery
    const trimmed = rawQuery.trim()
    if (!trimmed) return
    if (overrideQuery && trimmed !== searchQuery) {
      setSearchQuery(trimmed)
    }

    const normalized = normalizeIdQuery(trimmed)
    const query = normalized.query

    // Update filter type if forced by ID query
    if (normalized.forcedType && filterType !== normalized.forcedType) {
      setFilterType(normalized.forcedType)
    }

    // Clear AI state from previous search
    if (!options?.keepAiModal) {
      clearAiIntent()
      setAiTranslation(null)
      setShowAiAvailability(false)
    }

    // If ID query or AI disabled, do search immediately
    if (normalized.isIdQuery || !aiEnabled || !aiIntentEnabled) {
      submitSearch(overrideQuery ? trimmed : undefined)
      return
    }

    // Otherwise, wait for AI to translate the query first
    // The useEffect will trigger the search when AI returns
    executeAiIntent(query)
  }

  // Handler for when user confirms AI suggestion (routes to library detail flow)
  const handleAiConfirm = async (plan: AIIntentPlan) => {
    setShowAiAvailability(false)
    setLibraryFlowError(null)

    const intent = plan.intent
    if (!intent.title) return

    // Infer media type if unknown - if we have season/episode info, it's TV
    let mediaType = intent.media_type
    if (mediaType === 'unknown') {
      mediaType = (intent.season || intent.episode) ? 'tv' : 'movie'
      console.log('[handleAiConfirm] Inferred media_type:', mediaType)
    }

    console.log('[handleAiConfirm] Starting intent for:', intent.title)

    // First, do a lookup to get full metadata (including tvdb_id for TV shows)
    try {
      const backendUrl = getBackendUrl()
      const lookupUrl = `${backendUrl}/lookup?type=${mediaType}&query=${encodeURIComponent(intent.title)}`
      console.log('[handleAiConfirm] Lookup URL:', lookupUrl)

      const lookupRes = await fetch(lookupUrl)

      if (!lookupRes.ok) {
        const errorData = await lookupRes.json().catch(() => ({}))
        console.error('[handleAiConfirm] Lookup failed:', lookupRes.status, errorData)
        return
      }

      const lookupData = await lookupRes.json()
      console.log(
        '[handleAiConfirm] Lookup results:',
        Array.isArray(lookupData.results) ? lookupData.results.length : 0
      )

      const topResult = Array.isArray(lookupData.results) ? lookupData.results[0] : null

      if (!topResult) {
        console.error('[handleAiConfirm] No lookup results found')
        return
      }

      console.log('[handleAiConfirm] Top result title:', topResult.title)

      // Ensure the result has the correct type and status fields
      const resultWithType = {
        ...topResult,
        type: mediaType as 'movie' | 'tv',
        status: aiModalResult?.status || topResult.status || 'not_in_library' as const,
      }

      console.log('[handleAiConfirm] Result type set:', resultWithType.type)

      // Route through the same discovery flow: ensure library, then deeplink to library detail.
      await handleFindReleases(
        resultWithType,
        intent.season || undefined,
        intent.episode || undefined,
        intent.episode_date || undefined
      )
    } catch (err) {
      console.error('[handleAiConfirm] Error:', err)
    }
  }


  const sabQueueCount = (() => {
    if (!sabConfigured) return null
    if (!sabQueue) return null
    return sabQueue.jobs.length
  })()

  const formatDownloadTotals = (today: number | null, month: number | null) => {
    if (today === null || month === null) return '—'
    const todayGb = today / (1024 ** 3)
    const monthGb = month / (1024 ** 3)
    return `${todayGb.toFixed(2)}/${monthGb.toFixed(1)}`
  }


  const toolIcons = {
    sonarr: '/logos/tools/sonarr.svg',
    radarr: '/logos/tools/radarr.svg',
    sabnzbd: '/logos/tools/sabnzbd.svg',
    plex: '/logos/tools/plex.svg',
  }

  const toolLinks = {
    sonarr: {
      label: 'TV',
      url: config?.integrations?.sonarr_url || getLocalToolUrl(8989),
      iconUrl: toolIcons.sonarr,
      status: integrationsStatus?.sonarr?.status === 'ok',
    },
    radarr: {
      label: 'Movies',
      url: config?.integrations?.radarr_url || getLocalToolUrl(7878),
      iconUrl: toolIcons.radarr,
      status: integrationsStatus?.radarr?.status === 'ok',
    },
    sabnzbd: {
      label: 'D/Ls',
      url: config?.integrations?.sabnzbd_url || getLocalToolUrl(8080),
      iconUrl: toolIcons.sabnzbd,
      status: integrationsStatus?.sabnzbd?.status === 'ok',
    },
    plex: {
      label: 'Plex',
      url: config?.integrations?.plex_url || getLocalToolUrl(32400, '/web'),
      iconUrl: toolIcons.plex,
      status: integrationsStatus?.plex?.status === 'ok',
    },
  }

  const dashboardEnabledCount = [
    dashboardConfig.show_sonarr,
    dashboardConfig.show_radarr,
    dashboardConfig.show_sabnzbd,
    dashboardConfig.show_plex,
  ].filter(Boolean).length

  const dashboardCardCount = Math.max(dashboardEnabledCount, 1)

  const CountIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h1" />
      <path d="M3 12h1" />
      <path d="M3 18h1" />
    </svg>
  )

  const DiskIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </svg>
  )

  const filteredTrendingItems = useMemo(() => {
    return trendingItemsByType[trendingFilter] ?? []
  }, [trendingFilter, trendingItemsByType])
  const activeTrendingSource = trendingSourceByType[trendingFilter]
  const activeTrendingError = trendingErrorByType[trendingFilter]

  const trendingSourceLogo = (() => {
    const normalized = (activeTrendingSource ?? '').trim().toLowerCase()
    if (normalized.includes('justwatch')) return '/logos/ratings/justwatch.svg'
    if (normalized.includes('tvdb')) return '/logos/ratings/tvdb.svg'
    return null
  })()

  const getTrendingExternalUrl = (result: DiscoveryResult): string => {
    if (result.external_url) {
      return result.external_url
    }

    const source = (activeTrendingSource ?? '').trim().toLowerCase()
    const query = encodeURIComponent(result.title)

    if (source.includes('justwatch')) {
      const country = (config?.user?.country || 'CA').toLowerCase()
      return `https://www.justwatch.com/${country}/search?q=${query}`
    }

    if (result.tmdb_id) {
      const baseType = result.type === 'movie' ? 'movie' : 'tv'
      return `https://www.themoviedb.org/${baseType}/${result.tmdb_id}`
    }

    return `https://www.themoviedb.org/search?query=${query}`
  }

  const trendingExternalLabel = (activeTrendingSource ?? '').trim().toLowerCase().includes('justwatch')
    ? 'View on JustWatch'
    : 'View on TMDB'

  const trendingSection = (
    <section id="discover-trending" className="mb-4">
      <div className="glass-panel rounded-lg p-3 md:p-4 border border-slate-700/40 min-h-[clamp(16rem,48vh,32rem)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-200">Trending Now</h2>
              {activeTrendingSource && (
                <span className="inline-flex items-center rounded bg-slate-800/70 px-1.5 py-0.5">
                  {trendingSourceLogo ? (
                    <img
                      src={trendingSourceLogo}
                      alt={activeTrendingSource}
                      className="h-3.5 w-auto"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-slate-300">{activeTrendingSource}</span>
                  )}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              View-only list. Open titles on source sites for details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setTrendingFilter('all')}
                className={`px-2 py-1 rounded text-xs ${trendingFilter === 'all' ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTrendingFilter('movie')}
                className={`px-2 py-1 rounded text-xs ${trendingFilter === 'movie' ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Movies
              </button>
              <button
                type="button"
                onClick={() => setTrendingFilter('tv')}
                className={`px-2 py-1 rounded text-xs ${trendingFilter === 'tv' ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Series
              </button>
            </div>
            <div className="flex gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg p-1">
              <button
                type="button"
                onClick={async () => {
                  await saveSettings({ view_mode: 'grid' })
                }}
                className={`px-2 py-1 rounded transition ${
                  isGridView ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grid view"
                aria-label="Grid view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await saveSettings({ view_mode: 'list' })
                }}
                className={`px-2 py-1 rounded transition ${
                  isListView ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="List view"
                aria-label="List view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {trendingLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={`trending-skel-${idx}`} className="h-[300px] rounded-xl bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        )}

        {!trendingLoading && activeTrendingError && (
          <div className="text-sm text-amber-300">{activeTrendingError}</div>
        )}

        {!trendingLoading && !activeTrendingError && filteredTrendingItems.length === 0 && (
          <div className="text-sm text-slate-500">No trending titles for the current filter.</div>
        )}

        {!trendingLoading && filteredTrendingItems.length > 0 && (
          <>
            {isGridView && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 md:gap-4">
                {filteredTrendingItems.map((result, index) => (
                  <div
                    key={`trend-grid-${result.type}-${result.tmdb_id ?? result.tvdb_id ?? result.title}-${index}`}
                    className="opacity-0 animate-fade-in"
                    style={{ animationDelay: `${index * 20}ms`, animationFillMode: 'forwards' }}
                  >
                    <MediaCardGrid
                      item={{ source: 'discovery', data: result }}
                      discoveryMode="external"
                      externalUrl={getTrendingExternalUrl(result)}
                      externalLabel={trendingExternalLabel}
                    />
                  </div>
                ))}
              </div>
            )}
            {isListView && (
              <div className="grid gap-2">
                {filteredTrendingItems.map((result, index) => (
                  <MediaCardList
                    key={`trend-list-${result.type}-${result.tmdb_id ?? result.tvdb_id ?? result.title}-${index}`}
                    item={{ source: 'discovery', data: result }}
                    discoveryMode="external"
                    externalUrl={getTrendingExternalUrl(result)}
                    externalLabel={trendingExternalLabel}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )

  return (
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="home"
        config={config}
        onHomeClick={handleHome}
      />

      <div className="max-w-5xl mx-auto">
        {dashboardEnabledCount > 0 && (
          <section id="dashboard" className="mb-4">
            <div className="glass-panel rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-300">At a glance</h2>
                <a
                  href="/library"
                  className="text-sm text-slate-300 hover:text-cyan-200 transition-colors px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60"
                >
                  Library
                </a>
              </div>
              {dashboardLoading && (
                <div className="text-sm text-gray-500 mb-2">Updating…</div>
              )}
              {dashboardError && (
                <div className="text-sm text-amber-300 mb-3">{dashboardError}</div>
              )}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${dashboardCardCount}, minmax(0, 1fr))` }}
              >
                {dashboardConfig.show_sonarr && (
                  <a
                    href={toolLinks.sonarr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 border bg-emerald-500/15 border-emerald-400/40 hover:bg-emerald-500/20 transition-colors"
                  >
                    <div className="text-sm font-semibold text-emerald-100 inline-flex items-center gap-2">
                      <img
                        src={toolLinks.sonarr.iconUrl}
                        alt="Sonarr icon"
                        className={`h-4 w-4 object-contain ${toolLinks.sonarr.status === false ? 'opacity-40 grayscale' : ''}`}
                        loading="lazy"
                      />
                      <span>{toolLinks.sonarr.label}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs leading-tight text-emerald-100/80 tabular-nums min-w-0">
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <CountIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Series count / episode count">
                          {dashboardSummary?.sonarr?.configured
                            ? `${dashboardSummary.sonarr.series_count} / ${dashboardSummary.sonarr.episode_count}`
                            : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <DiskIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Total size on disk">
                          {dashboardSummary?.sonarr?.configured ? formatSize(dashboardSummary.sonarr.size_on_disk) : '—'}
                        </span>
                      </div>
                    </div>
                  </a>
                )}
                {dashboardConfig.show_radarr && (
                  <a
                    href={toolLinks.radarr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 border bg-sky-500/15 border-sky-400/40 hover:bg-sky-500/20 transition-colors"
                  >
                    <div className="text-sm font-semibold text-sky-100 inline-flex items-center gap-2">
                      <img
                        src={toolLinks.radarr.iconUrl}
                        alt="Radarr icon"
                        className={`h-4 w-4 object-contain ${toolLinks.radarr.status === false ? 'opacity-40 grayscale' : ''}`}
                        loading="lazy"
                      />
                      <span>{toolLinks.radarr.label}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs leading-tight text-sky-100/80 tabular-nums min-w-0">
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <CountIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Downloaded movies / total movies">
                          {dashboardSummary?.radarr?.configured
                            ? `${dashboardSummary.radarr.movie_files_count} / ${dashboardSummary.radarr.movies_count}`
                            : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <DiskIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Total size on disk">
                          {dashboardSummary?.radarr?.configured ? formatSize(dashboardSummary.radarr.size_on_disk) : '—'}
                        </span>
                      </div>
                    </div>
                  </a>
                )}
                {dashboardConfig.show_sabnzbd && (
                  <a
                    href={toolLinks.sabnzbd.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 border bg-amber-500/15 border-amber-400/40 hover:bg-amber-500/20 transition-colors"
                  >
                    <div className="text-sm font-semibold text-amber-100 inline-flex items-center gap-2">
                      <img
                        src={toolLinks.sabnzbd.iconUrl}
                        alt="SABnzbd icon"
                        className={`h-4 w-4 object-contain ${toolLinks.sabnzbd.status === false ? 'opacity-40 grayscale' : ''}`}
                        loading="lazy"
                      />
                      <span>{toolLinks.sabnzbd.label}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs leading-tight text-amber-100/80 tabular-nums min-w-0">
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <CountIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Queue items">
                          {sabQueueCount !== null ? sabQueueCount : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <DiskIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Downloaded today / this month">
                          {dashboardSummary?.sabnzbd?.configured
                            ? formatDownloadTotals(dashboardSummary.sabnzbd.download_today, dashboardSummary.sabnzbd.download_month)
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </a>
                )}
                {dashboardConfig.show_plex && (
                  <a
                    href={toolLinks.plex.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 border bg-yellow-500/15 border-yellow-400/40 hover:bg-yellow-500/20 transition-colors"
                  >
                    <div className="text-sm font-semibold text-yellow-100 inline-flex items-center gap-2">
                      <img
                        src={toolLinks.plex.iconUrl}
                        alt="Plex icon"
                        className="h-4 w-4 object-contain"
                        loading="lazy"
                      />
                      <span>{toolLinks.plex.label}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs leading-tight text-yellow-100/80 tabular-nums min-w-0">
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <CountIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Recently added items">
                          {dashboardSummary?.plex?.configured ? dashboardSummary.plex.recently_added : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-2 min-w-0">
                        <CountIcon className="h-3 w-3" />
                        <span className="min-w-0 truncate whitespace-nowrap" title="Active streams">
                          {dashboardSummary?.plex?.configured ? dashboardSummary.plex.active_streams : '—'}
                        </span>
                      </div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Search Section */}
        {(() => {
          const searchPanel = (
              <SearchPanel
                panelRef={searchPanelRef}
                stickyClass={discoverySearchStickyClass}
                stickyStyle={discoverySearchStickyStyle}
                headerTitle={searchResults?.query ? `Results for "${searchResults.query}"` : 'Search'}
                headerRightInline={searchResults && searchResults.results.length > 0 ? (
                  <div className="flex gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await saveSettings({ view_mode: 'grid' })
                      }}
                      className={`px-2 py-1 rounded transition ${
                        isGridView ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Grid view"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await saveSettings({ view_mode: 'list' })
                      }}
                      className={`px-2 py-1 rounded transition ${
                        isListView ? 'bg-cyan-500/80 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="List view"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                ) : undefined}
                toggle={{
                  onClick: () => {
                    const next = discoverySearchAtBottom ? 'top' : 'bottom'
                    setSettingsDiscoverySearchPosition(next)
                    void saveSettings({ discovery_search_position: next })
                  },
                  title: discoverySearchAtBottom ? 'Pin search to top' : 'Pin search to bottom',
                  ariaLabel: discoverySearchAtBottom ? 'Pin search to top' : 'Pin search to bottom',
                  icon: discoverySearchAtBottom ? (
                    <ArrowUpLineIcon className="h-4 w-4" />
                  ) : (
                    <ArrowDownLineIcon className="h-4 w-4" />
                  ),
                }}
              >
              <form onSubmit={(e) => { e.preventDefault(); handleSubmitSearch(); }} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterType('all')
                      setPage(1)
                    }}
                    className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                      filterType === 'all'
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                    title="All"
                    aria-label="All"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterType('movie')
                      setPage(1)
                    }}
                    className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                      filterType === 'movie'
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                    title="Movies"
                    aria-label="Movies"
                  >
                    <ProjectorIcon className="h-5 w-5" />
                    <span className="sr-only">Movies</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterType('tv')
                      setPage(1)
                    }}
                    className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                      filterType === 'tv'
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                    title="TV Shows"
                    aria-label="TV Shows"
                  >
                    <TvIcon className="h-5 w-5" />
                    <span className="sr-only">TV Shows</span>
                  </button>
                </div>
                <div className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      // Clear AI translation when user starts typing a new search
                      if (aiTranslation) {
                        setAiTranslation(null)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                      event.preventDefault()
                      void handleSubmitSearch()
                    }}
                    placeholder="Search Movies and TV..."
                    className="w-full bg-slate-900/60 border border-slate-700/60 rounded px-3 py-1.5 pr-8 text-md text-slate-200 placeholder-slate-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        if (aiTranslation) {
                          setAiTranslation(null)
                        }
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={searching || aiIntentBusy || !searchQuery.trim()}
                  className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed px-3 py-1.5 rounded text-xs font-semibold transition-colors inline-flex items-center justify-center"
                  aria-label="Search"
                >
                  {submittingSearch || searching || aiIntentBusy ? (
                    <ReelIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <SearchIcon className="h-4 w-4" />
                  )}
                </button>
              </div>

              {aiTranslation ? (
                <div className="text-xs text-slate-300">{aiTranslation}</div>
              ) : null}

              <details>
                <summary className="text-xs text-slate-300 cursor-pointer select-none">
                  Filters/Sorting
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <label className="text-slate-400">Sort</label>
                  <select
                    value={sortField}
                    onChange={(event) => {
                      setSortField(event.target.value as SearchSortField)
                      setPage(1)
                    }}
                    className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-xs"
                  >
                    <option value="added">Added</option>
                    <option value="imdbRating">IMDb Rating</option>
                    <option value="popularity">Popularity</option>
                    <option value="releaseDate">Release Date</option>
                    <option value="size">Size on Disk</option>
                    <option value="title">Title</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="px-2 py-1 rounded bg-slate-800/60"
                  >
                    {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={aiIntentEnabled}
                      onChange={(event) => {
                        const next = event.target.checked
                        setAiIntentEnabled(next)
                        try {
                          window.localStorage.setItem('ai_intent_enabled', String(next))
                        } catch {
                          // Ignore storage errors.
                        }
                      }}
                    />
                    AI intent parsing
                  </label>
                  {aiIntentBusy && (
                    <span className="text-amber-300">AI: interpreting your request...</span>
                  )}
                  {aiIntentError && (
                    <span className="text-red-400">AI: {aiIntentError}</span>
                  )}
                  {!aiIntentEnabled && (
                    <span className="text-gray-500">AI search disabled</span>
                  )}
                </div>
              </details>
                </form>
              </SearchPanel>
            )

          const searchContent = (
            <>
          {searchError && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
              <p className="text-red-300">{searchError}</p>
            </div>
          )}

          {searching && (
            <div className="glass-panel rounded-lg p-8 text-center mb-4">
              <div className="flex flex-col items-center gap-4">
                <img
                  src="/reel.png"
                  alt="Loading"
                  className="w-16 h-16 brightness-0 invert"
                  style={{
                    animation: 'spin 2s linear infinite, zoom 2.5s ease-in-out infinite alternate'
                  }}
                />
                <div className="text-white">Searching titles...</div>
              </div>
              <style jsx>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes zoom {
                  from { transform: scale(0.9) rotate(0deg); }
                  to { transform: scale(1.1) rotate(360deg); }
                }
              `}</style>
            </div>
          )}

          {searchResults && (
            <div className="mb-4">
              {searchResults.results.length === 0 ? (
                <div className="glass-panel rounded-lg p-6 text-center text-gray-400">
                  No results found
                </div>
              ) : (
                <>
                  {isGridView && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 md:gap-4">
                      {searchResults.results.map((result, index) => (
                        <div
                          key={result.tmdb_id || result.tvdb_id || index}
                          className="opacity-0 animate-fade-in"
                          style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'forwards' }}
                        >
                          <MediaCardGrid
                            item={{ source: 'discovery', data: result }}
                            onClick={() => setSelectedResult(result)}
                            onShowReleases={handleFindReleases}
                            discoverySearchBusy={
                              activeDiscoverySearchKey === (
                                result.type === 'movie'
                                  ? `movie:${result.tmdb_id ?? result.title}`
                                  : `tv:${result.tvdb_id ?? result.title}`
                              )
                            }
                            onTypeToggle={handleTypeToggle}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {isListView && (
                    <div className="grid gap-2">
                      {searchResults.results.map((result) => (
                        <MediaCardList
                          key={result.tmdb_id || result.tvdb_id}
                          item={{ source: 'discovery', data: result }}
                          onClick={() => setSelectedResult(result)}
                          onShowReleases={handleFindReleases}
                          discoverySearchBusy={
                            activeDiscoverySearchKey === (
                              result.type === 'movie'
                                ? `movie:${result.tmdb_id ?? result.title}`
                                : `tv:${result.tvdb_id ?? result.title}`
                            )
                          }
                          onTypeToggle={handleTypeToggle}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

            </div>
          )}
            </>
          )

          if (discoverySearchAtBottom) {
            return (
              <>
                {searchContentVisible ? (
                  <section id="search" className="scroll-mt-24">
                    {searchContent}
                  </section>
                ) : null}
                {searchPanel}
              </>
            )
          }

          return (
            <>
              <div ref={topSearchAnchorRef} className="h-0" />
              {searchPanel}
              {searchContentVisible ? (
                <section id="search" className="scroll-mt-24" style={{ paddingTop: searchPanelHeight > 0 ? `${searchPanelHeight}px` : undefined }}>
                  {searchContent}
                </section>
              ) : null}
            </>
          )
        })()}

        {!discoverySearchAtBottom && !searchContentVisible && searchPanelHeight > 0 ? (
          <div aria-hidden="true" style={{ height: `${searchPanelHeight}px` }} />
        ) : null}

        {!discoverySearchAtBottom && showTrending && trendingSection}

        {discoverySearchAtBottom && showTrending && trendingSection}

      </div>

      {/* Library flow error */}
      {libraryFlowError && (
        <div className="fixed inset-0 glass-modal z-50 flex items-center justify-center p-4">
          <div className="glass-panel rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-semibold mb-2">Error</h3>
            <p className="text-gray-300 mb-4">{libraryFlowError}</p>
            <button
              onClick={() => setLibraryFlowError(null)}
              className="bg-slate-700/60 hover:bg-slate-600/60 px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Discovery details modal */}
      {selectedResult && (
        <DetailModal
          mode="discovery"
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onShowReleases={handleFindReleases}
          busy={
            activeDiscoverySearchKey === (
              selectedResult.type === 'movie'
                ? `movie:${selectedResult.tmdb_id ?? selectedResult.title}`
                : `tv:${selectedResult.tvdb_id ?? selectedResult.title}`
            )
          }
        />
      )}

      {/* AI Availability Modal - for specific episode/movie requests */}
      {showAiAvailability && aiIntentPlan && (
        <DetailModal
          mode="ai"
          plan={aiIntentPlan}
          aiResult={aiModalResult || undefined}
          busy={aiIntentBusy || aiModalSearchBusy || libraryFlowBusy}
          onConfirm={handleAiConfirm}
          onSearch={async (query) => {
            setAiModalSearchBusy(true)
            try {
              await handleSubmitSearch(query, { keepAiModal: true })
            } finally {
              setAiModalSearchBusy(false)
            }
          }}
          onClose={() => {
            setShowAiAvailability(false)
            setAiModalSearchBusy(false)
          }}
        />
      )}

    </main>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={(
        <main className="min-h-screen p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            <div className="glass-panel rounded-lg p-8 text-center">
              <div className="text-yellow-400">Loading search…</div>
            </div>
          </div>
        </main>
      )}
    >
      <HomeContent />
    </Suspense>
  )
}
