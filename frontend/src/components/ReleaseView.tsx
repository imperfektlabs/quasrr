'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  Release,
  ReleaseResponse,
  AISuggestion,
  SortField,
  SortDirection,
  SeasonProgress,
  DiscoveryResult,
  Rating,
} from '@/types'
import { getReleaseKey, isReleaseTitleMatch, getRatingLink } from '@/utils/formatting'
import { getBackendUrl } from '@/utils/backend'
import { getStreamingLogoForProvider } from '@/utils/streaming'
import { DownloadIcon, DownloadAllIcon, DriveStackIcon } from './Icons'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'
import { SeasonHeaderRow, EpisodeRow } from './SeasonEpisodeList'

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
export function ReleaseView({
  data,
  result,
  onClose,
  onGrabRelease,
  onGrabAll,
  grabBusyIds,
  aiEnabled,
  aiSuggestion,
  aiSuggestBusy,
  aiSuggestError,
  onAiSuggest,
  variant = 'modal',
}: {
  data: ReleaseResponse
  result?: DiscoveryResult
  onClose: () => void
  onGrabRelease: (release: Release) => void
  onGrabAll: (releases: Release[]) => void
  grabBusyIds: Set<string>
  aiEnabled: boolean
  aiSuggestion: AISuggestion | null
  aiSuggestBusy: boolean
  aiSuggestError: string | null
  onAiSuggest: (releases: Release[]) => void
  variant?: 'modal' | 'embedded'
}) {
  const isEmbedded = variant === 'embedded'
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
  const posterUrl = data.poster || result?.poster
  const episodeMeta = data.episode_meta || {}
  const [availability, setAvailability] = useState<{
    flatrate?: Array<{ name: string; logo_url?: string | null }>
    subscribed?: string[]
    link?: string | null
  } | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const onDiskCandidates = [
    data.episode_file?.sceneName,
    data.episode_file?.relativePath,
    data.episode_file?.path,
    data.movie_file?.sceneName,
    data.movie_file?.relativePath,
    data.movie_file?.path,
  ]
  const isReleaseOnDisk = (release: Release) => isReleaseTitleMatch(release.title, onDiskCandidates)
  const getEpisodeMeta = (season: number | null, episode: number | null) => {
    if (!season || !episode) return null
    return episodeMeta[season]?.[episode] || null
  }

  const ratingPriority = ['imdb', 'tmdb', 'tvdb', 'rottentomatoes']
  const sortRatings = (list: Rating[]) => (
    [...list].sort((a, b) => {
      const aSource = a.source.toLowerCase()
      const bSource = b.source.toLowerCase()
      const aIndex = ratingPriority.indexOf(aSource)
      const bIndex = ratingPriority.indexOf(bSource)
      const normalizedA = aIndex === -1 ? ratingPriority.length : aIndex
      const normalizedB = bIndex === -1 ? ratingPriority.length : bIndex
      return normalizedA - normalizedB
    })
  )

  useEffect(() => {
    if (isEmbedded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEmbedded, onClose])

  useEffect(() => {
    if (!result?.title || !result?.type) return
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
        if (active) setAvailability(data.availability || null)
      } catch (err) {
        if (active) setAvailabilityError(err instanceof Error ? err.message : 'Failed to fetch availability')
      } finally {
        if (active) setAvailabilityLoading(false)
      }
    }
    fetchAvailability()
    return () => { active = false }
  }, [result?.title, result?.type])

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
    if (typeof requestedSeason === 'number') return requestedSeason
    if (typeof data.season === 'number') return data.season
    return 0
  }

  const getEpisodes = (release: Release): number[] => {
    const episodes = Array.isArray(release.episode)
      ? release.episode.filter((e) => typeof e === 'number')
      : []
    if (episodes.length > 0) return episodes
    if (typeof requestedEpisode === 'number' && typeof requestedSeason === 'number') {
      return [requestedEpisode]
    }
    return []
  }

  const getEpisodeLabel = (release: Release) => {
    const season = getSeason(release)
    const episodes = getEpisodes(release)

    if (release.full_season) {
      return season > 0 ? `S${season} Full` : 'Full Season'
    }

    if (episodes.length > 0) {
      const minEp = Math.min(...episodes)
      const maxEp = Math.max(...episodes)
      const episodeLabel = minEp === maxEp ? `E${minEp.toString().padStart(2, '0')}` : `E${minEp}-E${maxEp}`
      if (minEp === maxEp) {
        const meta = getEpisodeMeta(season, minEp)
        if (meta?.title) {
          return `${episodeLabel} ${meta.title}`
        }
      }
      return episodeLabel
    }

    return null
  }

  const getEpisodeGroupKey = (release: Release) => {
    const season = getSeason(release)
    const episodes = getEpisodes(release)

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
    const episodes = getEpisodes(release)
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
    const eligible = releases.filter((release) => release.guid && release.indexer_id && !isReleaseOnDisk(release))
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
      const selectable = prev.releases.filter((release) => !isReleaseOnDisk(release))
      const allSelected = prev.selected.size === selectable.length
      return {
        ...prev,
        selected: allSelected
          ? new Set()
          : new Set(selectable.map((release) => getReleaseKey(release))),
      }
    })
  }

  const toggleGrabAllSelection = (release: Release) => {
    if (isReleaseOnDisk(release)) return
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
      dateLabel?: string
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
      const episodes = getEpisodes(release)

      if (episodes.length > 0) {
        const minEp = Math.min(...episodes)
        const maxEp = Math.max(...episodes)
        const episodeLabel = minEp === maxEp ? `E${minEp.toString().padStart(2, '0')}` : `E${minEp}-E${maxEp}`
        const meta = minEp === maxEp ? getEpisodeMeta(season, minEp) : null
        const titleSuffix = meta?.title ? ` ${meta.title}` : ''
        const label = `${episodeLabel}${titleSuffix}`
        const dateLabel = meta?.airDate ? meta.airDate.slice(0, 10) : undefined
        const key = `s${season}-e${minEp}-${maxEp}`
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label,
            sortKey: season * 1000 + minEp,
            releases: [],
            dateLabel,
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
    const episodes = getEpisodes(release)
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

  const getSeasonCountLabel = (season: number, fallback: string) => {
    const progressLabel = getSeasonProgressLabel(season)
    if (progressLabel) return `${progressLabel} eps`
    const meta = episodeMeta[season]
    if (meta) {
      const total = Object.keys(meta).length
      if (total > 0) return `0/${total} eps`
    }
    return fallback
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

    const episodes = getEpisodes(release)
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
      const episodes = getEpisodes(release)
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
      return { label: 'Missing', icon: '○', className: 'text-slate-300' }
    }
    if (downloadedCount === episodeKeys.size) {
      return { label: 'Downloaded', icon: '✓', className: 'text-cyan-200' }
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
          return { label: 'Downloaded', icon: '✓', className: 'text-cyan-200' }
        }
        if (progress.downloaded > 0) {
          return { label: 'Partial', icon: '◐', className: 'bg-fuchsia-900/60 text-fuchsia-200' }
        }
        return { label: 'Missing', icon: '○', className: 'text-slate-300' }
      }
      return null
    }

    const episodes = getEpisodes(release)
    if (episodes.length === 0) return null

    let downloadedCount = 0
    for (const ep of episodes) {
      if (seasonEpisodes[ep]) {
        downloadedCount += 1
      }
    }

    if (downloadedCount === 0) {
      return { label: 'Missing', icon: '○', className: 'text-slate-300' }
    }
    if (downloadedCount === episodes.length) {
      return { label: 'Downloaded', icon: '✓', className: 'text-cyan-200' }
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
    const isOnDisk = isReleaseOnDisk(release)
    const warning = getSizeWarning(release, data.type)
    const recommendation = getSizeRecommendation(release, data.type)
    const rejectionText = release.rejected && release.rejections && release.rejections.length > 0
      ? release.rejections.join(', ')
      : null
    const releaseGroup = data.type === 'tv' ? extractGroup(release.title) : null
    const episodeLabel = data.type === 'tv' ? getEpisodeLabel(release) : null
    const episodeMetaEntry = data.type === 'tv' && getEpisodes(release).length === 1
      ? getEpisodeMeta(getSeason(release), getEpisodes(release)[0])
      : null
    const episodeAirDate = episodeMetaEntry?.airDate
      ? episodeMetaEntry.airDate.slice(0, 10)
      : null
    const canGrab = Boolean(release.guid && release.indexer_id) && !isOnDisk
    const isGrabBusy = grabBusyIds.has(getReleaseKey(release))
    const isAiPick = Boolean(aiPickGuid && release.guid === aiPickGuid)
    const isRequested = Boolean(
      requestedEpisode &&
      (!requestedSeason || getSeason(release) === requestedSeason) &&
      getEpisodes(release).includes(requestedEpisode)
    )
    return (
      <div
        key={release.guid || `${groupKey}-${index}`}
        data-release-guid={release.guid || undefined}
        className={`px-3 py-2.5 text-xs transition-all hover:bg-slate-800/50 rounded-md ${
          isAiPick ? 'ring-2 ring-cyan-400/70 bg-gradient-to-r from-cyan-900/20 to-purple-900/10 shadow-md shadow-cyan-500/10' : ''
        } ${
          isRequested ? 'ring-2 ring-fuchsia-400/70 bg-gradient-to-r from-fuchsia-900/20 to-pink-900/10 shadow-md shadow-fuchsia-500/10' : ''
        }`}
      >
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-xs text-slate-100 leading-snug break-words flex-1">
              {isAiPick && <span className="mr-1.5 text-cyan-400">✨</span>}
              {release.title}
            </p>
            {isOnDisk ? (
              <span
                title="Already on disk"
                aria-label="Already on disk"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 flex-shrink-0"
              >
                <DriveStackIcon className="h-4 w-4" />
              </span>
            ) : (
              <button
                type="button"
                disabled={!canGrab || isGrabBusy}
                onClick={() => onGrabRelease(release)}
                className={`h-8 w-8 inline-flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${
                  !canGrab || isGrabBusy
                    ? 'bg-slate-700/60 text-slate-300 cursor-not-allowed'
                    : 'bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white shadow-md hover:shadow-lg hover:shadow-cyan-500/30 active:scale-95'
                }`}
                title={!canGrab ? 'Missing release identifiers' : 'Send to download client'}
                aria-label="Grab release"
              >
                {isGrabBusy ? (
                  <span className="text-xs animate-pulse">⟳</span>
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-200 font-medium">
                {release.size_formatted}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-cyan-600/30 text-cyan-200 border border-cyan-500/30 font-medium">
                {release.quality}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-400">
                {release.age}
              </span>
              {episodeLabel && (
                <span className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300">
                  {episodeLabel}
                </span>
              )}
              {episodeAirDate && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-400 text-2xs">
                  {episodeAirDate}
                </span>
              )}
              {release.full_season && (
                <span className="px-2 py-0.5 rounded-md bg-violet-600/30 text-violet-200 border border-violet-500/30 font-medium">
                  Full Season
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-md font-medium ${
                release.protocol === 'usenet'
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30'
                  : 'bg-orange-600/30 text-orange-200 border border-orange-500/30'
              }`}>
                {release.protocol}
              </span>
              {recommendation && !warning && !rejectionText && (
                <span
                  title={recommendation.text}
                  className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-emerald-600/25 border border-emerald-400/40 text-emerald-300 text-[10px] font-semibold"
                >
                  ✓ OK
                </span>
              )}
              {(warning || rejectionText) && (
                <span
                  title={warning || rejectionText || ''}
                  className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-rose-600/25 border border-rose-400/40 text-rose-300 text-[10px] font-semibold"
                >
                  ⚠
                </span>
              )}
              {releaseGroup && data.type === 'tv' && (
                <button
                  type="button"
                  onClick={() => setGroupFocus(releaseGroup)}
                  className="px-2 py-0.5 rounded-md bg-slate-700/70 text-slate-200 text-[11px] hover:bg-slate-600/80 transition-colors"
                >
                  Group
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const releaseList = (
    <div className="mt-4 space-y-3 text-xs">
      {data.releases.length === 0 ? (
        <div className="py-6 text-center text-xs text-gray-400 glass-card rounded-md">
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
          <div className="space-y-2">
            {isMultiSeason ? (
              seasonGroups.map((seasonGroup) => {
                const seasonKey = seasonGroup.key
                const isSeasonCollapsed = collapsedSeasons.has(seasonKey)
                const groups = buildEpisodeGroups(seasonGroup.releases).map((group) => ({
                  key: `${seasonKey}:${group.key}`,
                  label: group.label,
                  releases: group.releases,
                  showGrabAll: false,
                  dateLabel: group.dateLabel,
                }))

                return (
                  <div key={seasonKey}>
                    <SeasonHeaderRow
                      label={seasonGroup.label}
                      countLabel={getSeasonCountLabel(seasonGroup.season, `${seasonGroup.releases.length} releases`)}
                      onToggle={() => toggleSeason(seasonKey)}
                      isCollapsed={isSeasonCollapsed}
                      onSearch={() => toggleSeason(seasonKey)}
                      searchDisabled={false}
                      onDelete={undefined}
                      deleteDisabled
                    />

                    {!isSeasonCollapsed && (
                      <div className="mt-2 space-y-2">
                        {groups.map((group) => {
                          const groupReleases = sortReleases(group.releases)
                          const isCollapsed = collapsedGroups.has(group.key)
                          const status = getEpisodeGroupStatus(group.releases)
                          return (
                            <div key={group.key} className="space-y-2">
                              <EpisodeRow
                                title={`${group.label} (${groupReleases.length})`}
                                dateLabel={group.dateLabel || ''}
                                statusIcon={status?.icon}
                                statusClassName={status?.className || 'text-slate-500'}
                                statusTitle={status?.label}
                                onSearch={() => toggleGroup(group.key)}
                                searchDisabled={false}
                                searchActive={!isCollapsed}
                                onDelete={undefined}
                                deleteDisabled
                                onRowClick={() => toggleGroup(group.key)}
                              />
                              {!isCollapsed && (
                                <div className="divide-y divide-slate-800/60 rounded-md border border-slate-800/60 bg-slate-900/30">
                                  {groupReleases.map((release, index) => (
                                    renderReleaseRow(release, group.key, index)
                                  ))}
                                </div>
                              )}
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
                      dateLabel: undefined,
                    }))
                  })
                : (tvGroups
                  ? tvGroups.map((group) => ({
                      key: group.key,
                      label: group.label,
                      releases: group.releases,
                      showGrabAll: false,
                      dateLabel: group.dateLabel,
                    }))
                  : [{ key: 'all', label: '', releases: sortedReleases, showGrabAll: false, dateLabel: undefined }]
                )
              ).map((group) => {
                const groupReleases = data.type === 'tv' && groupFocus
                  ? sortByEpisodeOrder(group.releases)
                  : sortReleases(group.releases)
                const isCollapsed = collapsedGroups.has(group.key)

                return (
                  <div key={group.key} className="space-y-2">
                    {group.label && (
                      <EpisodeRow
                        title={`${group.label} (${groupReleases.length})`}
                        dateLabel={group.dateLabel || ''}
                        statusIcon={getEpisodeGroupStatus(group.releases)?.icon}
                        statusClassName={getEpisodeGroupStatus(group.releases)?.className || 'text-slate-500'}
                        statusTitle={getEpisodeGroupStatus(group.releases)?.label}
                        onSearch={() => toggleGroup(group.key)}
                        searchDisabled={false}
                        searchActive={!isCollapsed}
                        onDelete={undefined}
                        deleteDisabled
                        onRowClick={() => toggleGroup(group.key)}
                      />
                    )}
                    {group.showGrabAll && (
                      <div className="flex justify-end">
                        {(() => {
                          const grabAllCandidates = groupReleases.filter(
                            (release) => release.guid && release.indexer_id && !isReleaseOnDisk(release)
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
                        })()}
                      </div>
                    )}
                    {!isCollapsed && (
                      <div className={`rounded-md border border-slate-800/60 bg-slate-900/30 ${group.label ? 'overflow-hidden' : ''}`}>
                        <div className={group.label ? 'divide-y divide-slate-800/60' : ''}>
                          {groupReleases.map((release, index) => (
                            renderReleaseRow(release, group.key, index)
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )

  const ratingsBlock = result?.ratings && result.ratings.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {sortRatings(result.ratings)
        .filter((r) => !['trakt', 'metacritic'].includes(r.source.toLowerCase()))
        .map((r) => <RatingBadge key={r.source} rating={r} href={getRatingLink(result, r)} />)}
    </div>
  ) : null

  const streamingBlock = (
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
  )

  const panel = (
    <div
      className="mx-auto glass-panel rounded-lg p-4 md:p-6 max-w-3xl w-full"
      onClick={(event) => {
        if (isEmbedded) return
        event.stopPropagation()
      }}
    >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{data.title}</h2>
              <p className="text-gray-400 text-sm">
                {data.year} | {data.releases.length} releases found
                {data.runtime && ` | ${data.runtime} min`}
                {typeof requestedSeason === 'number' && typeof requestedEpisode === 'number'
                  ? ` | S${requestedSeason.toString().padStart(2, '0')}E${requestedEpisode.toString().padStart(2, '0')}`
                  : typeof requestedSeason === 'number'
                    ? ` | Season ${requestedSeason}`
                    : data.season && ` | Season ${data.season}`}
              </p>
              {releaseAiEnabled && aiSuggestError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                  <p className="text-xs text-rose-300 flex items-start gap-2">
                    <span className="text-base">⚠️</span>
                    <span>{aiSuggestError}</span>
                  </p>
                </div>
              )}
              {releaseAiEnabled && aiSuggestion && (
                <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-cyan-500/15 to-purple-500/10 border border-cyan-500/30 backdrop-blur-sm shadow-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">✨</span>
                    <div className="flex-1 space-y-1.5">
                      <div className="text-sm font-semibold text-cyan-200">
                        AI Pick: {aiSuggestion.title || 'Suggested release'}
                      </div>
                      {aiSuggestion.reason && (
                        <div className="text-xs text-cyan-300/90 leading-relaxed">
                          {aiSuggestion.reason}
                        </div>
                      )}
                      {aiSuggestion.warnings && aiSuggestion.warnings.length > 0 && (
                        <div className="text-xs text-amber-300/90 flex items-start gap-1.5 mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                          <span>⚡</span>
                          <span>{aiSuggestion.warnings.join(' • ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {releaseAiEnabled && aiEnabled && (
                <button
                  type="button"
                  onClick={() => onAiSuggest(aiCandidateReleases)}
                  disabled={!aiSuggestAvailable || aiSuggestBusy}
                  title={!aiSuggestAvailable ? 'Expand a single episode group to enable AI' : undefined}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600/80 to-purple-600/70 hover:from-cyan-500/90 hover:to-purple-500/80 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-white shadow-md hover:shadow-lg hover:shadow-cyan-500/20 transition-all active:scale-95 flex items-center gap-1.5"
                >
                  {aiSuggestBusy ? (
                    <>
                      <span className="inline-block animate-spin">⟳</span>
                      <span>Thinking...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>AI Suggest</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-2xl px-2"
                aria-label="Close"
              >
                X
              </button>
            </div>
          </div>

          <div className="mt-4 grid md:grid-cols-[160px,1fr] gap-4">
            <div className="hidden md:block w-full">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={data.title}
                  className="w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-56 rounded-lg bg-slate-800/60 flex items-center justify-center text-gray-500 text-xs">
                  No poster
                </div>
              )}
            </div>

            <div className="space-y-3">
              {data.type === 'tv' && groupFocus && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
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
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {result?.status && <StatusBadge status={result.status} />}
                {data.runtime && data.type === 'movie' && (
                  <span className="glass-chip px-2 py-1 rounded">
                    {data.runtime} min
                  </span>
                )}
                {data.type === 'tv' && result?.seasons && (
                  <span className="glass-chip px-2 py-1 rounded">
                    {result.seasons} season{result.seasons !== 1 ? 's' : ''}
                  </span>
                )}
                {result?.series_status && (
                  <span className="glass-chip px-2 py-1 rounded">
                    {result.series_status}
                  </span>
                )}
                {result?.network && (
                  <span className="glass-chip px-2 py-1 rounded">
                    {result.network}
                  </span>
                )}
                {typeof requestedSeason === 'number' && (
                  <span className="glass-chip px-2 py-1 rounded">
                    S{requestedSeason.toString().padStart(2, '0')}
                    {typeof requestedEpisode === 'number' &&
                      `E${requestedEpisode.toString().padStart(2, '0')}`}
                  </span>
                )}
              </div>
              {result?.overview && (
                <p className="text-gray-300 text-sm leading-relaxed">
                  {result.overview}
                </p>
              )}
              {ratingsBlock}
              {result && streamingBlock}
            </div>
          </div>

          {/* Release list */}
          {releaseList}
        </div>
  )

  const grabAllOverlay = grabAllModal && (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={() => setGrabAllModal(null)}
      />
      <div className="relative flex items-center justify-center p-4">
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
              checked={grabAllModal.selected.size === grabAllModal.releases.filter((release) => !isReleaseOnDisk(release)).length}
              onChange={toggleGrabAllAll}
            />
            <span>Select all</span>
          </div>

          <div className="mt-3 max-h-[60vh] overflow-auto space-y-2">
            {sortByEpisodeOrder(grabAllModal.releases).map((release) => {
              const key = getReleaseKey(release)
              const checked = grabAllModal.selected.has(key)
              const isOnDisk = isReleaseOnDisk(release)
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
                    disabled={isOnDisk}
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
    </div>
  )

  if (isEmbedded) {
    return (
      <div className="mt-6 w-full">
        {releaseList}
        {grabAllOverlay}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 glass-modal z-50 overflow-auto" onClick={onClose}>
      <div className="min-h-screen p-4">
        {panel}
        {grabAllOverlay}
      </div>
    </div>
  )
}
