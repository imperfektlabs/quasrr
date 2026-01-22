'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Type imports
import type {
  HealthStatus,
  ConfigStatus,
  SearchType,
  SearchFilterType,
  SearchStatusFilter,
  SearchSortField,
  SearchSortDirection,
  Rating,
  StreamingService,
  DiscoveryResult,
  SearchResponse,
  Release,
  ReleaseResponse,
  AISuggestion,
  AIIntent,
  AIAvailability,
  AIIntentPlan,
  SabQueueItem,
  SabQueueResponse,
  SabRecentItem,
  SabRecentGroup,
  SabRecentResponse,
  IntegrationStatus,
  IntegrationsStatus,
  SortField,
  SortDirection,
  EpisodeDownloadMap,
  SeasonProgress,
} from '@/types'

// Utility imports
import { getBackendUrl, getLocalToolUrl } from '@/utils/backend'
import { getStreamingLogo, getStreamingLink } from '@/utils/streaming'
import {
  normalizeIdQuery,
  getReleaseKey,
  sortReleasesForAi,
  formatTimestamp,
  formatRating,
  formatRatingSource,
  getRatingLink,
} from '@/utils/formatting'

// Custom hooks
import {
  useBackendApiSetup,
  useSettings,
  useDiscoverySearch,
  useAiIntentSearch,
  useSabPolling,
  useReleaseData,
  useReleaseGrab,
  useAiSuggest,
  useSabActions,
} from '@/hooks'

// Component imports
import {
  ReleaseView,
  AvailabilityModal,
  DiscoveryCard,
  SabQueue,
  SabRecent,
  NavigationMenu,
} from '@/components'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Backend API setup (health, config, integrations)
  const { health, config, setConfig, integrationsStatus, error, loading } = useBackendApiSetup()

  // Derived values from config
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)
  const aiEnabled = Boolean(config?.features.ai_suggestions && config?.ai.api_key)

  // Local UI state (declared early as hooks depend on these)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const [activeSection, setActiveSection] = useState<'search' | 'downloads' | 'status' | 'settings'>('search')
  const [aiTranslation, setAiTranslation] = useState<string | null>(null)
  const [showAiAvailability, setShowAiAvailability] = useState(false)
  const [releaseContext, setReleaseContext] = useState<DiscoveryResult | null>(null)

  // Discovery search (query, filters, results, pagination)
  const {
    searchQuery,
    setSearchQuery,
    activeQuery,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    page,
    setPage,
    searchResults,
    searching,
    submittingSearch,
    searchError,
    selectedResult,
    setSelectedResult,
    submitSearch,
    handleSearch,
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

  useEffect(() => {
    const section = searchParams.get('section')
    if (section === 'search' || section === 'downloads' || section === 'status' || section === 'settings') {
      setActiveSection(section)
    }
  }, [searchParams])

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuButtonRef.current?.contains(target)) return
      if (menuPanelRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [menuOpen])

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

    // Show modal for movies, or TV shows with season/episode/date specified
    if (intent.media_type === 'movie' || (intent.media_type === 'tv' && (intent.season || intent.episode_date))) {
      console.log('[AI Intent Effect] Showing modal and searching for:', intent.title)
      setShowAiAvailability(true)
      // Also update the background search to use the show title (not the episode-specific query)
      submitSearch(intent.title)

      // For TV shows with episode_date, pre-fetch release data to get episode info
      if (intent.media_type === 'tv' && intent.episode_date && intent.title) {
        ;(async () => {
          try {
            const backendUrl = getBackendUrl()
            const lookupUrl = `${backendUrl}/lookup?type=${intent.media_type}&query=${encodeURIComponent(intent.title)}`
            const lookupRes = await fetch(lookupUrl)
            if (lookupRes.ok) {
              const lookupData = await lookupRes.json()
              const topResult = Array.isArray(lookupData.results) ? lookupData.results[0] : null
              if (topResult) {
                const resultWithType = {
                  ...topResult,
                  type: intent.media_type as 'movie' | 'tv'
                }
                // Fetch releases to get episode info
                await fetchReleases(resultWithType, intent.season || undefined, intent.episode || undefined, intent.episode_date || undefined)
              }
            }
          } catch (err) {
            console.error('[AI Intent Effect] Error pre-fetching episode data:', err)
          }
        })()
      }
    } else {
      // For TV shows without season/date, or unknown media type, search with the AI title
      console.log('[AI Intent Effect] Searching for:', intent.title)
      submitSearch(intent.title)
    }
  }, [aiIntentPlan])

  const handleTypeToggle = (type: 'movie' | 'tv') => {
    setFilterType(filterType === type ? 'all' : type)
    setPage(1)
  }

  // SABnzbd polling
  const {
    queue: sabQueue,
    recent: sabRecent,
    loading: sabLoading,
    queueError: sabQueueError,
    recentError: sabRecentError,
    refetch: fetchSabData,
  } = useSabPolling(sabConfigured && activeSection === 'downloads', 2000)

  // SABnzbd actions
  const {
    busy: sabActionBusy,
    error: sabActionError,
    clearError: clearSabActionError,
    pauseAll: pauseSabQueue,
    resumeAll: resumeSabQueue,
    pauseJob: pauseSabJob,
    resumeJob: resumeSabJob,
    deleteJob: deleteSabJob,
  } = useSabActions(fetchSabData)

  // Release data
  const {
    releaseData,
    loading: loadingReleases,
    error: releaseError,
    fetchReleases,
    clear: clearReleaseData,
    clearError: clearReleaseError,
  } = useReleaseData()

  // Release grab
  const {
    busyIds: grabBusyIds,
    feedback: grabFeedback,
    setFeedback: setGrabFeedback,
    grab: grabRelease,
    grabAll: grabAllReleases,
    clear: clearGrabState,
  } = useReleaseGrab(releaseData, sabConfigured, fetchSabData)

  // AI suggestions
  const {
    suggestion: aiSuggestion,
    busy: aiSuggestBusy,
    error: aiSuggestError,
    suggest: getAiSuggestion,
    clear: clearAiSuggestion,
  } = useAiSuggest(releaseData)

  // Settings
  const {
    country: settingsCountry,
    setCountry: setSettingsCountry,
    aiModel: settingsAiModel,
    setAiModel: setSettingsAiModel,
    saving: settingsSaving,
    error: settingsError,
    saved: settingsSaved,
    setSaved: setSettingsSaved,
    streamingBusy: streamingUpdateBusy,
    streamingError: streamingUpdateError,
    toggleStreaming: handleStreamingToggle,
    saveSettings,
  } = useSettings(config, setConfig)


  const handleHome = () => {
    // Note: setSearchQuery, setActiveQuery, setPage, setSelectedResult are managed by useDiscoverySearch
    // These would need to be exposed as a "reset" method from the hook for proper implementation
    // For now, we'll work around it by direct navigation
    clearReleaseData()
    clearAiIntent()
    clearAiSuggestion()
    clearGrabState()
    setActiveSection('search')
    window.location.href = '/' // Force full reset via navigation
  }

  // Note: All duplicate useEffect hooks and API functions removed - now handled by custom hooks
  // runSearch, fetchSabData, backend setup, URL sync, localStorage, etc. are all in hooks

  const handleShowReleases = async (result: DiscoveryResult, season?: number, episode?: number, episodeDate?: string) => {
    // Clear previous state
    setGrabFeedback(null)
    clearAiSuggestion()
    setReleaseContext(result)

    // Fetch releases using the hook
    await fetchReleases(result, season, episode, episodeDate)
  }

  const handleCloseReleaseView = () => {
    clearReleaseData()
    setReleaseContext(null)
  }


  const handleGrabRelease = async (release: Release) => {
    await grabRelease(release)
  }

  const handleGrabAll = async (releases: Release[]) => {
    await grabAllReleases(releases)
  }

  const handleAiSuggest = async (releasesForAi: Release[]) => {
    await getAiSuggestion(releasesForAi)
  }

  const handleSubmitSearch = async () => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    const normalized = normalizeIdQuery(trimmed)
    const query = normalized.query

    // Update filter type if forced by ID query
    if (normalized.forcedType && filterType !== normalized.forcedType) {
      setFilterType(normalized.forcedType)
    }

    // Clear AI state from previous search
    clearAiIntent()
    setAiTranslation(null)
    setShowAiAvailability(false)

    // If ID query or AI disabled, do search immediately
    if (normalized.isIdQuery || !aiEnabled || !aiIntentEnabled) {
      submitSearch()
      return
    }

    // Otherwise, wait for AI to translate the query first
    // The useEffect will trigger the search when AI returns
    executeAiIntent(query)
  }

  // Handler for when user confirms AI suggestion (goes directly to releases)
  const handleAiConfirm = async (plan: AIIntentPlan) => {
    setShowAiAvailability(false)

    const intent = plan.intent
    if (!intent.title || intent.media_type === 'unknown') return

    console.log('[handleAiConfirm] Starting intent for:', intent.title)

    // First, do a lookup to get full metadata (including tvdb_id for TV shows)
    try {
      const backendUrl = getBackendUrl()
      const lookupUrl = `${backendUrl}/lookup?type=${intent.media_type}&query=${encodeURIComponent(intent.title)}`
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
      console.log('[handleAiConfirm] Fetching releases for season:', intent.season ?? 'none')

      // Ensure the result has the correct type field
      const resultWithType = {
        ...topResult,
        type: intent.media_type as 'movie' | 'tv'
      }

      console.log('[handleAiConfirm] Result type set:', resultWithType.type)

      // Now fetch releases with the full result
      // For TV shows, pass season, episode, and episode_date if we have them
      await handleShowReleases(
        resultWithType,
        intent.season || undefined,
        intent.episode || undefined,
        intent.episode_date || undefined
      )
    } catch (err) {
      console.error('[handleAiConfirm] Error:', err)
    }
  }


  const queueSummary = (() => {
    if (sabQueueError) return `Error: ${sabQueueError}`
    if (!sabQueue) return 'Loading queue...'
    const activeCount = sabQueue.jobs.length
    return activeCount > 0 ? `${activeCount} active` : '0 active'
  })()

  const recentSummary = (() => {
    if (sabRecentError) return `Error: ${sabRecentError}`
    if (!sabRecent) return 'Loading recent...'
    const groupCount = sabRecent.groups.length
    return groupCount > 0 ? `${groupCount} group${groupCount === 1 ? '' : 's'}` : 'No recent downloads'
  })()

  const handlePauseAll = () => pauseSabQueue()
  const handleResumeAll = () => resumeSabQueue()
  const handlePauseJob = (jobId: string) => pauseSabJob(jobId)
  const handleResumeJob = (jobId: string) => resumeSabJob(jobId)
  const handleDeleteJob = (jobId: string) => deleteSabJob(jobId)

  return (
    <main className="min-h-screen pt-24 px-4 pb-4 md:px-8 md:pb-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="home"
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        config={config}
        integrationsStatus={integrationsStatus}
        onHomeClick={handleHome}
      />

      <div className="max-w-4xl mx-auto">

        {/* Search Section */}
        {activeSection === 'search' && (
        <section id="search" className="scroll-mt-24">
          <div className="glass-panel rounded-lg p-4 mb-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmitSearch(); }} className="space-y-3">
            <div className="flex gap-2">
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
                placeholder="Search movies and TV shows..."
                className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              />
              <button
                type="submit"
                disabled={searching || aiIntentBusy || !searchQuery.trim()}
                className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                {submittingSearch || searching || aiIntentBusy ? '...' : 'Search'}
              </button>
            </div>

            <div className="flex items-center justify-between mt-1">
              {/* AI Translation Display */}
              {aiTranslation ? (
                <div className="text-xs text-slate-300">
                  {aiTranslation}
                </div>
              ) : (
                <div></div>
              )}

              <details>
                <summary className="text-xs text-slate-300 cursor-pointer select-none">
                  Filters
                </summary>
              <div className="mt-2 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <div>
                  <label className="text-xs text-gray-400">Type</label>
                  <select
                    value={filterType}
                    onChange={(event) => {
                      setFilterType(event.target.value as SearchFilterType)
                      setPage(1)
                    }}
                    className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="movie">Movies</option>
                    <option value="tv">TV Shows</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(event) => {
                      setFilterStatus(event.target.value as SearchStatusFilter)
                      setPage(1)
                    }}
                    className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="not_in_library">Not in library</option>
                    <option value="in_library">In library</option>
                    <option value="downloaded">Downloaded</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Sort</label>
                  <select
                    value={sortField}
                    onChange={(event) => {
                      setSortField(event.target.value as SearchSortField)
                      setPage(1)
                    }}
                    className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="popularity">Popularity</option>
                    <option value="year">Year</option>
                    <option value="title">Title</option>
                    <option value="rating">Rating</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Direction</label>
                  <select
                    value={sortDirection}
                    onChange={(event) => {
                      setSortDirection(event.target.value as SearchSortDirection)
                      setPage(1)
                    }}
                    className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
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
            </div>
          </form>
          </div>
          {!searchResults && !searching && !searchError && (
            <div className="glass-panel rounded-lg p-5 md:p-6 mb-4 relative overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute -top-8 -right-12 h-40 w-40 rounded-full bg-cyan-900/30 blur-2xl" />
                <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-fuchsia-900/30 blur-2xl" />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950/40 via-transparent to-slate-900/40" />
              </div>
              <div className="relative">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Quasrr
                </div>
                <h2 className="mt-2 text-lg md:text-xl font-semibold text-slate-100">
                  Search once. See what you already have. Grab what you do not.
                </h2>
                <p className="mt-2 text-sm text-slate-400 max-w-2xl">
                  Try a title, an IMDB ID, or a quick quote like "s01e03 of The Night Manager".
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="glass-chip px-2 py-1 rounded">imdb:tt0933346</span>
                  <span className="glass-chip px-2 py-1 rounded">tvdb:289127</span>
                  <span className="glass-chip px-2 py-1 rounded">The Night Manager s01e02</span>
                </div>
              </div>
            </div>
          )}
        </section>
        )}

        {/* Search Results */}
        {activeSection === 'search' && searchError && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-300">{searchError}</p>
          </div>
        )}

        {activeSection === 'search' && searching && (
          <div className="glass-panel rounded-lg p-8 text-center mb-4">
            <div className="text-yellow-400">Searching titles...</div>
          </div>
        )}

        {activeSection === 'search' && searchResults && (
          <div className="mb-4">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <h2 className="text-lg font-semibold">
                Results for "{searchResults.query}"
              </h2>
              <span className="text-gray-400 text-sm">
                {searchResults.total_count} total
              </span>
            </div>

            {searchResults.results.length === 0 ? (
              <div className="glass-panel rounded-lg p-6 text-center text-gray-400">
                No results found
              </div>
            ) : (
              <div className="grid gap-3">
                {searchResults.results.map((result, index) => (
                  <DiscoveryCard
                    key={result.tmdb_id || result.tvdb_id || index}
                    result={result}
                    onShowReleases={handleShowReleases}
                    onShowDetails={setSelectedResult}
                    onTypeToggle={handleTypeToggle}
                  />
                ))}
              </div>
            )}

            {searchResults.total_pages > 1 && (
              <div className="flex justify-between items-center mt-4 glass-panel rounded-lg p-3">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 rounded bg-slate-800/60 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-400">
                  Page {searchResults.page} of {searchResults.total_pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(searchResults.total_pages, page + 1))}
                  disabled={page >= searchResults.total_pages}
                  className="px-3 py-2 rounded bg-slate-800/60 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Download Activity Section */}
        {activeSection === 'downloads' && config && (
          <section id="downloads" className="scroll-mt-24 mb-4">
            <>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Download Activity</h2>
                <button
                  onClick={() => fetchSabData(false)}
                  disabled={!sabConfigured || sabLoading}
                  className="px-3 py-1.5 rounded bg-slate-800/60 disabled:opacity-50 text-xs"
                >
                  {sabLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {!sabConfigured ? (
                <div className="glass-panel rounded-lg p-4 text-gray-400">
                  SABnzbd not configured
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="glass-panel rounded-lg overflow-hidden">
                    <div className="w-full text-left p-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-md font-semibold">Queue</div>
                        <div className="text-xs text-gray-400 truncate">{queueSummary}</div>
                      </div>
                    </div>
                    <div className="px-3 pb-3 overflow-hidden">
                      <SabQueue
                        data={sabQueue}
                        error={sabQueueError}
                        onRefresh={fetchSabData}
                        onPauseAll={handlePauseAll}
                        onResumeAll={handleResumeAll}
                        onPauseJob={handlePauseJob}
                        onResumeJob={handleResumeJob}
                        onDeleteJob={handleDeleteJob}
                        actionBusy={sabActionBusy}
                      />
                    </div>
                  </div>
                  <div className="glass-panel rounded-lg overflow-hidden">
                    <div className="w-full text-left p-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-md font-semibold">Recent</div>
                        <div className="text-xs text-gray-400 truncate">{recentSummary}</div>
                      </div>
                    </div>
                    <div className="px-3 pb-3 overflow-hidden">
                      <SabRecent data={sabRecent} error={sabRecentError} />
                    </div>
                  </div>
                </div>
              )}
            </>
          </section>
        )}

        {/* Status Section - Collapsible */}
        {activeSection === 'status' && (
        <section id="status" className="scroll-mt-24">
        <details className="glass-panel rounded-lg" open>
          <summary className="p-4 cursor-pointer font-semibold">
            System Status {health?.status === 'ok' && <span className="text-green-400 text-sm ml-2">Connected</span>}
          </summary>

          <div className="p-4 pt-0 space-y-4">
            {loading && <div className="text-yellow-400">Checking backend...</div>}

            {!loading && error && (
              <div className="text-red-400">Error: {error}</div>
            )}

            {config && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Configuration</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Country:</span> {config.user.country}</div>
                    <div><span className="text-gray-500">AI:</span> {config.ai.provider}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Integrations</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Sonarr</span>
                      <span className={config.integrations.sonarr_url ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.sonarr_url ? 'Connected' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Radarr</span>
                      <span className={config.integrations.radarr_url ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.radarr_url ? 'Connected' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>SABnzbd</span>
                      <span className={config.integrations.sabnzbd_url ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.sabnzbd_url ? 'Connected' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>TMDB</span>
                      <span className={config.integrations.tmdb_api_key ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.tmdb_api_key ? 'Connected' : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Streaming Services</h3>
                  <div className="flex flex-wrap gap-2">
                    {config.streaming_services.filter((service) => service.enabled).length === 0 && (
                      <span className="text-xs text-gray-500">None enabled</span>
                    )}
                    {config.streaming_services.filter((service) => service.enabled).map((service) => (
                      <span
                        key={service.id}
                        className="glass-chip px-2 py-1 rounded inline-flex items-center gap-2 text-xs"
                      >
                        {getStreamingLogo(service.id) ? (
                          <img
                            src={getStreamingLogo(service.id)}
                            alt={service.name}
                            className="h-4 w-4 object-contain"
                          />
                        ) : (
                          <span className="text-gray-500 text-xs">?</span>
                        )}
                        <span>{service.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </details>
        </section>
        )}

        {activeSection === 'settings' && config && (
          <section id="settings" className="scroll-mt-24 mt-4 glass-panel rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Settings</h3>
            <p className="text-xs text-gray-400 mb-3">
              Non-secret settings only. Env vars still override these values.
            </p>
            {settingsError && (
              <div className="text-xs text-red-400 mb-2">Error: {settingsError}</div>
            )}
            {settingsSaved && (
              <div className="text-xs text-cyan-300 mb-2">Settings saved.</div>
            )}
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-gray-400">Country</span>
                <input
                  type="text"
                  value={settingsCountry}
                  onChange={(event) => setSettingsCountry(event.target.value.toUpperCase())}
                  className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-gray-400">AI Model</span>
                <input
                  type="text"
                  value={settingsAiModel}
                  onChange={(event) => setSettingsAiModel(event.target.value)}
                  className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving}
              className="mt-3 px-3 py-2 rounded bg-slate-800/60 disabled:opacity-50 text-sm"
            >
              {settingsSaving ? 'Saving...' : 'Save settings'}
            </button>

            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Streaming Services</h4>
              {streamingUpdateError && (
                <div className="text-xs text-red-400 mb-2">Error: {streamingUpdateError}</div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {config.streaming_services.map((service) => (
                  <label key={service.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={service.enabled}
                      disabled={streamingUpdateBusy}
                      onChange={(event) => handleStreamingToggle(service.id, event.target.checked)}
                    />
                    {getStreamingLogo(service.id) ? (
                      <img src={getStreamingLogo(service.id)} alt={service.name} className="h-5 w-5 object-contain" />
                    ) : (
                      <span className="text-gray-500 text-xs">?</span>
                    )}
                    <span>{service.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Loading overlay for releases */}
      {loadingReleases && (
        <div className="fixed inset-0 glass-modal z-50 flex items-center justify-center">
          <div className="glass-panel rounded-lg p-8 text-center">
            <div className="text-yellow-400 text-lg">Searching indexers...</div>
            <p className="text-gray-400 text-sm mt-2">This may take a moment</p>
          </div>
        </div>
      )}

      {/* Release error */}
      {releaseError && (
        <div className="fixed inset-0 glass-modal z-50 flex items-center justify-center p-4">
          <div className="glass-panel rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-semibold mb-2">Error</h3>
            <p className="text-gray-300 mb-4">{releaseError}</p>
            <button
              onClick={clearReleaseError}
              className="bg-slate-700/60 hover:bg-slate-600/60 px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Discovery details modal */}
      {selectedResult && (
        <AvailabilityModal
          mode="info"
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onShowReleases={handleShowReleases}
        />
      )}

      {/* AI Availability Modal - for specific episode/movie requests */}
      {showAiAvailability && aiIntentPlan && (
        <AvailabilityModal
          mode="ai"
          plan={aiIntentPlan}
          releaseData={releaseData}
          onConfirm={handleAiConfirm}
          onSearch={() => {
            // User wants to see original search results instead
            // (search already happened in background, just close modal)
            setShowAiAvailability(false)
          }}
          onClose={() => {
            setShowAiAvailability(false)
          }}
        />
      )}

      {/* Release view modal */}
      {releaseData && !showAiAvailability && (
        <ReleaseView
          data={releaseData}
          result={releaseContext || undefined}
          onClose={handleCloseReleaseView}
          onGrabRelease={handleGrabRelease}
          onGrabAll={handleGrabAll}
          grabBusyIds={grabBusyIds}
          grabFeedback={grabFeedback}
          aiEnabled={aiEnabled}
          aiSuggestion={aiSuggestion}
          aiSuggestBusy={aiSuggestBusy}
          aiSuggestError={aiSuggestError}
          onAiSuggest={handleAiSuggest}
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
