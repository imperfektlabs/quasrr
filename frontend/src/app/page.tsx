'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type HealthStatus = {
  status: string
} | null

type ConfigStatus = {
  app: { name: string; log_level: string }
  user: { country: string; language: string }
  ai: { provider: string; model: string; api_key: string | null }
  streaming_services: { id: string; name: string; enabled: boolean }[]
  integrations: {
    sonarr_url: string | null
    radarr_url: string | null
    sabnzbd_url: string | null
    tmdb_api_key?: string | null
  }
  features: {
    show_download_always: boolean
    ai_suggestions: boolean
    auto_quality_filter: boolean
  }
} | null

type SearchType = 'movie' | 'tv'
type SearchFilterType = 'all' | SearchType
type SearchStatusFilter = 'all' | 'not_in_library' | 'in_library' | 'downloaded'
type SearchSortField = 'relevance' | 'year' | 'title' | 'rating' | 'popularity'
type SearchSortDirection = 'asc' | 'desc'

type Rating = {
  source: string
  value: number
  votes?: number
}

type StreamingService = {
  id: string
  name: string
  enabled: boolean
}

// Discovery result from Stage 1 search
type DiscoveryResult = {
  type: SearchType
  title: string
  year?: number
  overview?: string
  poster?: string
  status: 'not_in_library' | 'in_library' | 'downloaded'
  tmdb_id?: number
  imdb_id?: string
  runtime?: number
  genres?: string[]
  radarr_id?: number | null
  tvdb_id?: number
  network?: string
  series_status?: string
  seasons?: number
  sonarr_id?: number | null
  ratings?: Rating[]
  cast?: string[]
  popularity?: number
}

type SearchResponse = {
  query: string
  type: string
  count: number
  total_count: number
  page: number
  page_size: number
  total_pages: number
  results: DiscoveryResult[]
}

// Release from Stage 2 indexer search
type Release = {
  title: string
  size: number
  size_formatted: string
  size_gb: number
  quality: string
  resolution?: number
  source?: string
  indexer: string
  indexer_id?: number
  age: string
  publish_date?: string
  protocol: string
  guid?: string
  info_url?: string
  rejected: boolean
  rejections?: string[]
  // TV-specific
  season?: number
  episode?: number[]
  full_season?: boolean
}

type ReleaseResponse = {
  title: string
  year?: number
  type: string
  season?: number
  requested_season?: number
  requested_episode?: number
  poster?: string
  tmdb_id?: number
  tvdb_id?: number
  radarr_id?: number
  sonarr_id?: number
  runtime?: number
  releases: Release[]
  message?: string
  episode_downloaded?: EpisodeDownloadMap
  season_progress?: SeasonProgress[]
}

type AISuggestion = {
  index?: number
  guid?: string | null
  title?: string | null
  reason?: string
  warnings?: string[]
}

type AIIntent = {
  media_type: 'movie' | 'tv' | 'unknown'
  title: string
  season?: number | null
  episode?: number | null
  episode_date?: string | null
  action?: 'search' | 'download'
  quality?: string | null
  confidence?: number
  notes?: string
}

type AIAvailability = {
  tmdb_id?: number
  title?: string
  year?: string
  overview?: string
  poster_url?: string
  link?: string
  flatrate?: { name: string; logo_url?: string | null }[]
  subscribed?: string[]
  media_type?: 'movie' | 'tv'
}

type AIIntentPlan = {
  query: string
  intent: AIIntent
  availability?: AIAvailability
  recommendation?: 'watch' | 'search' | 'download'
}

// SABnzbd Types
type SabQueueItem = {
  id?: string
  name: string
  status: string
  percentage: string
  size_total: string
  size_remaining: string
  speed: string
  eta: string
  category: string
  parsedTitle: string
  mediaType: 'movie' | 'tv' | 'unknown'
  season?: number
  episode?: number
  groupKey: string
}

type SabQueueResponse = {
  jobs: SabQueueItem[]
  speed: string
}

type SabRecentItem = {
  name: string
  status: string
  completedTime: number | null
  size: string
  category: string
  parsedTitle: string
  mediaType: 'movie' | 'tv' | 'unknown'
  season?: number
  episode?: number
  groupKey: string
}

type SabRecentGroup = {
  groupKey: string
  title: string
  mediaType: 'movie' | 'tv' | 'unknown'
  count: number
  totalSize: number
  latestCompletedTime: number | null
  items: SabRecentItem[]
}

type SabRecentResponse = {
  groups: SabRecentGroup[]
}

type IntegrationStatus = {
  status: string
  message?: string
  version?: string
}

type IntegrationsStatus = {
  radarr: IntegrationStatus
  sonarr: IntegrationStatus
  sabnzbd: IntegrationStatus
}

type SortField = 'size' | 'quality' | 'age' | 'title'
type SortDirection = 'asc' | 'desc' | null

type EpisodeDownloadMap = Record<string, Record<string, boolean>>

type SeasonProgress = {
  season: number
  downloaded: number
  total: number
}

type IconProps = {
  className?: string
}

const DownloadIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v7" />
    <path d="M8.5 11.5 12 15l3.5-3.5" />
    <path d="M7.5 16.5h9" />
  </svg>
)

const DownloadAllIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v7" />
    <path d="M8.5 11.5 12 15l3.5-3.5" />
    <path d="M7.5 16.5h9" />
    <path d="M16.5 7.5h3" />
    <path d="M18 6v3" />
  </svg>
)

function getBackendUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:8000`
}

const STREAMING_LOGOS: Record<string, string> = {
  netflix: '/logos/streaming/netflix.avif',
  crave: '/logos/streaming/crave.avif',
  disney_plus: '/logos/streaming/disney_plus.avif',
  amazon_prime: '/logos/streaming/amazon_prime.avif',
  apple_tv: '/logos/streaming/apple_tv.avif',
  paramount_plus: '/logos/streaming/paramount_plus.avif',
}

const STREAMING_LINKS: Record<string, string> = {
  netflix: 'https://www.netflix.com',
  crave: 'https://www.crave.ca',
  disney_plus: 'https://www.disneyplus.com',
  amazon_prime: 'https://www.primevideo.com',
  apple_tv: 'https://tv.apple.com',
  paramount_plus: 'https://www.paramountplus.com',
}

function getStreamingLogo(id: string): string | undefined {
  return STREAMING_LOGOS[id]
}

function getStreamingLink(id: string): string | undefined {
  return STREAMING_LINKS[id]
}

function getLocalToolUrl(port: number, path = ''): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}${path}`
}

function normalizeIdQuery(input: string): { query: string; isIdQuery: boolean; forcedType?: SearchType } {
  const trimmed = input.trim()
  const match = /^(imdb|tmdb|tvdb)\s*[:#]\s*(tt\d+|\d+)$/i.exec(trimmed)
  if (match) {
    const prefix = match[1].toLowerCase()
    const value = match[2]
    return {
      query: `${prefix}:${value}`,
      isIdQuery: true,
      forcedType: prefix === 'tvdb' ? 'tv' : undefined,
    }
  }
  if (/^tt\d+$/i.test(trimmed)) {
    return { query: `imdb:${trimmed}`, isIdQuery: true }
  }
  return { query: input, isIdQuery: false }
}

function getReleaseKey(release: Release): string {
  return release.guid || `${release.title}-${release.indexer}-${release.size}-${release.publish_date || ''}`
}

function sortReleasesForAi(list: Release[]): Release[] {
  return [...list].sort((a, b) => a.size - b.size)
}

function formatTimestamp(value: number | null | undefined, mode: 'date' | 'time' = 'date'): string {
  if (!value) return 'Unknown'
  const date = new Date(value * 1000)
  return mode === 'time' ? date.toLocaleTimeString() : date.toLocaleString()
}

function formatRating(rating: Rating): string {
  const value = rating.value.toFixed(1)
  const votes = rating.votes ? ` (${rating.votes.toLocaleString()})` : ''
  return `${value}${votes}`
}

function formatRatingSource(source: string): string {
  const map: Record<string, string> = {
    tmdb: 'TMDB',
    imdb: 'IMDb',
    trakt: 'Trakt',
    metacritic: 'Metacritic',
    rottentomatoes: 'RT',
    rottenTomatoes: 'RT',
    tvdb: 'TVDB',
    justwatch: 'JW',
  }
  return map[source] || source.toUpperCase()
}

function getRatingLink(result: DiscoveryResult, rating: Rating): string | null {
  const source = rating.source.toLowerCase()

  if (source === 'imdb' && result.imdb_id) {
    return `https://www.imdb.com/title/${result.imdb_id}/`
  }
  if (source === 'tmdb' && result.tmdb_id) {
    return result.type === 'movie'
      ? `https://www.themoviedb.org/movie/${result.tmdb_id}`
      : `https://www.themoviedb.org/tv/${result.tmdb_id}`
  }
  if (source === 'justwatch') {
    return `https://www.justwatch.com/ca/search?q=${encodeURIComponent(result.title)}`
  }
  if (source === 'metacritic') {
    const typePath = result.type === 'movie' ? 'movie' : 'tv'
    return `https://www.metacritic.com/search/${typePath}/${encodeURIComponent(result.title)}/results`
  }
  if (source === 'rottentomatoes') {
    return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(result.title)}`
  }
  if (source === 'tvdb') {
    return `https://thetvdb.com/search?query=${encodeURIComponent(result.title)}`
  }

  return null
}

function RatingBadge({ rating, href }: { rating: Rating; href?: string | null }) {
  const source = rating.source.toLowerCase()
  const label = formatRatingSource(source)
  const value = formatRating(rating)

  const logoMap: Record<string, string> = {
    imdb: '/logos/ratings/imdb.svg',
    tmdb: '/logos/ratings/tmdb.svg',
    tdb: '/logos/ratings/tmdb.svg',
    justwatch: '/logos/ratings/justwatch.png',
    metacritic: '/logos/ratings/metacritic.svg',
    rottentomatoes: '/logos/ratings/rottentomatoes.svg',
    tvdb: '/logos/ratings/tvdb.svg',
  }

  const logo = logoMap[source]

  const content = (
    <span className="rating-chip text-xs px-2 py-1 rounded inline-flex items-center gap-2">
      {logo ? (
        <img
          src={logo}
          alt={label}
          className="h-5 w-auto max-w-[64px] object-contain"
          loading="lazy"
        />
      ) : (
        <span className="text-slate-200 font-semibold">{label}</span>
      )}
      <span className="text-slate-200">{value}</span>
    </span>
  )

  if (!href) return content

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  )
}

function StreamingBadges({ services }: { services: StreamingService[] }) {
  if (!services.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => (
        <span key={service.id} className="glass-chip px-2 py-1 rounded inline-flex items-center">
          {getStreamingLogo(service.id) ? (
            <img
              src={getStreamingLogo(service.id)}
              alt={service.name}
              className="h-5 w-auto max-w-[64px] object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-xs text-slate-200">{service.name}</span>
          )}
        </span>
      ))}
    </div>
  )
}

// Check for size red flags per PROJECT_BRIEF
function getSizeWarning(release: Release, mediaType: string): string | null {
  const sizeGB = release.size_gb
  const sizeMB = sizeGB * 1024
  const quality = release.quality.toLowerCase()

  // Red flag: <300MB claiming 720p (re-encoded garbage)
  if (quality.includes('720') && sizeMB < 300) {
    return 'Suspiciously small for 720p'
  }

  // Red flag: >3GB for TV episodes
  if (mediaType === 'tv' && !release.full_season && sizeGB > 3) {
    return 'Very large for single episode'
  }

  // Movie guidance: 2-4GB is ideal
  if (mediaType === 'movie') {
    if (sizeGB < 1 && quality.includes('720')) {
      return 'May be low quality'
    }
    if (sizeGB > 10) {
      return 'Very large file'
    }
  }

  return null
}

// Get size recommendation badge
function getSizeRecommendation(release: Release, mediaType: string): { text: string; color: string } | null {
  const sizeGB = release.size_gb
  const sizeMB = sizeGB * 1024

  if (mediaType === 'movie') {
    // Ideal: 2-4GB for movies
    if (sizeGB >= 2 && sizeGB <= 4) {
      return { text: 'Good size', color: 'text-green-400' }
    }
  } else if (mediaType === 'tv') {
    // For full seasons, harder to judge
    if (release.full_season) return null

    // 1hr episode: 800MB-1.2GB, 30min: 400-500MB
    // We don't know episode length, so use 400MB-1.2GB as acceptable
    if (sizeMB >= 400 && sizeMB <= 1200) {
      return { text: 'Good size', color: 'text-green-400' }
    }
  }

  return null
}

// Status badge component
function StatusBadge({ status }: { status: DiscoveryResult['status'] }) {
  const config = {
    'not_in_library': {
      text: 'Not in library',
      icon: '○',
      bg: 'bg-slate-700/60',
      textColor: 'text-slate-200',
    },
    'in_library': {
      text: 'In library (not downloaded)',
      icon: '◐',
      bg: 'bg-violet-900/60',
      textColor: 'text-violet-200',
    },
    'downloaded': {
      text: 'In library (downloaded)',
      icon: '✓',
      bg: 'bg-cyan-900/60',
      textColor: 'text-cyan-200',
    },
  }[status]

  return (
    <span
      className={`px-2 py-1 rounded text-xs ${config.bg} ${config.textColor}`}
      title={config.text}
      aria-label={config.text}
    >
      {config.icon}
    </span>
  )
}

// Sortable column header
function SortHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
}: {
  label: string
  field: SortField
  currentSort: SortField
  currentDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const isActive = currentSort === field
  const arrow = isActive && currentDirection ? (currentDirection === 'asc' ? ' ^' : ' v') : ''

  return (
    <button
      onClick={() => onSort(field)}
      className={`text-left font-medium hover:text-cyan-300 transition-colors ${
        isActive ? 'text-cyan-300' : 'text-gray-400'
      }`}
    >
      {label}{arrow}
    </button>
  )
}

// Release list modal/view
function ReleaseView({
  data,
  onClose,
  onGrabRelease,
  onGrabAll,
  grabBusyIds,
  grabFeedback,
  aiEnabled,
  aiSuggestion,
  aiSuggestBusy,
  aiSuggestError,
  onAiSuggest,
}: {
  data: ReleaseResponse
  onClose: () => void
  onGrabRelease: (release: Release) => void
  onGrabAll: (releases: Release[]) => void
  grabBusyIds: Set<string>
  grabFeedback: { type: 'error' | 'success'; text: string } | null
  aiEnabled: boolean
  aiSuggestion: AISuggestion | null
  aiSuggestBusy: boolean
  aiSuggestError: string | null
  onAiSuggest: (releases: Release[]) => void
}) {
  const [sortField, setSortField] = useState<SortField>('size')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [groupFocus, setGroupFocus] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [collapsedSeasons, setCollapsedSeasons] = useState<Set<string>>(new Set())
  const [grabAllModal, setGrabAllModal] = useState<{
    releases: Release[]
    selected: Set<string>
  } | null>(null)
  const grabAllSelectAllRef = useRef<HTMLInputElement | null>(null)
  const aiPickGuid = aiSuggestion?.guid || null
  const requestedSeason = data.requested_season
  const requestedEpisode = data.requested_episode

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (data.type !== 'tv') {
      setCollapsedGroups(new Set())
      setCollapsedSeasons(new Set())
      return
    }

    if (groupFocus) {
      const seasonGroups = buildSeasonGroups(data.releases)
      const bucketKeys: string[] = []
      for (const seasonGroup of seasonGroups) {
        const groupReleases = seasonGroup.releases.filter(
          (release) => extractGroup(release.title) === groupFocus
        )
        if (!groupReleases.length) continue
        const buckets = buildFormatBuckets(groupReleases)
        buckets.forEach((bucket) => {
          bucketKeys.push(`${seasonGroup.key}:${groupFocus}:${bucket.key}`)
        })
      }
      setCollapsedGroups(new Set(bucketKeys))
      return
    }

    const seasonGroups = buildSeasonGroups(data.releases)
    const seasonNumbers = seasonGroups.map((group) => group.season).filter((season) => season > 0)
    const seasonCount = new Set(seasonNumbers).size
    const isMultiSeason = seasonCount > 1 && !data.season && !requestedSeason

    if (isMultiSeason) {
      const episodeKeys = new Set<string>()
      for (const seasonGroup of seasonGroups) {
        for (const group of buildEpisodeGroups(seasonGroup.releases)) {
          episodeKeys.add(`${seasonGroup.key}:${group.key}`)
        }
      }
      setCollapsedGroups(episodeKeys)
    } else {
      const episodeGroupKeys = buildEpisodeGroups(data.releases).map((group) => group.key)
      setCollapsedGroups(new Set(episodeGroupKeys))
    }
  }, [data.type, data.releases, groupFocus, data.season, requestedSeason])

  useEffect(() => {
    if (data.type !== 'tv') {
      setCollapsedSeasons(new Set())
      return
    }

    const seasonGroups = buildSeasonGroups(data.releases)
    const seasonNumbers = seasonGroups.map((group) => group.season).filter((season) => season > 0)
    const seasonCount = new Set(seasonNumbers).size
    const isMultiSeason = seasonCount > 1 && !data.season && !requestedSeason

    if (!isMultiSeason) {
      setCollapsedSeasons(new Set())
      return
    }

    const keepOpen = requestedSeason ? `season-${requestedSeason}` : null
    const collapsed = new Set(
      seasonGroups.map((group) => group.key).filter((key) => key !== keepOpen)
    )
    setCollapsedSeasons(collapsed)
  }, [data.type, data.releases, data.season, requestedSeason])

  useEffect(() => {
    if (!aiPickGuid) return
    const match = data.releases.find((release) => release.guid === aiPickGuid)
    if (match) {
      const baseKey = getEpisodeGroupKey(match)
      const groupKey = isMultiSeason ? `season-${getSeason(match)}:${baseKey}` : baseKey
      setCollapsedGroups((prev) => {
        if (!prev.has(groupKey)) return prev
        const next = new Set(prev)
        next.delete(groupKey)
        return next
      })
    }
    const target = document.querySelector(`[data-release-guid="${aiPickGuid}"]`)
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [aiPickGuid, data.releases])

  useEffect(() => {
    if (!grabAllSelectAllRef.current || !grabAllModal) return
    const selectedCount = grabAllModal.selected.size
    const totalCount = grabAllModal.releases.length
    grabAllSelectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < totalCount
  }, [grabAllModal])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle: asc -> desc -> null (default)
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortField('size') // Reset to default
      } else {
        setSortDirection('asc')
      }
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortReleases = (list: Release[]) => {
    if (!sortDirection) return list

    return [...list].sort((a, b) => {
      switch (sortField) {
        case 'title': {
          const result = a.title.localeCompare(b.title)
          return sortDirection === 'asc' ? result : -result
        }
        case 'size':
          return sortDirection === 'asc' ? a.size - b.size : b.size - a.size
        case 'quality':
          return sortDirection === 'asc'
            ? (a.resolution || 0) - (b.resolution || 0)
            : (b.resolution || 0) - (a.resolution || 0)
        case 'age':
          return sortDirection === 'asc'
            ? new Date(a.publish_date || 0).getTime() - new Date(b.publish_date || 0).getTime()
            : new Date(b.publish_date || 0).getTime() - new Date(a.publish_date || 0).getTime()
        default:
          return 0
      }
    })
  }

  const extractGroup = (title: string) => {
    const match = title.match(/-([^-]+)$/)
    if (!match) return null
    const group = match[1].trim()
    if (group.length < 2 || group.length > 20) return null
    return group
  }

  const getResolutionLabel = (release: Release) => {
    if (release.resolution) return `${release.resolution}p`
    const match = release.title.match(/\b(2160|1080|720|480)p\b/i)
    if (match) return `${match[1]}p`
    const qualityMatch = release.quality.match(/\b(2160|1080|720|480)p\b/i)
    if (qualityMatch) return `${qualityMatch[1]}p`
    return 'Unknown'
  }

  const getSourceLabel = (release: Release) => {
    if (release.source) return release.source.toUpperCase()
    const match = release.title.match(/\b(webrip|webdl|web-dl|bluray|hdtv|dvdrip)\b/i)
    if (match) return match[1].toUpperCase().replace('-', '')
    const qualityMatch = release.quality.match(/\b(webrip|webdl|web-dl|bluray|hdtv|dvdrip)\b/i)
    if (qualityMatch) return qualityMatch[1].toUpperCase().replace('-', '')
    return 'Unknown'
  }

  const getCodecLabel = (release: Release) => {
    const title = release.title.toLowerCase()
    if (/(x265|h265|hevc)/.test(title)) return 'x265'
    if (/(x264|h264)/.test(title)) return 'x264'
    if (/av1/.test(title)) return 'AV1'
    return 'Unknown'
  }

  const buildFormatBuckets = (list: Release[]) => {
    const buckets = new Map<string, Release[]>()
    list.forEach((release) => {
      const key = `${getResolutionLabel(release)} ${getSourceLabel(release)} ${getCodecLabel(release)}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)?.push(release)
    })
    return Array.from(buckets.entries()).map(([key, releases]) => ({
      key,
      label: key,
      releases,
      showGrabAll: true,
    }))
  }

  const getSeason = (release: Release) => {
    if (typeof release.season === 'number') return release.season
    if (typeof data.season === 'number') return data.season
    return 0
  }

  const getEpisodeLabel = (release: Release) => {
    const season = getSeason(release)
    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((e) => typeof e === 'number')
      : []

    if (release.full_season) {
      return season > 0 ? `S${season} Full` : 'Full Season'
    }

    if (episodes.length > 0) {
      const minEp = Math.min(...episodes)
      const maxEp = Math.max(...episodes)
      const episodeLabel = minEp === maxEp ? `E${minEp}` : `E${minEp}-E${maxEp}`
      return season > 0 ? `S${season}${episodeLabel}` : `Episode ${episodeLabel}`
    }

    return null
  }

  const getEpisodeGroupKey = (release: Release) => {
    const season = getSeason(release)
    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((e) => typeof e === 'number')
      : []

    if (release.full_season) {
      return 'full-season'
    }

    if (episodes.length > 0) {
      const minEp = Math.min(...episodes)
      const maxEp = Math.max(...episodes)
      return `s${season}-e${minEp}-${maxEp}`
    }

    return 'other'
  }

  const getEpisodeRangeKey = (release: Release) => {
    const season = getSeason(release)
    if (release.full_season) return `S${season || 0}:full`
    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((e) => typeof e === 'number')
      : []
    if (!episodes.length) return `S${season || 0}:other`
    const minEp = Math.min(...episodes)
    const maxEp = Math.max(...episodes)
    return `S${season || 0}:E${minEp}-${maxEp}`
  }

  const pickBestRelease = (releases: Release[]) => {
    return [...releases].sort((a, b) => {
      if (a.rejected !== b.rejected) return a.rejected ? 1 : -1
      const sizeA = a.size || 0
      const sizeB = b.size || 0
      if (sizeA !== sizeB) return sizeB - sizeA
      return a.title.localeCompare(b.title)
    })[0]
  }

  const openGrabAllModal = (releases: Release[]) => {
    const eligible = releases.filter((release) => release.guid && release.indexer_id)
    const grouped = new Map<string, Release[]>()
    eligible.forEach((release) => {
      const key = getEpisodeRangeKey(release)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)?.push(release)
    })
    const selected = new Set<string>()
    grouped.forEach((groupReleases) => {
      const best = pickBestRelease(groupReleases)
      if (best && !isReleaseDownloaded(best)) selected.add(getReleaseKey(best))
    })
    setGrabAllModal({ releases: eligible, selected })
  }

  const toggleGrabAllAll = () => {
    setGrabAllModal((prev) => {
      if (!prev) return prev
      const allSelected = prev.selected.size === prev.releases.length
      return {
        ...prev,
        selected: allSelected
          ? new Set()
          : new Set(prev.releases.map((release) => getReleaseKey(release))),
      }
    })
  }

  const toggleGrabAllSelection = (release: Release) => {
    const key = getReleaseKey(release)
    setGrabAllModal((prev) => {
      if (!prev) return prev
      const next = new Set(prev.selected)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return { ...prev, selected: next }
    })
  }

  const buildEpisodeGroups = (list: Release[]) => {
    type Group = {
      key: string
      label: string
      sortKey: number
      releases: Release[]
    }

    const groups = new Map<string, Group>()

    for (const release of list) {
      if (release.full_season) {
        const key = 'full-season'
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: 'Full Season',
            sortKey: Number.MAX_SAFE_INTEGER - 1,
            releases: [],
          })
        }
        groups.get(key)?.releases.push(release)
        continue
      }

      const season = getSeason(release)
      const episodes = Array.isArray(release.episode)
        ? release.episode.filter((e) => typeof e === 'number')
        : []

      if (episodes.length > 0) {
        const minEp = Math.min(...episodes)
        const maxEp = Math.max(...episodes)
        const episodeLabel = minEp === maxEp ? `E${minEp}` : `E${minEp}-E${maxEp}`
        const label = season > 0 ? `S${season}${episodeLabel}` : `Episode ${episodeLabel}`
        const key = `s${season}-e${minEp}-${maxEp}`
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label,
            sortKey: season * 1000 + minEp,
            releases: [],
          })
        }
        groups.get(key)?.releases.push(release)
      } else {
        const key = 'other'
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: 'Other',
            sortKey: Number.MAX_SAFE_INTEGER,
            releases: [],
          })
        }
        groups.get(key)?.releases.push(release)
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey)
  }

  const buildSeasonGroups = (list: Release[]) => {
    const groups = new Map<number, Release[]>()

    for (const release of list) {
      const season = getSeason(release)
      const key = Number.isFinite(season) ? season : 0
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)?.push(release)
    }

    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === 0) return 1
        if (b[0] === 0) return -1
        return a[0] - b[0]
      })
      .map(([season, releases]) => ({
        key: `season-${season}`,
        label: season > 0 ? `Season ${season}` : 'Other',
        season,
        releases,
      }))
  }

  const buildGroupMap = (list: Release[]) => {
    const groups = new Map<string, Release[]>()

    for (const release of list) {
      const group = extractGroup(release.title)
      if (!group) continue
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)?.push(release)
    }

    return groups
  }

  const episodeSortKey = (release: Release) => {
    if (release.full_season) return Number.MAX_SAFE_INTEGER - 1
    const season = getSeason(release)
    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((e) => typeof e === 'number')
      : []
    if (episodes.length === 0) return Number.MAX_SAFE_INTEGER
    return season * 1000 + Math.min(...episodes)
  }

  const sortByEpisodeOrder = (list: Release[]) => {
    return [...list].sort((a, b) => episodeSortKey(a) - episodeSortKey(b))
  }

  const seasonGroups = data.type === 'tv' ? buildSeasonGroups(data.releases) : []
  const seasonNumbers = seasonGroups.map((group) => group.season).filter((season) => season > 0)
  const seasonCount = new Set(seasonNumbers).size
  const isMultiSeason = data.type === 'tv' && seasonCount > 1 && !data.season && !requestedSeason && !groupFocus

  const releaseAiEnabled = false
  const getOpenEpisodeGroups = () => {
    if (data.type !== 'tv' || groupFocus) return []

    if (isMultiSeason) {
      const expandedSeasons = seasonGroups.filter((group) => !collapsedSeasons.has(group.key))
      const episodeGroups = []
      for (const seasonGroup of expandedSeasons) {
        const groups = buildEpisodeGroups(seasonGroup.releases)
        for (const group of groups) {
          const key = `${seasonGroup.key}:${group.key}`
          if (!collapsedGroups.has(key)) {
            episodeGroups.push({ key, releases: group.releases })
          }
        }
      }
      return episodeGroups
    }

    const groups = buildEpisodeGroups(data.releases)
    return groups
      .filter((group) => !collapsedGroups.has(group.key))
      .map((group) => ({ key: group.key, releases: group.releases }))
  }

  const openEpisodeGroups = getOpenEpisodeGroups()
  const aiSuggestAvailable = releaseAiEnabled && aiEnabled && (
    data.type !== 'tv' ||
    openEpisodeGroups.length === 1
  )

  const aiCandidateReleases = data.type === 'tv'
    ? (openEpisodeGroups.length === 1 ? openEpisodeGroups[0].releases : [])
    : data.releases

  const toggleSeason = (key: string) => {
    setCollapsedSeasons((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const sortedReleases = sortReleases(data.releases)
  const tvGroups = data.type === 'tv' ? buildEpisodeGroups(data.releases) : null
  const tvReleaseGroups = data.type === 'tv' ? buildGroupMap(data.releases) : null
  const episodeDownloaded = data.episode_downloaded || {}
  const seasonProgressMap = new Map<number, SeasonProgress>()
  if (Array.isArray(data.season_progress)) {
    data.season_progress.forEach((progress) => {
      if (typeof progress?.season === 'number') {
        seasonProgressMap.set(progress.season, progress)
      }
    })
  }

  const getSeasonProgressLabel = (season: number) => {
    const progress = seasonProgressMap.get(season)
    if (!progress || progress.total <= 0) return null
    return `${progress.downloaded}/${progress.total}`
  }

  const isReleaseDownloaded = (release: Release) => {
    if (data.type !== 'tv') return false
    const season = getSeason(release)
    if (!season || season <= 0) return false
    const seasonEpisodes = episodeDownloaded[season] || {}

    if (release.full_season) {
      const progress = seasonProgressMap.get(season)
      return Boolean(progress && progress.total > 0 && progress.downloaded === progress.total)
    }

    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((ep) => typeof ep === 'number')
      : []
    if (episodes.length === 0) return false

    return episodes.every((ep) => Boolean(seasonEpisodes[ep]))
  }

  const getEpisodeGroupStatus = (releases: Release[]) => {
    if (data.type !== 'tv') return null
    if (!Array.isArray(releases) || releases.length === 0) return null

    const episodeKeys = new Set<string>()
    for (const release of releases) {
      const season = getSeason(release)
      if (!season || season <= 0) continue
      const episodes = Array.isArray(release.episode)
        ? release.episode.filter((ep) => typeof ep === 'number')
        : []
      for (const ep of episodes) {
        episodeKeys.add(`${season}:${ep}`)
      }
    }

    if (episodeKeys.size === 0) return null

    let downloadedCount = 0
    episodeKeys.forEach((key) => {
      const [seasonRaw, episodeRaw] = key.split(':')
      const season = Number(seasonRaw)
      const episode = Number(episodeRaw)
      if (!Number.isFinite(season) || !Number.isFinite(episode)) return
      if (episodeDownloaded[season]?.[episode]) {
        downloadedCount += 1
      }
    })

    if (downloadedCount === 0) {
      return { label: 'Missing', icon: '○', className: 'bg-slate-800/60 text-slate-300' }
    }
    if (downloadedCount === episodeKeys.size) {
      return { label: 'Downloaded', icon: '✓', className: 'bg-cyan-900/60 text-cyan-200' }
    }
    return { label: 'Partial', icon: '◐', className: 'bg-fuchsia-900/60 text-fuchsia-200' }
  }

  const getEpisodeStatus = (release: Release) => {
    if (data.type !== 'tv') return null
    const season = getSeason(release)
    if (!season || season <= 0) return null
    const seasonEpisodes = episodeDownloaded[season] || {}

    if (release.full_season) {
      const progress = seasonProgressMap.get(season)
      if (progress && progress.total > 0) {
        if (progress.downloaded === progress.total) {
          return { label: 'Downloaded', icon: '✓', className: 'bg-cyan-900/60 text-cyan-200' }
        }
        if (progress.downloaded > 0) {
          return { label: 'Partial', icon: '◐', className: 'bg-fuchsia-900/60 text-fuchsia-200' }
        }
        return { label: 'Missing', icon: '○', className: 'bg-slate-800/60 text-slate-300' }
      }
      return null
    }

    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((ep) => typeof ep === 'number')
      : []
    if (episodes.length === 0) return null

    let downloadedCount = 0
    for (const ep of episodes) {
      if (seasonEpisodes[ep]) {
        downloadedCount += 1
      }
    }

    if (downloadedCount === 0) {
      return { label: 'Missing', icon: '○', className: 'bg-slate-800/60 text-slate-300' }
    }
    if (downloadedCount === episodes.length) {
      return { label: 'Downloaded', icon: '✓', className: 'bg-cyan-900/60 text-cyan-200' }
    }
    return { label: 'Partial', icon: '◐', className: 'bg-fuchsia-900/60 text-fuchsia-200' }
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const renderReleaseRow = (release: Release, groupKey: string, index: number) => {
    const warning = getSizeWarning(release, data.type)
    const recommendation = getSizeRecommendation(release, data.type)
    const rejectionText = release.rejected && release.rejections && release.rejections.length > 0
      ? release.rejections.join(', ')
      : null
    const releaseGroup = data.type === 'tv' ? extractGroup(release.title) : null
    const episodeLabel = data.type === 'tv' ? getEpisodeLabel(release) : null
    const canGrab = Boolean(release.guid && release.indexer_id)
    const isGrabBusy = grabBusyIds.has(getReleaseKey(release))
    const isAiPick = Boolean(aiPickGuid && release.guid === aiPickGuid)
    const isRequested = Boolean(
      requestedEpisode &&
      (!requestedSeason || getSeason(release) === requestedSeason) &&
      Array.isArray(release.episode) &&
      release.episode.includes(requestedEpisode)
    )
    const rowShade = index % 2 === 0 ? 'bg-slate-900/10' : 'bg-slate-900/20'

    return (
      <div
        key={release.guid || `${groupKey}-${index}`}
        data-release-guid={release.guid || undefined}
        className={`p-3 border-b border-slate-800/80 hover:bg-slate-800/40 ${rowShade} ${
          isAiPick ? 'ring-1 ring-cyan-400/60 bg-cyan-900/10' : ''
        } ${
          isRequested ? 'ring-1 ring-fuchsia-400/60 bg-fuchsia-900/10' : ''
        }`}
      >
        <div>
          <p className="text-xs text-slate-100 leading-snug break-words">
            {release.title}
          </p>

          <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span>{release.size_formatted}</span>
              <span className="text-cyan-300">{release.quality}</span>
              <span className="text-slate-400">{release.age}</span>
              {episodeLabel && (
                <span className="bg-slate-800/60 text-slate-200 px-1.5 rounded">
                  {episodeLabel}
                </span>
              )}
              {release.full_season && (
                <span className="bg-violet-900/60 text-violet-200 px-1.5 rounded">
                  Full Season
                </span>
              )}
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
            <div className="flex flex-wrap items-center gap-2">
              {releaseGroup && data.type === 'tv' && (
                <button
                  type="button"
                  onClick={() => setGroupFocus(releaseGroup)}
                  className="px-2 py-1 rounded bg-slate-800/60 text-slate-200 text-[11px]"
                >
                  Show Group
                </button>
              )}
              <button
                type="button"
                disabled={!canGrab || isGrabBusy}
                onClick={() => onGrabRelease(release)}
                className={`h-7 w-7 inline-flex items-center justify-center rounded text-[11px] ${
                  !canGrab || isGrabBusy
                    ? 'bg-slate-700/60 text-slate-300 cursor-not-allowed'
                    : 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                }`}
                title={!canGrab ? 'Missing release identifiers' : 'Send to download client'}
                aria-label="Grab release"
              >
                {isGrabBusy ? (
                  <span className="text-[10px]">...</span>
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Warnings surfaced via icon tooltip */}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 glass-modal z-50 overflow-auto"
      onClick={onClose}
    >
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto" onClick={(event) => event.stopPropagation()}>
          {/* Header */}
          <div className="glass-panel rounded-t-lg p-4 flex flex-col md:flex-row gap-4 items-start sticky top-0 z-10 relative">
            <div className="flex items-start gap-4 flex-1">
              {data.poster && (
                <div className="w-20 md:w-24 flex-shrink-0">
                  <div className="aspect-[2/3] w-full bg-slate-800/60 rounded">
                    <img
                      src={data.poster}
                      alt={data.title}
                      className="w-full h-full object-contain rounded"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{data.title}</h2>
                <p className="text-gray-400 text-sm">
                  {data.year} | {data.releases.length} releases found
                  {data.runtime && ` | ${data.runtime} min`}
                  {data.season && ` | Season ${data.season}`}
                </p>
                {grabFeedback && (
                  <p className={`mt-2 text-xs ${
                    grabFeedback.type === 'error' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {grabFeedback.text}
                  </p>
                )}
                {releaseAiEnabled && aiSuggestError && (
                  <p className="mt-2 text-xs text-red-400">AI: {aiSuggestError}</p>
                )}
                {releaseAiEnabled && aiSuggestion && (
                  <div className="mt-2 text-xs text-cyan-300">
                    <div>AI pick: {aiSuggestion.title || 'Suggested release'}</div>
                    {aiSuggestion.reason && (
                      <div className="text-cyan-200/80">{aiSuggestion.reason}</div>
                    )}
                    {aiSuggestion.warnings && aiSuggestion.warnings.length > 0 && (
                      <div className="text-amber-200/80">
                        {aiSuggestion.warnings.join(' • ')}
                      </div>
                    )}
                  </div>
                )}
                {data.type === 'tv' && groupFocus && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="glass-chip px-2 py-1 rounded">Group: {groupFocus}</span>
                    <button
                      type="button"
                      onClick={() => setGroupFocus(null)}
                      className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60"
                    >
                      Back to episodes
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pr-8">
              {releaseAiEnabled && aiEnabled && (
                <button
                  type="button"
                  onClick={() => onAiSuggest(aiCandidateReleases)}
                  disabled={!aiSuggestAvailable || aiSuggestBusy}
                  title={!aiSuggestAvailable ? 'Expand a single episode group to enable AI' : undefined}
                className="text-xs px-2 py-1 rounded bg-cyan-700/70 hover:bg-cyan-600/80 disabled:opacity-50"
                >
                  {aiSuggestBusy ? 'Thinking...' : 'AI Suggest'}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-2xl px-2"
              aria-label="Close"
            >
              X
            </button>
          </div>

          {/* Release list */}
          <div className="glass-panel rounded-b-lg">
            {data.releases.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {data.message || 'No releases found. Check indexer configuration.'}
              </div>
            ) : (
              <>
                {/* Desktop table header */}
                <div className="hidden">
                  <div className="col-span-4">
                    <SortHeader
                      label="Release"
                      field="title"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>
                  <div className="col-span-2 text-gray-400">Indexer</div>
                  <div className="col-span-2">
                    <SortHeader
                      label="Size"
                      field="size"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>
                  <div className="col-span-2">
                    <SortHeader
                      label="Quality"
                      field="quality"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>
                  <div className="col-span-1">
                    <SortHeader
                      label="Age"
                      field="age"
                      currentSort={sortField}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>
                  <div className="col-span-1"></div>
                </div>

                {/* Mobile sort buttons */}
                <div className="hidden">
                  <span className="text-gray-400 text-sm">Sort:</span>
                  {(['title', 'size', 'quality', 'age'] as SortField[]).map((field) => (
                    <button
                      key={field}
                      onClick={() => handleSort(field)}
                      className={`px-2 py-1 rounded text-xs ${
                        sortField === field
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                      {sortField === field && sortDirection && (sortDirection === 'asc' ? ' ^' : ' v')}
                    </button>
                  ))}
                </div>

                {/* Release rows */}
                <div className="divide-y divide-slate-800/60">
                  {isMultiSeason ? (
                    seasonGroups.map((seasonGroup) => {
                      const seasonKey = seasonGroup.key
                      const isSeasonCollapsed = collapsedSeasons.has(seasonKey)
                      const groups = buildEpisodeGroups(seasonGroup.releases).map((group) => ({
                        key: `${seasonKey}:${group.key}`,
                        label: group.label,
                        releases: group.releases,
                        showGrabAll: false,
                      }))

                      return (
                        <div key={seasonKey}>
                          <button
                            type="button"
                            onClick={() => toggleSeason(seasonKey)}
                            className="w-full px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-900/60 flex items-center justify-between"
                          >
                            <span>
                              {seasonGroup.label}
                              {(() => {
                                const progressLabel = getSeasonProgressLabel(seasonGroup.season)
                                if (!progressLabel) return null
                                return (
                                  <span className="ml-2 text-cyan-200">
                                    {progressLabel}
                                  </span>
                                )
                              })()}
                              <span className="ml-2 text-slate-400">
                                ({seasonGroup.releases.length} releases)
                              </span>
                            </span>
                            <span className="text-slate-400">
                              {isSeasonCollapsed ? 'Show' : 'Hide'}
                            </span>
                          </button>

                          {!isSeasonCollapsed && (
                            <div className="divide-y divide-slate-800/60">
                              {groups.map((group) => {
                                const groupReleases = sortReleases(group.releases)
                                const isCollapsed = collapsedGroups.has(group.key)

                                return (
                                  <div key={group.key}>
                                    <button
                                      type="button"
                                      onClick={() => toggleGroup(group.key)}
                                      className="w-full px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-900/40 flex items-center justify-between"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>{group.label} ({groupReleases.length})</span>
                                        {(() => {
                                          const status = getEpisodeGroupStatus(group.releases)
                                          if (!status) return null
                                          return (
                                            <span
                                              className={`px-1.5 rounded ${status.className}`}
                                              title={status.label}
                                            >
                                              {status.icon}
                                            </span>
                                          )
                                        })()}
                                      </span>
                                      <span className="text-slate-400">
                                        {isCollapsed ? 'Show' : 'Hide'}
                                      </span>
                                    </button>

                                    {!isCollapsed && groupReleases.map((release, index) => (
                                      renderReleaseRow(release, group.key, index)
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    ((data.type === 'tv' && groupFocus)
                      ? buildSeasonGroups(data.releases).flatMap((seasonGroup) => {
                          const groupReleases = seasonGroup.releases.filter(
                            (release) => extractGroup(release.title) === groupFocus
                          )
                          if (!groupReleases.length) return []
                          return buildFormatBuckets(groupReleases).map((bucket) => ({
                            key: `${seasonGroup.key}:${groupFocus}:${bucket.key}`,
                            label: `${seasonGroup.label} • ${groupFocus} • ${bucket.label}`,
                            releases: bucket.releases,
                            showGrabAll: true,
                          }))
                        })
                      : (tvGroups
                        ? tvGroups.map((group) => ({
                            key: group.key,
                            label: group.label,
                            releases: group.releases,
                            showGrabAll: false,
                          }))
                        : [{ key: 'all', label: '', releases: sortedReleases, showGrabAll: false }]
                      )
                    ).map((group) => {
                      const groupReleases = data.type === 'tv' && groupFocus
                        ? sortByEpisodeOrder(group.releases)
                        : sortReleases(group.releases)
                      const isCollapsed = collapsedGroups.has(group.key)

                      return (
                        <div key={group.key}>
                          {group.label && (
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.key)}
                              className="w-full px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-900/40 flex items-center justify-between"
                            >
                              <span className="flex items-center gap-2">
                                <span>{group.label} ({groupReleases.length})</span>
                                {(() => {
                                  const status = getEpisodeGroupStatus(group.releases)
                                  if (!status) return null
                                  return (
                                    <span
                                      className={`px-1.5 rounded ${status.className}`}
                                      title={status.label}
                                    >
                                      {status.icon}
                                    </span>
                                  )
                                })()}
                              </span>
                              <span className="flex items-center gap-2">
                                {group.showGrabAll && (
                                  (() => {
                                    const grabAllCandidates = groupReleases.filter(
                                      (release) => release.guid && release.indexer_id
                                    )
                                    const grabAllBusy = grabAllCandidates.some((release) =>
                                      grabBusyIds.has(getReleaseKey(release))
                                    )
                                    return (
                                      <button
                                        type="button"
                                        disabled={grabAllCandidates.length === 0 || grabAllBusy}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          openGrabAllModal(grabAllCandidates)
                                        }}
                                        className={`h-7 w-7 inline-flex items-center justify-center rounded text-[11px] ${
                                          grabAllCandidates.length === 0 || grabAllBusy
                                            ? 'bg-slate-700/60 text-slate-300 cursor-not-allowed'
                                            : 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                                        }`}
                                        title={grabAllCandidates.length === 0
                                          ? 'Missing release identifiers'
                                          : 'Send all releases in this group'}
                                        aria-label="Grab all releases"
                                      >
                                        {grabAllBusy ? (
                                          <span className="text-[10px]">...</span>
                                        ) : (
                                          <DownloadAllIcon className="h-4 w-4" />
                                        )}
                                      </button>
                                    )
                                  })()
                                )}
                                <span className="text-slate-400">
                                  {isCollapsed ? 'Show' : 'Hide'}
                                </span>
                              </span>
                            </button>
                          )}

                          {!isCollapsed && groupReleases.map((release, index) => (
                            renderReleaseRow(release, group.key, index)
                          ))}
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

          {grabAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setGrabAllModal(null)}>
          <div
            className="glass-panel rounded-lg max-w-3xl w-full p-4 md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Confirm Grab All</h3>
                <p className="text-xs text-gray-400">
                  Review releases to grab. Uncheck duplicates if needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrabAllModal(null)}
                className="text-gray-400 hover:text-white text-2xl px-2"
              >
                X
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                ref={grabAllSelectAllRef}
                checked={grabAllModal.selected.size === grabAllModal.releases.length}
                onChange={toggleGrabAllAll}
              />
              <span>Select all</span>
            </div>

            <div className="mt-3 max-h-[60vh] overflow-auto space-y-2">
              {sortByEpisodeOrder(grabAllModal.releases).map((release) => {
                const key = getReleaseKey(release)
                const checked = grabAllModal.selected.has(key)
                const episodeLabel = data.type === 'tv' ? getEpisodeLabel(release) : null
                const episodeStatus = getEpisodeStatus(release)
                return (
                  <label
                    key={key}
                    className="flex items-start gap-3 p-2 rounded bg-slate-900/40 border border-slate-800/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGrabAllSelection(release)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-100 break-words">{release.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-2">
                        {episodeLabel && <span>{episodeLabel}</span>}
                        {episodeStatus && (
                          <span
                            className={`px-1.5 rounded ${episodeStatus.className}`}
                            title={episodeStatus.label}
                          >
                            {episodeStatus.icon}
                          </span>
                        )}
                        <span>{release.size_formatted}</span>
                        <span className="text-cyan-300">{release.quality}</span>
                        <span className="text-slate-500">{getResolutionLabel(release)}</span>
                        <span className="text-slate-500">{getSourceLabel(release)}</span>
                        <span className="text-slate-500">{getCodecLabel(release)}</span>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGrabAllModal(null)}
                className="bg-slate-700/60 hover:bg-slate-600/70 text-white py-2 px-4 rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={grabAllModal.selected.size === 0}
                onClick={() => {
                  const selected = grabAllModal.releases.filter((release) =>
                    grabAllModal.selected.has(getReleaseKey(release))
                  )
                  setGrabAllModal(null)
                  onGrabAll(selected)
                }}
              className="bg-cyan-600/90 hover:bg-cyan-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm"
            >
                Grab Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AvailabilityModal({
  mode,
  plan,
  result,
  busy = false,
  error = null,
  onConfirm,
  onSearch,
  onClose,
  onShowReleases,
}: {
  mode: 'ai' | 'info'
  plan?: AIIntentPlan
  result?: DiscoveryResult
  busy?: boolean
  error?: string | null
  onConfirm?: (plan: AIIntentPlan) => void
  onSearch?: (query: string) => void
  onClose: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
}) {
  const isAi = mode === 'ai'
  const intent = plan?.intent
  const [manualQuery, setManualQuery] = useState(plan?.query || '')
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')
  const [availability, setAvailability] = useState<AIAvailability | null>(plan?.availability || null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (isAi) {
      setAvailability(plan?.availability || null)
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      setManualQuery(plan?.query || '')
      return
    }

    if (!result) return
    let active = true

    const fetchAvailability = async () => {
      setAvailability(null)
      setAvailabilityError(null)
      setAvailabilityLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const params = new URLSearchParams({
          query: result.title,
          type: result.type,
        })
        const response = await fetch(`${backendUrl}/availability?${params}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || `HTTP ${response.status}`)
        }
        const data = await response.json()
        if (active) {
          setAvailability(data.availability || null)
        }
      } catch (err) {
        if (active) {
          setAvailabilityError(err instanceof Error ? err.message : 'Failed to fetch availability')
        }
      } finally {
        if (active) {
          setAvailabilityLoading(false)
        }
      }
    }

    fetchAvailability()
    return () => {
      active = false
    }
  }, [isAi, plan?.availability, plan?.query, result])

  const actionLabel = plan?.recommendation === 'watch'
    ? 'Search anyway'
    : (intent?.action === 'download' ? 'Find releases' : 'Search')

  const renderStreamingOptions = () => (
    <>
      {availabilityLoading && (
        <div className="text-xs text-gray-400">Loading streaming options...</div>
      )}
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
                    <img
                      src={provider.logo_url}
                      alt={provider.name}
                      className="h-5 w-5 object-contain"
                    />
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
        <a
          href={availability.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-cyan-300 hover:text-cyan-200"
        >
          View streaming options
        </a>
      )}
      {availabilityError && (
        <div className="text-xs text-red-400">Streaming: {availabilityError}</div>
      )}
    </>
  )

  if (isAi && !plan) return null
  if (!isAi && !result) return null

  return (
    <div className="fixed inset-0 glass-modal z-50 overflow-auto" onClick={onClose}>
      <div className="min-h-screen p-4">
        <div
          className={`mx-auto glass-panel rounded-lg p-4 md:p-6 ${
            isAi ? 'max-w-2xl' : 'max-w-3xl'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold">
                {isAi ? 'Plan & Availability' : result?.title}
              </h2>
              {isAi ? (
                <p className="text-gray-400 text-sm">"{plan?.query}"</p>
              ) : (
                <p className="text-gray-400 text-sm">
                  {result?.type === 'movie' ? 'Movie' : 'TV Series'}
                  {result?.year ? ` • ${result.year}` : ''}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl px-2">
              X
            </button>
          </div>

          {isAi ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[120px,1fr] text-sm">
              <div>
                {availability?.poster_url ? (
                  <div className="w-full rounded-lg bg-slate-800/60 overflow-hidden">
                    <img
                      src={availability.poster_url}
                      alt={availability.title || intent?.title}
                      className="w-full h-auto object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full rounded-lg bg-slate-800/60 flex items-center justify-center text-xs text-gray-500 p-6">
                    No poster
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="text-slate-200 text-lg font-semibold">
                  {availability?.title || intent?.title || plan?.query || 'Unknown'}
                </div>
                <div className="text-gray-400 text-xs">
                  {availability?.year || 'Unknown year'} {intent?.media_type && intent.media_type !== 'unknown' && `• ${intent.media_type}`}
                </div>
                {availability?.overview && (
                  <div
                    className="text-gray-300 text-xs leading-relaxed"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {availability.overview}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  {intent?.season && (
                    <span className="glass-chip px-2 py-1 rounded">Season {intent.season}</span>
                  )}
                  {intent?.episode && (
                    <span className="glass-chip px-2 py-1 rounded">Episode {intent.episode}</span>
                  )}
                  {intent?.episode_date && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.episode_date}</span>
                  )}
                  {intent?.quality && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.quality}</span>
                  )}
                  {intent?.action && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.action}</span>
                  )}
                </div>
                {intent?.notes && (
                  <div
                    className="text-gray-300"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {intent.notes}
                  </div>
                )}
                {renderStreamingOptions()}
                {plan?.recommendation === 'watch' && (
                  <div className="text-amber-300 text-xs">
                    Recommendation: stream instead of downloading.
                  </div>
                )}
                {error && (
                  <div className="text-red-400 text-xs">AI: {error}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid md:grid-cols-[160px,1fr] gap-4">
              <div className="w-full">
                {result?.poster ? (
                  <img
                    src={result.poster}
                    alt={result.title}
                    className="w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-full h-56 rounded-lg bg-slate-800/60 flex items-center justify-center text-gray-500 text-xs">
                    No poster
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {result && <StatusBadge status={result.status} />}
                  {result?.runtime && result.type === 'movie' && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.runtime} min
                    </span>
                  )}
                  {result?.type === 'tv' && result.seasons && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.seasons} season{result.seasons !== 1 ? 's' : ''}
                    </span>
                  )}
                  {result?.series_status && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.series_status}
                    </span>
                  )}
                  {result?.network && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.network}
                    </span>
                  )}
                </div>

                {result?.genres && result.genres.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.genres.slice(0, 5).map((genre) => (
                      <span key={genre} className="glass-chip text-xs px-2 py-1 rounded">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {result?.ratings && result.ratings.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.ratings
                      .filter((rating) => rating.source.toLowerCase() !== 'trakt')
                      .map((rating) => (
                        <RatingBadge
                          key={rating.source}
                          rating={rating}
                          href={getRatingLink(result, rating)}
                        />
                      ))}
                  </div>
                )}

                {result?.overview && (
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {result.overview}
                  </p>
                )}

                {renderStreamingOptions()}

                {result?.type === 'tv' && result.seasons && result.seasons > 0 && (
                  <div>
                    <label className="text-xs text-gray-400">Season</label>
                    <select
                      value={selectedSeason}
                      onChange={(event) => {
                        const value = event.target.value
                        setSelectedSeason(value === 'all' ? 'all' : Number(value))
                      }}
                      className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                    >
                      <option value="all">All seasons</option>
                      {Array.from({ length: result.seasons }, (_, index) => index + 1).map((season) => (
                        <option key={season} value={season}>
                          Season {season}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!result || !onShowReleases) return
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
              </div>
            </div>
          )}

          {isAi && (
            <>
              <div className="mt-4">
                <label className="text-xs text-gray-400">Search a different title</label>
                <div className="mt-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
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
                <button
                  type="button"
                  onClick={() => plan && onConfirm?.(plan)}
                  disabled={busy}
                  className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium"
                >
                  {busy ? 'Working...' : actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => plan && onSearch?.(plan.query)}
                  disabled={busy}
                  className="bg-slate-800/70 hover:bg-slate-700/70 text-white py-2 px-4 rounded text-sm"
                >
                  Search original query
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-slate-700/60 hover:bg-slate-600/70 text-white py-2 px-4 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Discovery card component
function DiscoveryCard({
  result,
  onShowReleases,
  onShowDetails,
}: {
  result: DiscoveryResult
  onShowReleases: (result: DiscoveryResult, season?: number) => void
  onShowDetails: (result: DiscoveryResult) => void
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')

  const handleReleasesClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (result.type === 'tv' && selectedSeason !== 'all') {
      onShowReleases(result, selectedSeason)
      return
    }
    onShowReleases(result)
  }

  return (
    <div className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40">
      {/* Poster */}
      <div className="w-24 md:w-32 flex-shrink-0">
        <div className="aspect-[2/3] w-full bg-slate-800/60">
          <button
            type="button"
            onClick={() => onShowDetails(result)}
            className="w-full h-full"
            title="Open details"
          >
            {result.poster ? (
              <img
                src={result.poster}
                alt={result.title}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                No poster
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-2 sm:p-3 grid grid-cols-1 md:grid-cols-[1fr,140px] gap-2 md:gap-3 min-w-0">
        {/* Title and year */}
        <div className="min-w-0">
          <div className="mb-1">
            <h3 className="font-semibold text-sm sm:text-base leading-tight truncate">
              {result.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm text-gray-400">
              {result.year && <span>{result.year}</span>}
              {result.type === 'movie' && result.runtime && (
                <span>{result.runtime} min</span>
              )}
              {result.type === 'tv' && result.seasons && (
                <span>{result.seasons} season{result.seasons !== 1 ? 's' : ''}</span>
              )}
              {result.type === 'tv' && result.network && (
                <span className="truncate">{result.network}</span>
              )}
            </div>
          </div>

          <div className="mb-1 flex flex-wrap gap-1.5 items-center">
            <StatusBadge status={result.status} />
            <span className="glass-chip text-xs px-2 py-1 rounded">
              {result.type === 'movie' ? 'Movie' : 'TV'}
            </span>
            {result.type === 'tv' && result.seasons && result.seasons > 0 && (
              <select
                value={selectedSeason}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedSeason(value === 'all' ? 'all' : Number(value))
                }}
                onClick={(event) => event.stopPropagation()}
                className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-[11px]"
                title="Season"
              >
                <option value="all">All seasons</option>
                {Array.from({ length: result.seasons }, (_, index) => index + 1).map((season) => (
                  <option key={season} value={season}>
                    Season {season}
                  </option>
                ))}
              </select>
            )}
          </div>

          {result.overview && (
            <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-1 sm:line-clamp-2 mb-2 sm:mb-3">
              {result.overview}
            </p>
          )}

          {/* Season picker moved to right column */}
        </div>

        <div className="flex flex-wrap items-center justify-between md:flex-col md:items-end md:justify-start gap-2">
          {result.ratings && result.ratings.length > 0 && (
            <div className="flex flex-wrap justify-start md:justify-end gap-1.5 sm:gap-2">
              {result.ratings
                .filter((rating) => rating.source.toLowerCase() !== 'trakt')
                .slice(0, 3)
                .map((rating, idx) => (
                  <span
                    key={rating.source}
                    className={idx === 0 ? 'inline-flex' : 'hidden sm:inline-flex'}
                  >
                    <RatingBadge
                      rating={rating}
                      href={getRatingLink(result, rating)}
                    />
                  </span>
                ))}
            </div>
          )}

          <button
            onClick={handleReleasesClick}
            className="bg-cyan-500/80 hover:bg-cyan-400 text-white py-1 px-2 sm:py-1.5 sm:px-3 rounded text-[11px] sm:text-xs font-semibold tracking-wide transition-colors ml-auto md:ml-0"
          >
            Find Releases
          </button>
        </div>
      </div>
    </div>
  )
}

// SABnzbd Queue component
function SabQueue({
  data,
  error,
  onRefresh,
  onPauseAll,
  onResumeAll,
  onPauseJob,
  onResumeJob,
  onDeleteJob,
  actionBusy,
}: {
  data: SabQueueResponse | null
  error: string | null
  onRefresh: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onPauseJob: (jobId: string) => void
  onResumeJob: (jobId: string) => void
  onDeleteJob: (jobId: string) => void
  actionBusy: boolean
}) {
  if (error) {
    return <div className="text-red-400">Error fetching queue: {error}</div>
  }
  if (!data) {
    return <div className="text-yellow-400">Loading queue...</div>
  }
  if (data.jobs.length === 0) {
    return <div className="text-gray-400">Nothing downloading</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPauseAll}
          disabled={actionBusy}
          className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
          title="Pause all"
          aria-label="Pause all"
        >
          ||
        </button>
        <button
          type="button"
          onClick={onResumeAll}
          disabled={actionBusy}
          className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
          title="Resume all"
          aria-label="Resume all"
        >
          {'>'}
        </button>
      </div>
      {data.jobs.map((job) => {
        const percent = Number(job.percentage) || 0
        const isPaused = job.status?.toLowerCase().includes('pause')
        return (
          <div key={job.name} className="glass-card rounded-lg p-3">
            <p className="text-sm truncate font-semibold" title={job.name}>{job.name}</p>
            <div className="text-xs text-gray-400 mt-1 flex justify-between">
              <span>{job.status}</span>
              <span>{job.eta} remaining</span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-2.5 mt-2">
              <div
                className="bg-cyan-500 h-2.5 rounded-full"
                style={{ width: `${percent}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-400 mt-1 flex justify-between items-center gap-2">
              <span>{percent}%</span>
              <span className="ml-auto">{job.size_remaining} / {job.size_total} MB</span>
            </div>
            {job.id && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isPaused ? onResumeJob(job.id as string) : onPauseJob(job.id as string))}
                  disabled={actionBusy}
                  className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
                  title={isPaused ? 'Resume' : 'Pause'}
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? '>' : '||'}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteJob(job.id as string)}
                  disabled={actionBusy}
                  className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
                  title="Delete"
                  aria-label="Delete"
                >
                  X
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// SABnzbd Recent component
function SabRecent({ data, error }: { data: SabRecentResponse | null, error: string | null }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const initializedRef = useRef(false)

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  
  // Initially, collapse all groups for consistent behavior
  useEffect(() => {
    if (!data || initializedRef.current) return
    const initialCollapsed = new Set(data.groups.map(g => g.groupKey))
    setCollapsedGroups(initialCollapsed)
    initializedRef.current = true
  }, [data])

  if (error) {
    return <div className="text-red-400">Error fetching recent items: {error}</div>
  }
  if (!data) {
    return <div className="text-yellow-400">Loading recent items...</div>
  }
  if (data.groups.length === 0) {
    return <div className="text-gray-400">No recent downloads</div>
  }

  return (
    <div className="space-y-3">
      {data.groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.groupKey)
        const sizeText = group.totalSize > 0 ? `${(group.totalSize / (1024 ** 3)).toFixed(2)} GB` : 'Unknown size'
        
        return (
          <div key={group.groupKey} className="glass-card rounded-lg">
            <button
              className="p-3 w-full text-left"
              onClick={() => toggleGroup(group.groupKey)}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold truncate" title={group.title}>{group.title}</p>
                <span className="text-xs text-gray-400">{isCollapsed ? 'Show' : 'Hide'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                <span>{group.count} item(s)</span>
                <span className="mx-2">|</span>
                <span>{sizeText}</span>
                <span className="mx-2">|</span>
                <span>{formatTimestamp(group.latestCompletedTime)}</span>
              </div>
            </button>
            {!isCollapsed && (
              <div className="border-t border-slate-700/60 px-3 py-2 space-y-2">
                {group.items.map(item => (
                  <div key={item.name} className="text-xs">
                    <p className="text-gray-300 truncate" title={item.name}>{item.name}</p>
                    <div className="text-gray-500 flex justify-between">
                       <span>{item.status} - {item.size}</span>
                       <span>{formatTimestamp(item.completedTime, 'time')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function HomeContent() {
  const [health, setHealth] = useState<HealthStatus>(null)
  const [config, setConfig] = useState<ConfigStatus>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [filterType, setFilterType] = useState<SearchFilterType>('all')
  const [filterStatus, setFilterStatus] = useState<SearchStatusFilter>('all')
  const [sortField, setSortField] = useState<SearchSortField>('relevance')
  const [sortDirection, setSortDirection] = useState<SearchSortDirection>('desc')
  const [page, setPage] = useState(1)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [submittingSearch, setSubmittingSearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<DiscoveryResult | null>(null)
  
  // SABnzbd state
  const [sabQueue, setSabQueue] = useState<SabQueueResponse | null>(null)
  const [sabRecent, setSabRecent] = useState<SabRecentResponse | null>(null)
  const [sabLoading, setSabLoading] = useState(false)
  const [sabQueueError, setSabQueueError] = useState<string | null>(null)
  const [sabRecentError, setSabRecentError] = useState<string | null>(null)
  const [sabActionBusy, setSabActionBusy] = useState(false)
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatus | null>(null)
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)
  const aiEnabled = Boolean(config?.features.ai_suggestions && config?.ai.api_key)

  const pageSize = 10

  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSyncRef = useRef<string | null>(null)

  // Release view state
  const [releaseData, setReleaseData] = useState<ReleaseResponse | null>(null)
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [grabBusyIds, setGrabBusyIds] = useState<Set<string>>(new Set())
  const [grabFeedback, setGrabFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null)
  const [aiSuggestBusy, setAiSuggestBusy] = useState(false)
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null)
  const [aiIntentPlan, setAiIntentPlan] = useState<AIIntentPlan | null>(null)
  const [aiIntentBusy, setAiIntentBusy] = useState(false)
  const [aiIntentError, setAiIntentError] = useState<string | null>(null)
  const [aiIntentEnabled, setAiIntentEnabled] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<'search' | 'downloads' | 'status' | 'settings'>('search')
  const [streamingUpdateBusy, setStreamingUpdateBusy] = useState(false)
  const [streamingUpdateError, setStreamingUpdateError] = useState<string | null>(null)
  const [settingsCountry, setSettingsCountry] = useState('')
  const [settingsAiModel, setSettingsAiModel] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const sabPollInFlight = useRef(false)

  const handleHome = () => {
    setSearchQuery('')
    setActiveQuery('')
    setSearchResults(null)
    setSelectedResult(null)
    setReleaseData(null)
    setReleaseError(null)
    setAiIntentPlan(null)
    setAiIntentError(null)
    setPage(1)
    setActiveSection('search')
    router.push('/')
  }

  const fetchSabData = async (silent?: boolean) => {
    if (sabPollInFlight.current) {
      return
    }
    sabPollInFlight.current = true
    if (!silent) {
      setSabLoading(true)
    }
    setSabQueueError(null)
    setSabRecentError(null)
    const backendUrl = getBackendUrl()
    
    try {
      // Fetch queue and recent in parallel
      const [queueRes, recentRes] = await Promise.all([
        fetch(`${backendUrl}/sab/queue`),
        fetch(`${backendUrl}/sab/recent?limit=5`)
      ])

      if (!queueRes.ok) {
         const errorData = await queueRes.json().catch(() => ({}))
         throw new Error(`Queue: ${errorData.detail || `HTTP ${queueRes.status}`}`)
      }
      setSabQueue(await queueRes.json())

      if (!recentRes.ok) {
         const errorData = await recentRes.json().catch(() => ({}))
         throw new Error(`Recent: ${errorData.detail || `HTTP ${recentRes.status}`}`)
      }
      setSabRecent(await recentRes.json())

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to SABnzbd'
      if (msg.startsWith('Queue:')) {
        setSabQueueError(msg.replace('Queue: ', ''))
      } else if (msg.startsWith('Recent:')) {
        setSabRecentError(msg.replace('Recent: ', ''))
      } else {
        setSabQueueError(msg)
        setSabRecentError(msg)
      }
    } finally {
      if (!silent) {
        setSabLoading(false)
      }
      sabPollInFlight.current = false
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      const backendUrl = getBackendUrl()

      try {
        const [healthRes, configRes, statusRes] = await Promise.all([
          fetch(`${backendUrl}/health`),
          fetch(`${backendUrl}/config`),
          fetch(`${backendUrl}/integrations/status`),
        ])
        if (!healthRes.ok) throw new Error(`Health: HTTP ${healthRes.status}`)
        const healthData = await healthRes.json()
        setHealth(healthData)

        if (!configRes.ok) throw new Error(`Config: HTTP ${configRes.status}`)
        const configData = await configRes.json()
        setConfig(configData)
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setIntegrationsStatus(statusData)
        } else {
          setIntegrationsStatus(null)
        }

        setError(null)
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setHealth(null)
        setConfig(null)
        setIntegrationsStatus(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const sabSectionVisible = activeSection === 'downloads'

  useEffect(() => {
    if (!sabConfigured || !sabSectionVisible) return

    fetchSabData()

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSabData(true)
      }
    }, 2000)

    return () => {
      clearInterval(intervalId)
    }
  }, [sabConfigured, sabSectionVisible])

  const runSearch = async (query: string, nextPage: number) => {
    setSubmittingSearch(true)
    setSearching(true)
    setSearchError(null)

    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({
        query,
        page: nextPage.toString(),
        page_size: pageSize.toString(),
        sort_by: sortField,
        sort_dir: sortDirection,
      })

      if (filterType !== 'all') {
        params.set('type', filterType)
      }
      if (filterStatus !== 'all') {
        params.set('status', filterStatus)
      }

      const response = await fetch(`${backendUrl}/search?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setSearchResults(data)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchResults(null)
    } finally {
      setSearching(false)
      setSubmittingSearch(false)
    }
  }

  useEffect(() => {
    const q = searchParams.get('q') || ''
    const typeParam = searchParams.get('type') as SearchFilterType | null
    const statusParam = searchParams.get('status') as SearchStatusFilter | null
    const sortParam = searchParams.get('sort') as SearchSortField | null
    const dirParam = searchParams.get('dir') as SearchSortDirection | null

    const type = ['all', 'movie', 'tv'].includes(typeParam || '') ? (typeParam || 'all') : 'all'
    const status = ['all', 'not_in_library', 'in_library', 'downloaded'].includes(statusParam || '') ? (statusParam || 'all') : 'all'
    const sort = ['relevance', 'year', 'title', 'rating', 'popularity'].includes(sortParam || '') ? (sortParam || 'relevance') : 'relevance'
    const dir = ['asc', 'desc'].includes(dirParam || '') ? (dirParam || 'desc') : 'desc'
    const pageParam = Number(searchParams.get('page') || 1)

    const nextPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam

    urlSyncRef.current = searchParams.toString()

    if (q !== activeQuery) setActiveQuery(q)
    if (q !== searchQuery) setSearchQuery(q)
    if (type !== filterType) setFilterType(type)
    if (status !== filterStatus) setFilterStatus(status)
    if (sort !== sortField) setSortField(sort)
    if (sort !== 'relevance' && dir !== sortDirection) setSortDirection(dir)
    if (sort === 'relevance' && sortDirection !== 'desc') setSortDirection('desc')
    if (nextPage !== page) setPage(nextPage)
  }, [searchParams])

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('ai_intent_enabled')
      if (stored !== null) {
        setAiIntentEnabled(stored === 'true')
      }
    } catch {
      // Ignore storage errors.
    }
  }, [])


  useEffect(() => {
    setSelectedResult(null)
    setReleaseData(null)
    setReleaseError(null)
    setGrabFeedback(null)
    setGrabBusyIds(new Set())
    setAiSuggestion(null)
    setAiSuggestError(null)
    setAiSuggestBusy(false)
    setAiIntentPlan(null)
    setAiIntentError(null)
    setAiIntentBusy(false)
  }, [searchParams])

  useEffect(() => {
    if (!config) return
    setSettingsCountry(config.user.country || '')
    setSettingsAiModel(config.ai.model || '')
    setSettingsSaved(false)
  }, [config?.user.country, config?.ai.model])

  useEffect(() => {
    if (!activeQuery) return
    runSearch(activeQuery, page)
  }, [activeQuery, page, filterType, filterStatus, sortField, sortDirection])

  useEffect(() => {
    if (!activeQuery) return

    const params = new URLSearchParams()
    params.set('q', activeQuery)
    if (filterType !== 'all') params.set('type', filterType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    params.set('sort', sortField)
    if (sortField !== 'relevance') {
      params.set('dir', sortDirection)
    } else {
      params.delete('dir')
    }
    params.set('page', page.toString())

    const next = params.toString()
    if (urlSyncRef.current === next) return
    urlSyncRef.current = next
    router.push(`/?${next}`)
  }, [activeQuery, filterType, filterStatus, sortField, sortDirection, page, router])

  const submitSearch = async () => {
    if (searching) return
    let trimmed = searchQuery.trim()
    if (!trimmed) return

    const normalized = normalizeIdQuery(trimmed)
    trimmed = normalized.query
    if (normalized.isIdQuery && trimmed !== searchQuery) {
      setSearchQuery(trimmed)
    }
    if (normalized.forcedType && filterType !== normalized.forcedType) {
      setFilterType(normalized.forcedType)
    }

    setSearchResults(null)
    setSelectedResult(null)
    setPage(1)
    setSubmittingSearch(true)
    if (normalized.isIdQuery || !aiEnabled || !aiIntentEnabled) {
      setActiveQuery(trimmed)
      return
    }

    setActiveQuery(trimmed)
    setAiIntentBusy(true)
    setAiIntentError(null)
    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/ai/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      setAiIntentPlan({
        query: trimmed,
        intent: data.intent,
        availability: data.availability,
        recommendation: data.recommendation,
      })
      setSubmittingSearch(false)
    } catch (err) {
      setAiIntentError(err instanceof Error ? err.message : 'AI intent failed')
      try {
        const backendUrl = getBackendUrl()
        const availRes = await fetch(
          `${backendUrl}/availability?query=${encodeURIComponent(trimmed)}`
        )
        const availData = availRes.ok ? await availRes.json() : {}
        const availability = availData.availability || null
        setAiIntentPlan({
          query: trimmed,
          intent: {
            media_type: availability?.media_type || 'unknown',
            title: availability?.title || trimmed,
            action: 'search',
          },
          availability: availability || undefined,
          recommendation: availability?.subscribed?.length ? 'watch' : 'search',
        })
        setSubmittingSearch(false)
      } catch {
        setActiveQuery(trimmed)
      }
    } finally {
      setAiIntentBusy(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    submitSearch()
  }

  const handleShowReleases = async (result: DiscoveryResult, season?: number) => {
    setLoadingReleases(true)
    setReleaseError(null)
    setGrabFeedback(null)
    setAiSuggestion(null)
    setAiSuggestError(null)

    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({
        type: result.type,
        title: result.title,
      })

      if (result.type === 'movie' && result.tmdb_id) {
        params.set('tmdb_id', result.tmdb_id.toString())
      } else if (result.type === 'tv' && result.tvdb_id) {
        params.set('tvdb_id', result.tvdb_id.toString())
        if (season) {
          params.set('season', season.toString())
        }
      }

      const response = await fetch(`${backendUrl}/releases?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setReleaseData({
        ...data,
        poster: result.poster,
        title: data.title || result.title,
        year: data.year || result.year,
        type: data.type || result.type,
      })
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'Failed to fetch releases')
    } finally {
      setLoadingReleases(false)
    }
  }

  const executePlan = async (plan: AIIntentPlan) => {
    setAiIntentPlan(null)
    setReleaseError(null)
    setReleaseData(null)
    setSearchResults(null)
    setSelectedResult(null)

    const intent = plan.intent
    if (!intent || !intent.title || intent.media_type === 'unknown') {
      setActiveQuery(plan.query)
      return
    }

    setLoadingReleases(true)
    try {
      const backendUrl = getBackendUrl()
      const lookupRes = await fetch(
        `${backendUrl}/lookup?type=${intent.media_type}&query=${encodeURIComponent(intent.title)}`
      )
      if (!lookupRes.ok) {
        const errorData = await lookupRes.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${lookupRes.status}`)
      }
      const lookupData = await lookupRes.json()
      const top = Array.isArray(lookupData.results) ? lookupData.results[0] : null
      if (!top) {
        setActiveQuery(plan.query)
        return
      }

      const params = new URLSearchParams({
        type: intent.media_type,
        title: top.title || intent.title,
      })
      if (intent.media_type === 'movie') {
        if (!top.tmdb_id) {
          setActiveQuery(plan.query)
          return
        }
        params.set('tmdb_id', String(top.tmdb_id))
      } else {
        if (!top.tvdb_id) {
          setActiveQuery(plan.query)
          return
        }
        params.set('tvdb_id', String(top.tvdb_id))
        if (intent.season) {
          params.set('season', String(intent.season))
        }
        if (intent.episode) {
          params.set('episode', String(intent.episode))
        }
        if (intent.episode_date) {
          params.set('episode_date', intent.episode_date)
        }
      }

      const response = await fetch(`${backendUrl}/releases?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      setReleaseData({
        ...data,
        poster: top.poster,
        title: data.title || top.title || intent.title,
        year: data.year || top.year,
        type: data.type || intent.media_type,
        requested_season: intent.season || undefined,
        requested_episode: intent.episode || undefined,
      })
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'Failed to fetch releases')
    } finally {
      setLoadingReleases(false)
    }
  }

  const runPlainSearch = (query: string) => {
    let trimmed = query.trim()
    if (!trimmed) return

    const normalized = normalizeIdQuery(trimmed)
    trimmed = normalized.query
    setAiIntentPlan(null)
    setReleaseError(null)
    setReleaseData(null)
    setSearchResults(null)
    setSelectedResult(null)
    setAiIntentError(null)
    setSearchQuery(trimmed)
    if (normalized.forcedType && filterType !== normalized.forcedType) {
      setFilterType(normalized.forcedType)
    }
    setActiveQuery(trimmed)
    setPage(1)
  }

  const handleAiSearch = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    if (trimmed === activeQuery) {
      setAiIntentPlan(null)
      return
    }
    runPlainSearch(trimmed)
  }

  const handleGrabRelease = async (release: Release) => {
    if (!release.guid || !release.indexer_id || !releaseData) {
      setGrabFeedback({ type: 'error', text: 'Missing release identifiers for grab.' })
      return
    }

    const releaseKey = getReleaseKey(release)
    setGrabFeedback(null)
    setGrabBusyIds((prev) => {
      const next = new Set(prev)
      next.add(releaseKey)
      return next
    })

    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/releases/grab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData.type,
          guid: release.guid,
          indexer_id: release.indexer_id,
          title: release.title,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      setGrabFeedback({ type: 'success', text: 'Sent to download client.' })
      if (sabConfigured) {
        await fetchSabData(true)
      }
    } catch (err) {
      setGrabFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to grab release',
      })
    } finally {
      setGrabBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(releaseKey)
        return next
      })
    }
  }

  const handleGrabAll = async (releases: Release[]) => {
    if (!releaseData) return
    const eligible = releases.filter((release) => release.guid && release.indexer_id)
    if (!eligible.length) {
      setGrabFeedback({ type: 'error', text: 'Missing release identifiers for grab.' })
      return
    }

    setGrabFeedback(null)
    setGrabBusyIds((prev) => {
      const next = new Set(prev)
      eligible.forEach((release) => next.add(getReleaseKey(release)))
      return next
    })

    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/releases/grab-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData.type,
          releases: eligible.map((release) => ({
            guid: release.guid,
            indexer_id: release.indexer_id,
            title: release.title,
          })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.status === 'partial') {
        const failureCount = Array.isArray(data.failures) ? data.failures.length : 0
        const successCount = typeof data.success === 'number' ? data.success : eligible.length - failureCount
        setGrabFeedback({
          type: successCount > 0 ? 'success' : 'error',
          text: `Grabbed ${successCount} release${successCount === 1 ? '' : 's'}, ${failureCount} failed.`,
        })
      } else {
        setGrabFeedback({
          type: 'success',
          text: `Sent ${eligible.length} releases to download client.`,
        })
      }

      if (sabConfigured) {
        await fetchSabData(true)
      }
    } catch (err) {
      setGrabFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to grab releases',
      })
    } finally {
      setGrabBusyIds((prev) => {
        const next = new Set(prev)
        eligible.forEach((release) => next.delete(getReleaseKey(release)))
        return next
      })
    }
  }

  const handleAiSuggest = async (releasesForAi: Release[]) => {
    if (!releaseData) return
    setAiSuggestBusy(true)
    setAiSuggestError(null)
    setAiSuggestion(null)

    try {
      const sortedCandidates = sortReleasesForAi(releasesForAi)
      const limitedCandidates = sortedCandidates.slice(0, 6)
      if (!limitedCandidates.length) {
        throw new Error('Expand a single episode group to use AI')
      }
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/ai/release/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: releaseData.type,
          title: releaseData.title,
          releases: limitedCandidates.map((release) => ({
            title: release.title,
            size: release.size,
            size_formatted: release.size_formatted,
            size_gb: release.size_gb,
            quality: release.quality,
            indexer: release.indexer,
            age: release.age,
            protocol: release.protocol,
            guid: release.guid,
            rejected: release.rejected,
            rejections: release.rejections,
            season: release.season,
            episode: release.episode,
            full_season: release.full_season,
          })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      if (!data.suggestion) {
        throw new Error('AI returned no suggestion')
      }
      setAiSuggestion(data.suggestion)
    } catch (err) {
      setAiSuggestError(err instanceof Error ? err.message : 'AI suggestion failed')
    } finally {
      setAiSuggestBusy(false)
    }
  }

  const performSabAction = async (path: string) => {
    setSabActionBusy(true)
    setSabQueueError(null)

    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}${path}`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchSabData(true)
    } catch (err) {
      setSabQueueError(err instanceof Error ? err.message : 'Failed to update queue')
    } finally {
      setSabActionBusy(false)
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

  const getToolIconUrl = (url: string) => `${url.replace(/\/$/, '')}/favicon.ico`

  const getIntegrationStatus = (key: keyof IntegrationsStatus) => {
    if (!integrationsStatus) return null
    return integrationsStatus[key]?.status === 'ok'
  }

  const toolLinks = [
    {
      key: 'sonarr',
      label: 'Sonarr',
      url: config?.integrations.sonarr_url || getLocalToolUrl(8989),
      iconUrl: getToolIconUrl(config?.integrations.sonarr_url || getLocalToolUrl(8989)),
      status: getIntegrationStatus('sonarr'),
    },
    {
      key: 'radarr',
      label: 'Radarr',
      url: config?.integrations.radarr_url || getLocalToolUrl(7878),
      iconUrl: getToolIconUrl(config?.integrations.radarr_url || getLocalToolUrl(7878)),
      status: getIntegrationStatus('radarr'),
    },
    {
      key: 'sabnzbd',
      label: 'SABnzbd',
      url: config?.integrations.sabnzbd_url || getLocalToolUrl(8080),
      iconUrl: getToolIconUrl(config?.integrations.sabnzbd_url || getLocalToolUrl(8080)),
      status: getIntegrationStatus('sabnzbd'),
    },
    {
      key: 'plex',
      label: 'Plex',
      url: getLocalToolUrl(32400, '/web'),
      iconUrl: getToolIconUrl(getLocalToolUrl(32400, '/web')),
      status: null,
    },
  ]
  const enabledStreamingServices = config?.streaming_services.filter((service) => service.enabled) || []

  const handlePauseAll = () => performSabAction('/sab/queue/pause')
  const handleResumeAll = () => performSabAction('/sab/queue/resume')
  const handlePauseJob = (jobId: string) => performSabAction(`/sab/queue/item/${jobId}/pause`)
  const handleResumeJob = (jobId: string) => performSabAction(`/sab/queue/item/${jobId}/resume`)
  const handleDeleteJob = (jobId: string) => performSabAction(`/downloads/queue/item/${jobId}/delete`)

  const handleStreamingToggle = async (id: string, enabled: boolean) => {
    if (!config) return
    setStreamingUpdateBusy(true)
    setStreamingUpdateError(null)
    const current = config.streaming_services || []
    const nextEnabled = current
      .map((service) => ({
        ...service,
        enabled: service.id === id ? enabled : service.enabled,
      }))
      .filter((service) => service.enabled)
      .map((service) => service.id)

    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/config/streaming_services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_ids: nextEnabled }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data?.config) {
        setConfig(data.config)
      }
    } catch (err) {
      setStreamingUpdateError(err instanceof Error ? err.message : 'Failed to update services')
    } finally {
      setStreamingUpdateBusy(false)
    }
  }

  const saveSettings = async () => {
    if (!config) return
    setSettingsSaving(true)
    setSettingsError(null)
    setSettingsSaved(false)

    try {
      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: settingsCountry.trim().toUpperCase(),
          ai_model: settingsAiModel.trim(),
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data?.config) {
        setConfig(data.config)
      }
      setSettingsSaved(true)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSettingsSaving(false)
    }
  };

  return (
    <main className="min-h-screen pt-24 px-4 pb-4 md:px-8 md:pb-8">
      <header className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3 glass-panel border-b border-slate-700/40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="px-2 py-2 rounded bg-slate-800/60 text-slate-200 inline-flex items-center"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleHome}
            className="text-lg md:text-xl font-semibold tracking-wide hover:text-cyan-300 transition-colors"
            title="Go home"
          >
            Quasrr
          </button>

          

        </div>

        {menuOpen && (
          <div className="mt-3 grid gap-2 text-sm text-slate-200">
            <button
              type="button"
              onClick={() => {
                handleHome()
                setMenuOpen(false)
              }}
              className="px-3 py-2 rounded inline-flex items-center gap-2 text-left bg-slate-800/50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12l9-9 9 9" />
                <path d="M5 10v10h14V10" />
              </svg>
              <span>Home</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('search')
                setMenuOpen(false)
              }}
              className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
                activeSection === 'search' ? 'bg-slate-700/60' : 'bg-slate-800/50'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('downloads')
                setMenuOpen(false)
              }}
              className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
                activeSection === 'downloads' ? 'bg-slate-700/60' : 'bg-slate-800/50'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              <span>Download Activity</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('status')
                setMenuOpen(false)
              }}
              className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
                activeSection === 'status' ? 'bg-slate-700/60' : 'bg-slate-800/50'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h4l2-4 4 8 2-4h4" />
              </svg>
              <span>System Status</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('settings')
                setMenuOpen(false)
              }}
              className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
                activeSection === 'settings' ? 'bg-slate-700/60' : 'bg-slate-800/50'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
              <span>Settings</span>
            </button>
            <div className="border-t border-slate-700/40 pt-2 mt-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Tools</div>
              {toolLinks.map((tool) => (
                <a
                  key={tool.key}
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 px-3 py-2 rounded inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60"
                >
                  <img
                    src={tool.iconUrl}
                    alt={`${tool.label} icon`}
                    className={`h-4 w-4 object-contain ${tool.status === false ? 'opacity-40 grayscale' : ''}`}
                    loading="lazy"
                  />
                  <span>{tool.label}</span>
                </a>
              ))}
            </div>
            <div className="border-t border-slate-700/40 pt-2 mt-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Streaming Services</div>
              {enabledStreamingServices.length === 0 ? (
                <span className="mt-2 px-3 py-2 text-xs text-slate-500">None enabled</span>
              ) : (
                enabledStreamingServices.map((service) => {
                  const link = getStreamingLink(service.id)
                    || `https://www.${service.id.replace(/_/g, '')}.com`
                  return (
                    <a
                      key={service.id}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="mt-2 px-3 py-2 rounded inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60"
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
                    </a>
                  )
                })
              )}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto">

        {/* Search Section */}
        {activeSection === 'search' && (
        <section id="search" className="scroll-mt-24">
          <div className="glass-panel rounded-lg p-4 mb-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  submitSearch()
                }}
                placeholder="Search movies and TV shows..."
                className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                {submittingSearch || searching ? '...' : 'Search'}
              </button>
            </div>

            <details className="mt-1">
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
                  />
                ))}
              </div>
            )}

            {searchResults.total_pages > 1 && (
              <div className="flex justify-between items-center mt-4 glass-panel rounded-lg p-3">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
                  onClick={() => setPage((prev) => Math.min(searchResults.total_pages, prev + 1))}
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
              onClick={() => setReleaseError(null)}
              className="bg-slate-700/60 hover:bg-slate-600/60 px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {aiIntentPlan && (
        <AvailabilityModal
          mode="ai"
          plan={aiIntentPlan}
          busy={loadingReleases}
          error={aiIntentError}
          onConfirm={executePlan}
          onSearch={handleAiSearch}
          onClose={() => setAiIntentPlan(null)}
        />
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

      {/* Release view modal */}
      {releaseData && (
        <ReleaseView
          data={releaseData}
          onClose={() => setReleaseData(null)}
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
