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
  poster?: string
  tmdb_id?: number
  tvdb_id?: number
  radarr_id?: number
  sonarr_id?: number
  runtime?: number
  releases: Release[]
  message?: string
}

type SortField = 'size' | 'quality' | 'age' | 'title'
type SortDirection = 'asc' | 'desc' | null

function getBackendUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:8000`
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
  if (source === 'tvdb' && result.tvdb_id) {
    return `https://thetvdb.com/series/${result.tvdb_id}`
  }
  if (source === 'justwatch') {
    return `https://www.justwatch.com/ca/search?q=${encodeURIComponent(result.title)}`
  }
  if (source === 'metacritic') {
    return `https://www.metacritic.com/search/all/${encodeURIComponent(result.title)}/results`
  }
  if (source === 'rottentomatoes') {
    return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(result.title)}`
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
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex">
      {content}
    </a>
  )
}

function StreamingBadges({ services }: { services: StreamingService[] }) {
  if (!services.length) return null

  const logoMap: Record<string, string> = {
    netflix: '/logos/streaming/netflix.avif',
    crave: '/logos/streaming/crave.avif',
    disney_plus: '/logos/streaming/disney_plus.avif',
    amazon_prime: '/logos/streaming/amazon_prime.avif',
    apple_tv: '/logos/streaming/apple_tv.avif',
    paramount_plus: '/logos/streaming/paramount_plus.avif',
    cbc_gem: '/logos/streaming/cbc_gem.svg',
  }

  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => (
        <span key={service.id} className="glass-chip px-2 py-1 rounded inline-flex items-center">
          {logoMap[service.id] ? (
            <img
              src={logoMap[service.id]}
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
      bg: 'bg-slate-700/60',
      textColor: 'text-slate-200',
    },
    'in_library': {
      text: 'In library (not downloaded)',
      bg: 'bg-yellow-900/60',
      textColor: 'text-yellow-200',
    },
    'downloaded': {
      text: 'In library (downloaded)',
      bg: 'bg-green-900/60',
      textColor: 'text-green-200',
    },
  }[status]

  return (
    <span className={`px-2 py-1 rounded text-xs ${config.bg} ${config.textColor}`}>
      {config.text}
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
      className={`text-left font-medium hover:text-blue-400 transition-colors ${
        isActive ? 'text-blue-400' : 'text-gray-400'
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
}: {
  data: ReleaseResponse
  onClose: () => void
}) {
  const [sortField, setSortField] = useState<SortField>('size')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [groupFocus, setGroupFocus] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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
      return
    }

    if (groupFocus) {
      const allGroupKeys = Array.from(buildGroupMap(data.releases).keys())
      const collapsed = new Set(allGroupKeys.filter((key) => key !== groupFocus))
      setCollapsedGroups(collapsed)
      return
    }

    const episodeGroupKeys = buildEpisodeGroups(data.releases).map((group) => group.key)
    setCollapsedGroups(new Set(episodeGroupKeys))
  }, [data.type, data.releases, groupFocus])

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

  const sortedReleases = sortReleases(data.releases)
  const tvGroups = data.type === 'tv' ? buildEpisodeGroups(data.releases) : null
  const tvReleaseGroups = data.type === 'tv' ? buildGroupMap(data.releases) : null

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

  return (
    <div
      className="fixed inset-0 glass-modal z-50 overflow-auto"
      onClick={onClose}
    >
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto" onClick={(event) => event.stopPropagation()}>
          {/* Header */}
          <div className="glass-panel rounded-t-lg p-4 flex flex-col md:flex-row gap-4 items-start sticky top-0 z-10">
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
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl px-2"
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
                <div className="hidden md:grid md:grid-cols-12 gap-2 p-2 bg-slate-900/60 text-xs border-b border-slate-700/60">
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
                <div className="md:hidden p-2 bg-slate-900/60 border-b border-slate-700/60 flex gap-2 overflow-x-auto">
                  <span className="text-gray-400 text-sm">Sort:</span>
                  {(['title', 'size', 'quality', 'age'] as SortField[]).map((field) => (
                    <button
                      key={field}
                      onClick={() => handleSort(field)}
                      className={`px-2 py-1 rounded text-xs ${
                        sortField === field
                          ? 'bg-blue-600 text-white'
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
                  {((data.type === 'tv' && groupFocus && tvReleaseGroups)
                    ? Array.from(tvReleaseGroups.entries()).map(([key, releases]) => ({
                        key,
                        label: `Group: ${key}`,
                        releases,
                        showGrabAll: key === groupFocus,
                      }))
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
                            <span>{group.label} ({groupReleases.length})</span>
                            <span className="flex items-center gap-2">
                              {group.showGrabAll && (
                                <button
                                  disabled
                                  className="px-2 py-1 bg-slate-700/60 text-slate-300 rounded text-[11px] cursor-not-allowed"
                                  title="Download all coming soon"
                                >
                                  Grab All
                                </button>
                              )}
                              <span className="text-slate-400">
                                {isCollapsed ? 'Show' : 'Hide'}
                              </span>
                            </span>
                          </button>
                        )}

                        {!isCollapsed && groupReleases.map((release, index) => {
                          const warning = getSizeWarning(release, data.type)
                          const recommendation = getSizeRecommendation(release, data.type)
                          const releaseGroup = data.type === 'tv' ? extractGroup(release.title) : null
                          const episodeLabel = data.type === 'tv' ? getEpisodeLabel(release) : null

                          return (
                            <div
                              key={release.guid || `${group.key}-${index}`}
                              className={`p-2 hover:bg-slate-800/40 ${
                                release.rejected ? 'opacity-50' : ''
                              }`}
                            >
                              {/* Desktop layout */}
                              <div className="hidden md:grid md:grid-cols-12 gap-2 items-center text-xs">
                                {/* Release name */}
                                <div className="col-span-4 min-w-0">
                                  <p className="text-xs truncate" title={release.title}>
                                    {release.title}
                                  </p>
                                  <div className="flex gap-2 mt-1 text-[11px] flex-wrap">
                                    {episodeLabel && (
                                      <span className="bg-slate-800/60 text-slate-200 px-1.5 rounded">
                                        {episodeLabel}
                                      </span>
                                    )}
                                    {release.full_season && (
                                      <span className="bg-blue-900/60 text-blue-200 px-1.5 rounded">
                                        Full Season
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="col-span-2">
                                  <div className="text-[11px] text-gray-300 truncate">{release.indexer}</div>
                                  <div className={`inline-flex mt-1 px-1.5 rounded text-[10px] ${
                                    release.protocol === 'usenet'
                                      ? 'bg-purple-900/60 text-purple-200'
                                      : 'bg-orange-900/60 text-orange-200'
                                  }`}>
                                    {release.protocol}
                                  </div>
                                </div>

                                {/* Size */}
                                <div className="col-span-2">
                                  <span className="text-base font-bold text-blue-400">
                                    {release.size_formatted}
                                  </span>
                                  {warning && (
                                    <p className="text-[11px] text-red-400">{warning}</p>
                                  )}
                                  {recommendation && !warning && (
                                    <p className={`text-[11px] ${recommendation.color}`}>
                                      {recommendation.text}
                                    </p>
                                  )}
                                </div>

                                {/* Quality */}
                                <div className="col-span-2">
                                  <span className="text-green-400 font-medium text-xs">
                                    {release.quality}
                                  </span>
                                </div>

                                {/* Age */}
                                <div className="col-span-1 text-gray-400 text-xs">
                                  {release.age}
                                </div>

                                {/* Actions */}
                                <div className="col-span-1 flex flex-col items-end gap-1">
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
                                    disabled
                                    className="px-2 py-1 bg-slate-700/60 text-slate-300 rounded text-[11px] cursor-not-allowed"
                                    title="Download coming soon"
                                  >
                                    Grab
                                  </button>
                                </div>
                              </div>

                              {/* Mobile layout */}
                              <div className="md:hidden">
                                <p className="text-xs break-words mb-2">{release.title}</p>

                                <div className="flex flex-wrap gap-2 mb-2">
                                  <span className="text-lg font-bold text-blue-400">
                                    {release.size_formatted}
                                  </span>
                                  <span className="text-green-400 font-medium self-center text-xs">
                                    {release.quality}
                                  </span>
                                </div>

                                {warning && (
                                  <p className="text-[11px] text-red-400 mb-2">{warning}</p>
                                )}
                                {recommendation && !warning && (
                                  <p className={`text-[11px] ${recommendation.color} mb-2`}>
                                    {recommendation.text}
                                  </p>
                                )}

                                <div className="flex flex-wrap gap-2 text-[11px]">
                                  <span className="text-gray-400">{release.indexer}</span>
                                  <span className="text-gray-400">{release.age}</span>
                                  <span className={`px-1.5 rounded ${
                                    release.protocol === 'usenet'
                                      ? 'bg-purple-900/60 text-purple-200'
                                      : 'bg-orange-900/60 text-orange-200'
                                  }`}>
                                    {release.protocol}
                                  </span>
                                  {episodeLabel && (
                                    <span className="bg-slate-800/60 text-slate-200 px-1.5 rounded">
                                      {episodeLabel}
                                    </span>
                                  )}
                                  {release.full_season && (
                                    <span className="bg-blue-900/60 text-blue-200 px-1.5 rounded">
                                      Full Season
                                    </span>
                                  )}
                                </div>

                                {releaseGroup && data.type === 'tv' && (
                                  <button
                                    type="button"
                                    onClick={() => setGroupFocus(releaseGroup)}
                                    className="mt-2 px-2 py-1 rounded bg-slate-800/60 text-slate-200 text-[11px]"
                                  >
                                    Show Group
                                  </button>
                                )}

                                {release.rejected && release.rejections && release.rejections.length > 0 && (
                                  <p className="text-[11px] text-red-400 mt-2">
                                    Rejected: {release.rejections.join(', ')}
                                  </p>
                                )}
                              </div>

                              {/* Rejections (desktop) */}
                              {release.rejected && release.rejections && release.rejections.length > 0 && (
                                <p className="hidden md:block text-[11px] text-red-400 mt-1 col-span-12">
                                  Rejected: {release.rejections.join(', ')}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Discovery details modal
function DetailsView({
  result,
  onClose,
  onShowReleases,
}: {
  result: DiscoveryResult
  onClose: () => void
  onShowReleases: (result: DiscoveryResult, season?: number) => void
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 glass-modal z-50 overflow-auto"
      onClick={onClose}
    >
      <div className="min-h-screen p-4">
        <div
          className="max-w-3xl mx-auto glass-panel rounded-lg p-4 md:p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-2xl font-bold">{result.title}</h2>
              <p className="text-gray-400 text-sm">
                {result.type === 'movie' ? 'Movie' : 'TV Series'}
                {result.year ? ` • ${result.year}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl px-2"
            >
              X
            </button>
          </div>

          <div className="mt-4 grid md:grid-cols-[160px,1fr] gap-4">
            <div className="w-full">
              {result.poster ? (
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
                <StatusBadge status={result.status} />
                {result.runtime && result.type === 'movie' && (
                  <span className="glass-chip text-xs px-2 py-1 rounded">
                    {result.runtime} min
                  </span>
                )}
                {result.type === 'tv' && result.seasons && (
                  <span className="glass-chip text-xs px-2 py-1 rounded">
                    {result.seasons} season{result.seasons !== 1 ? 's' : ''}
                  </span>
                )}
                {result.series_status && (
                  <span className="glass-chip text-xs px-2 py-1 rounded">
                    {result.series_status}
                  </span>
                )}
                {result.network && (
                  <span className="glass-chip text-xs px-2 py-1 rounded">
                    {result.network}
                  </span>
                )}
              </div>

              {result.genres && result.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.genres.slice(0, 5).map((genre) => (
                    <span key={genre} className="glass-chip text-xs px-2 py-1 rounded">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {result.ratings && result.ratings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.ratings.map((rating) => (
                    <RatingBadge
                      key={rating.source}
                      rating={rating}
                      href={getRatingLink(result, rating)}
                    />
                  ))}
                </div>
              )}

              {result.overview && (
                <p className="text-gray-300 text-sm leading-relaxed">
                  {result.overview}
                </p>
              )}

              {result.type === 'tv' && result.seasons && result.seasons > 0 && (
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
                    if (result.type === 'tv' && selectedSeason !== 'all') {
                      onShowReleases(result, selectedSeason)
                    } else {
                      onShowReleases(result)
                    }
                    onClose()
                  }}
                  className="bg-blue-600/90 hover:bg-blue-500 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
                >
                  Find Releases
                </button>
                <button
                  type="button"
                  disabled
                  className="bg-slate-700/60 text-slate-300 py-2 px-4 rounded text-sm cursor-not-allowed"
                  title="Download coming soon"
                >
                  Grab
                </button>
              </div>
            </div>
          </div>
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onShowDetails(result)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onShowDetails(result)
        }
      }}
      className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40"
    >
      {/* Poster */}
      <div className="w-24 md:w-32 flex-shrink-0">
        <div className="aspect-[2/3] w-full bg-slate-800/60">
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 grid grid-cols-1 md:grid-cols-[1fr,140px] gap-3 min-w-0">
        {/* Title and year */}
        <div className="min-w-0">
          <div className="mb-2">
            <h3 className="font-semibold text-base leading-tight truncate">
              {result.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
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

          <div className="mb-2 flex flex-wrap gap-2 items-center">
            <StatusBadge status={result.status} />
            <span className="glass-chip text-xs px-2 py-1 rounded">
              {result.type === 'movie' ? 'Movie' : 'TV'}
            </span>
          </div>

          {result.overview && (
            <p className="text-gray-400 text-xs line-clamp-2 mb-3">
              {result.overview}
            </p>
          )}

          {/* Season picker moved to right column */}
        </div>

        <div className="flex md:flex-col items-start md:items-end justify-between md:justify-start gap-2">
          {result.type === 'tv' && result.seasons && result.seasons > 0 && (
            <div className="w-full md:w-auto">
              <label className="text-xs text-gray-400">Season</label>
              <select
                value={selectedSeason}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedSeason(value === 'all' ? 'all' : Number(value))
                }}
                onClick={(event) => event.stopPropagation()}
                className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-sm"
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

          {result.ratings && result.ratings.length > 0 && (
            <div className="flex flex-wrap justify-start md:justify-end gap-2">
              {result.ratings.slice(0, 3).map((rating) => (
                <RatingBadge
                  key={rating.source}
                  rating={rating}
                  href={getRatingLink(result, rating)}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end w-full">
            <button
              onClick={handleReleasesClick}
              className="bg-blue-600/90 hover:bg-blue-500 text-white py-1.5 px-3 rounded text-xs font-semibold tracking-wide transition-colors"
            >
              Find Releases
            </button>
          </div>
        </div>
      </div>
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
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<DiscoveryResult | null>(null)

  const pageSize = 25

  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSyncRef = useRef<string | null>(null)

  // Release view state
  const [releaseData, setReleaseData] = useState<ReleaseResponse | null>(null)
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const backendUrl = getBackendUrl()

      try {
        const healthRes = await fetch(`${backendUrl}/health`)
        if (!healthRes.ok) throw new Error(`Health: HTTP ${healthRes.status}`)
        const healthData = await healthRes.json()
        setHealth(healthData)

        const configRes = await fetch(`${backendUrl}/config`)
        if (!configRes.ok) throw new Error(`Config: HTTP ${configRes.status}`)
        const configData = await configRes.json()
        setConfig(configData)

        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setHealth(null)
        setConfig(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const runSearch = async (query: string, nextPage: number) => {
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
    setSelectedResult(null)
    setReleaseData(null)
    setReleaseError(null)
  }, [searchParams])

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setSearchResults(null)
    setSelectedResult(null)
    setPage(1)
    setActiveQuery(trimmed)
  }

  const handleShowReleases = async (result: DiscoveryResult, season?: number) => {
    setLoadingReleases(true)
    setReleaseError(null)

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

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setActiveQuery('')
              setSearchResults(null)
              setPage(1)
              router.push('/')
            }}
            className="text-3xl font-bold mb-1 hover:text-cyan-300 transition-colors"
            title="Go home"
          >
            Shiny Palm Tree
          </button>
          <p className="text-gray-400 text-sm">Unified media search and download management</p>
        </div>

        {/* Search Section */}
        <div className="glass-panel rounded-lg p-4 mb-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies and TV shows..."
                className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="bg-blue-600/90 hover:bg-blue-500 disabled:bg-slate-700/60 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-2">
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
          </form>
        </div>

        {/* Search Results */}
        {searchError && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-300">{searchError}</p>
          </div>
        )}

        {searching && (
          <div className="glass-panel rounded-lg p-8 text-center mb-4">
            <div className="text-yellow-400">Searching titles...</div>
          </div>
        )}

        {searchResults && (
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

        {/* Status Section - Collapsible */}
        <details className="glass-panel rounded-lg">
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
                        {config.integrations.sonarr_url ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Radarr</span>
                      <span className={config.integrations.radarr_url ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.radarr_url ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>SABnzbd</span>
                      <span className={config.integrations.sabnzbd_url ? 'text-green-400' : 'text-gray-600'}>
                        {config.integrations.sabnzbd_url ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </details>
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

      {/* Discovery details modal */}
      {selectedResult && (
        <DetailsView
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
