'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  Release,
  ReleaseResponse,
  AISuggestion,
  SortField,
  SortDirection,
  SeasonProgress,
} from '@/types'
import { getReleaseKey } from '@/utils/formatting'
import { DownloadIcon, DownloadAllIcon } from './Icons'

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
      const episodeLabel = minEp === maxEp ? `E${minEp}` : `E${minEp}-E${maxEp}`
      return season > 0 ? `S${season}${episodeLabel}` : `Episode ${episodeLabel}`
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
      const episodes = getEpisodes(release)

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

    const episodes = getEpisodes(release)
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
      getEpisodes(release).includes(requestedEpisode)
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
                  {typeof requestedSeason === 'number' && typeof requestedEpisode === 'number'
                    ? ` | S${requestedSeason.toString().padStart(2, '0')}E${requestedEpisode.toString().padStart(2, '0')}`
                    : typeof requestedSeason === 'number'
                      ? ` | Season ${requestedSeason}`
                      : data.season && ` | Season ${data.season}`}
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
