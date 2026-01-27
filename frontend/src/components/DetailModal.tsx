'use client'

import { useEffect, useState } from 'react'
import type {
  AIIntentPlan,
  AIAvailability,
  DiscoveryResult,
  ReleaseResponse,
  SonarrLibraryItem,
  RadarrLibraryItem,
  SonarrEpisode,
} from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { getRatingLink, formatSize } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'

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

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Fetch availability for AI or discovery modes
  useEffect(() => {
    if (mode === 'ai') {
      setAvailability(plan?.availability || null)
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      setManualQuery(plan?.query || '')
      return
    }

    if (mode === 'discovery' && result) {
      let active = true
      const fetchAvailability = async () => {
        setAvailability(null)
        setAvailabilityError(null)
        setAvailabilityLoading(true)
        try {
          const backendUrl = getBackendUrl()
          const params = new URLSearchParams({ query: result.title, type: result.type })
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
  }, [mode, plan?.availability, plan?.query, result])

  // Fetch episodes for library TV shows
  useEffect(() => {
    if (mode !== 'library' || !libraryItem || libraryItem.mediaType !== 'tv') return
    let active = true
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
    headerTitle = 'Plan & Availability'
    headerSubtitle = plan?.query ? `"${plan.query}"` : ''
    poster = availability?.poster_url
    displayTitle = availability?.title || intent?.title || plan?.query || 'Unknown'
    metadata = `${availability?.year || 'Unknown year'}${intent?.media_type && intent.media_type !== 'unknown' ? ` • ${intent.media_type}` : ''}`
    overview = availability?.overview

    // AI-specific chips
    if (releaseData?.requested_season || intent?.season) {
      const s = (releaseData?.requested_season || intent?.season)?.toString().padStart(2, '0')
      const e = (releaseData?.requested_episode || intent?.episode)?.toString().padStart(2, '0')
      chips.push(<span key="season" className="glass-chip px-2 py-1 rounded text-xs">S{s}{e ? `E${e}` : ''}</span>)
    }
    if (intent?.episode_date) chips.push(<span key="date" className="glass-chip px-2 py-1 rounded text-xs">{intent.episode_date}</span>)
    if (intent?.quality) chips.push(<span key="quality" className="glass-chip px-2 py-1 rounded text-xs">{intent.quality}</span>)
    if (intent?.action) chips.push(<span key="action" className="glass-chip px-2 py-1 rounded text-xs">{intent.action}</span>)
  } else if (mode === 'discovery' && result) {
    headerTitle = result.title
    headerSubtitle = `${result.type === 'movie' ? 'Movie' : 'TV Series'}${result.year ? ` • ${result.year}` : ''}`
    poster = result.poster
    displayTitle = result.title
    metadata = `${result.year || ''}${result.type === 'movie' && result.runtime ? ` • ${result.runtime} min` : ''}${result.type === 'tv' && result.seasons ? ` • ${result.seasons} season${result.seasons !== 1 ? 's' : ''}` : ''}${result.network ? ` • ${result.network}` : ''}`
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
    headerTitle = libraryItem.title
    headerSubtitle = `${libraryItem.year || '—'}${libraryItem.mediaType === 'tv' && 'network' in libraryItem && libraryItem.network ? ` • ${libraryItem.network}` : ''}`
    poster = libraryItem.poster
    displayTitle = libraryItem.title
    metadata = `${libraryItem.year || ''}`
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
    if (libraryItem.mediaType === 'tv') {
      chips.push(<span key="eps" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.episodeFileCount || 0}/{libraryItem.episodeCount || 0} eps</span>)
    }
    chips.push(<span key="size" className="glass-chip px-2 py-1 rounded text-xs">{formatSize(libraryItem.sizeOnDisk)}</span>)
    if (libraryItem.path) chips.push(<span key="path" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.path}</span>)
    chips.push(<span key="monitored" className="glass-chip px-2 py-1 rounded text-xs">{libraryItem.monitored ? 'Monitored' : 'Unmonitored'}</span>)
  }

  // ============================================
  // STREAMING OPTIONS (shared between AI and discovery)
  // ============================================
  const streamingSection = (mode === 'ai' || mode === 'discovery') ? (
    <div className="space-y-2">
      {availabilityLoading && <div className="text-xs text-gray-400">Loading streaming options...</div>}
      {availability?.flatrate && availability.flatrate.length > 0 && (
        <div>
          <div className="text-gray-400 text-xs mb-2">Streaming options</div>
          <div className="flex flex-wrap gap-2">
            {availability.flatrate.map((provider) => {
              const isSubscribed = availability.subscribed?.includes(provider.name)
              return (
                <div
                  key={provider.name}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-xs border ${
                    isSubscribed
                      ? 'border-cyan-400/70 bg-cyan-900/20 text-cyan-200'
                      : 'border-slate-700/60 bg-slate-800/60 text-slate-200'
                  }`}
                >
                  {provider.logo_url ? (
                    <img src={provider.logo_url} alt={provider.name} className="h-5 w-5 object-contain" />
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
      <div className="text-sm text-slate-400 mb-2">Seasons</div>
      <div className="grid gap-2">
        {libraryItem.seasons.map((season) => {
          const seasonNumber = season.seasonNumber ?? 0
          const isExpanded = expandedSeasons.has(seasonNumber)
          const episodes = episodesBySeason[seasonNumber] || []
          return (
            <div key={seasonNumber} className="glass-card rounded-md px-3 py-2 text-sm">
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
                className="w-full flex items-center justify-between"
              >
                <span>Season {season.seasonNumber ?? '—'}</span>
                <span className="text-slate-300">{season.episodeFileCount || 0}/{season.episodeCount || 0} eps</span>
              </button>
              {isExpanded && (
                <div className="mt-2 space-y-1 text-sm text-slate-300">
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
                    return (
                      <div key={ep.id} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="min-w-0">
                          <span className="block truncate" title={fullTitle}>
                            {fullTitle}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-2 text-slate-500">
                          {airDateLabel && <span className="text-slate-400">{airDateLabel}</span>}
                          <span className={`text-xs ${qualityClass}`} title={qualityTitle}>{qualityIcon}</span>
                        </div>
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
          <label className="text-xs text-gray-400">Search a different title</label>
          <div className="mt-1 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Type what you actually want"
              className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
            />
            <button
              type="button"
              onClick={() => onSearch?.(manualQuery)}
              disabled={busy || !manualQuery.trim()}
              className="bg-slate-700/60 hover:bg-slate-600/70 disabled:bg-slate-700/40 disabled:cursor-not-allowed text-white py-2 px-3 rounded text-sm"
            >
              Search this
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => plan && onConfirm?.(plan)} disabled={busy} className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium">
            {busy ? 'Working...' : 'Search anyway'}
          </button>
          <button type="button" onClick={() => plan && onSearch?.(plan.query)} disabled={busy} className="bg-slate-800/70 hover:bg-slate-700/70 text-white py-2 px-4 rounded text-sm">
            Search original query
          </button>
          <button type="button" onClick={onClose} className="bg-slate-700/60 hover:bg-slate-600/70 text-white py-2 px-4 rounded text-sm">
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
  }

  // ============================================
  // SINGLE UNIFIED RETURN
  // ============================================
  return (
    <div className="fixed inset-0 glass-modal z-50 overflow-auto" onClick={onClose}>
      <div className="min-h-screen p-4">
        <div className="mx-auto glass-panel rounded-lg p-4 md:p-6 max-w-3xl" onClick={(e) => e.stopPropagation()}>

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
        </div>
      </div>
    </div>
  )
}
