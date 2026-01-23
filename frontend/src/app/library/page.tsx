'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SonarrEpisode, SonarrLibraryItem, RadarrLibraryItem, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { formatSize } from '@/utils/formatting'
import { StatusBadge } from '@/components/StatusBadge'
import { NavigationMenu } from '@/components/NavigationMenu'
import { MediaCard } from '@/components/MediaCard'

type ConfigResponse = {
  streaming_services?: StreamingService[]
  integrations?: {
    sonarr_url?: string
    radarr_url?: string
    sabnzbd_url?: string
  }
}

type MediaType = 'all' | 'movies' | 'tv'
type LibraryItem = (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' })

function LibraryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sonarrItems, setSonarrItems] = useState<SonarrLibraryItem[]>([])
  const [radarrItems, setRadarrItems] = useState<RadarrLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const [sortField, setSortField] = useState<'added' | 'title' | 'year' | 'size'>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [searchText, setSearchText] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'downloaded' | 'missing' | 'monitored' | 'unmonitored'>('all')
  const [mediaType, setMediaType] = useState<MediaType>((searchParams.get('type') as MediaType) || 'all')
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, SonarrEpisode[]>>({})
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())
  const [episodesLoading, setEpisodesLoading] = useState(false)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      try {
        const backendUrl = getBackendUrl()
        const [configRes, sonarrRes, radarrRes] = await Promise.all([
          fetch(`${backendUrl}/config`),
          fetch(`${backendUrl}/sonarr/library`),
          fetch(`${backendUrl}/radarr/library`),
        ])

        if (configRes.ok) {
          const configData = (await configRes.json()) as ConfigResponse
          if (active) {
            setConfig(configData)
          }
        }

        const sonarrData: SonarrLibraryItem[] = sonarrRes.ok ? await sonarrRes.json() : []
        const radarrData: RadarrLibraryItem[] = radarrRes.ok ? await radarrRes.json() : []

        if (active) {
          setSonarrItems(sonarrData)
          setRadarrItems(radarrData)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load library')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => {
      active = false
    }
  }, [])

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

  useEffect(() => {
    if (!selectedItem || selectedItem.mediaType !== 'tv') return
    let active = true

    const fetchEpisodes = async () => {
      setEpisodesLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/sonarr/series/${selectedItem.id}/episodes`)
        if (!response.ok) {
          return
        }
        const episodes = (await response.json()) as SonarrEpisode[]
        if (!active) return
        const grouped: Record<number, SonarrEpisode[]> = {}
        episodes.forEach((episode) => {
          const seasonNumber = episode.seasonNumber ?? 0
          if (!grouped[seasonNumber]) grouped[seasonNumber] = []
          grouped[seasonNumber].push(episode)
        })
        Object.keys(grouped).forEach((key) => {
          const seasonNumber = Number(key)
          grouped[seasonNumber].sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
        })
        setEpisodesBySeason(grouped)
      } finally {
        if (active) {
          setEpisodesLoading(false)
        }
      }
    }

    setEpisodesBySeason({})
    setExpandedSeasons(new Set())
    fetchEpisodes()

    return () => {
      active = false
    }
  }, [selectedItem])

  const combinedItems = useMemo<LibraryItem[]>(() => {
    const sonarr = sonarrItems.map((item) => ({ ...item, mediaType: 'tv' as const }))
    const radarr = radarrItems.map((item) => ({ ...item, mediaType: 'movies' as const }))
    return [...sonarr, ...radarr]
  }, [sonarrItems, radarrItems])

  const totalSize = useMemo(
    () => combinedItems.reduce((sum, item) => sum + (item.sizeOnDisk || 0), 0),
    [combinedItems]
  )

  const totalDownloaded = useMemo(() => {
    return combinedItems.filter((item) => {
      if (item.mediaType === 'movies') {
        return item.hasFile
      }
      return (item.episodeCount || 0) > 0 && item.episodeFileCount === item.episodeCount
    }).length
  }, [combinedItems])

  const totalMissing = useMemo(() => {
    return combinedItems.filter((item) => {
      if (item.mediaType === 'movies') {
        return !item.hasFile
      }
      return (item.episodeCount || 0) > (item.episodeFileCount || 0)
    }).length
  }, [combinedItems])

  const totalMonitored = useMemo(
    () => combinedItems.filter((item) => item.monitored).length,
    [combinedItems]
  )

  const sortedItems = useMemo(() => {
    const normalizedQuery = searchText.trim().toLowerCase()
    const filtered = combinedItems.filter((item) => {
      if (normalizedQuery && !item.title.toLowerCase().includes(normalizedQuery)) {
        return false
      }
      if (mediaType !== 'all' && item.mediaType !== mediaType) {
        return false
      }

      let isDownloaded = false
      let isMissing = false

      if (item.mediaType === 'movies') {
        isDownloaded = item.hasFile
        isMissing = !item.hasFile
      } else {
        const fullyDownloaded = (item.episodeCount || 0) > 0 && item.episodeFileCount === item.episodeCount
        isDownloaded = fullyDownloaded
        isMissing = (item.episodeCount || 0) > (item.episodeFileCount || 0)
      }

      if (filterMode === 'downloaded') return isDownloaded
      if (filterMode === 'missing') return isMissing
      if (filterMode === 'monitored') return item.monitored
      if (filterMode === 'unmonitored') return !item.monitored
      return true
    })

    const next = [...filtered]
    next.sort((a, b) => {
      let left = 0
      let right = 0
      if (sortField === 'title') {
        return (a.title || '').localeCompare(b.title || '') * (sortDir === 'asc' ? 1 : -1)
      }
      if (sortField === 'year') {
        left = a.year || 0
        right = b.year || 0
      } else if (sortField === 'size') {
        left = a.sizeOnDisk || 0
        right = b.sizeOnDisk || 0
      } else {
        left = a.added ? Date.parse(a.added) : 0
        right = b.added ? Date.parse(b.added) : 0
      }
      return (left - right) * (sortDir === 'asc' ? 1 : -1)
    })
    return next
  }, [combinedItems, sortField, sortDir, searchText, filterMode, mediaType])

  const handleMediaTypeChange = (type: MediaType) => {
    setMediaType(type)
    const params = new URLSearchParams(searchParams.toString())
    if (type === 'all') {
      params.delete('type')
    } else {
      params.set('type', type)
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/library'
    router.push(newUrl)
  }

  return (
    <main className="min-h-screen pt-24 px-4 pb-8 md:px-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="library"
        config={config}
      />

      <div className="max-w-5xl mx-auto space-y-4">
        <section className="glass-panel rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-slate-400">
                {mediaType === 'movies' ? 'Movies' : mediaType === 'tv' ? 'Series' : 'Library'}
              </div>
              <div className="text-xl font-semibold">{sortedItems.length}</div>
            </div>
            <div className="text-sm text-slate-300">
              Total size: {formatSize(totalSize)}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="glass-chip px-2 py-1 rounded">Downloaded: {totalDownloaded}</span>
            <span className="glass-chip px-2 py-1 rounded">Missing: {totalMissing}</span>
            <span className="glass-chip px-2 py-1 rounded">Monitored: {totalMonitored}</span>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Library</h2>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => handleMediaTypeChange('all')}
              className={`px-3 py-1.5 rounded transition ${
                mediaType === 'all'
                  ? 'bg-cyan-500/80 text-white'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleMediaTypeChange('movies')}
              className={`px-3 py-1.5 rounded transition ${
                mediaType === 'movies'
                  ? 'bg-cyan-500/80 text-white'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              Movies
            </button>
            <button
              type="button"
              onClick={() => handleMediaTypeChange('tv')}
              className={`px-3 py-1.5 rounded transition ${
                mediaType === 'tv'
                  ? 'bg-cyan-500/80 text-white'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              TV Shows
            </button>
          </div>

          <details>
            <summary className="text-xs text-slate-300 cursor-pointer select-none">
              Filters
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Filter titles..."
                className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
              />
              <select
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as typeof filterMode)}
                className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="downloaded">Downloaded</option>
                <option value="missing">Missing</option>
                <option value="monitored">Monitored</option>
                <option value="unmonitored">Unmonitored</option>
              </select>
              <label className="text-slate-400">Sort</label>
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as typeof sortField)}
                className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-xs"
              >
                <option value="added">Added</option>
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="size">Size</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 rounded bg-slate-800/60"
              >
                {sortDir === 'asc' ? 'Asc' : 'Desc'}
              </button>
            </div>
          </details>

          {loading && <div className="text-slate-300">Loading library...</div>}
          {error && <div className="text-amber-300">Error: {error}</div>}
          {!loading && !error && sortedItems.length === 0 && (
            <div className="text-slate-400">No items found.</div>
          )}

          {!loading && !error && sortedItems.length > 0 && (
            <div className="grid gap-2">
              {sortedItems.map((item) => (
                <MediaCard
                  key={`${item.mediaType}-${item.id}`}
                  item={{ source: 'library', data: item }}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedItem && (
        <div
          className="fixed inset-0 glass-modal z-50 overflow-auto"
          onClick={() => setSelectedItem(null)}
        >
          <div className="min-h-screen p-4">
            <div
              className="glass-panel rounded-lg p-4 md:p-6 max-w-6xl mx-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{selectedItem.title}</h2>
                  <p className="text-gray-400 text-sm">
                    {selectedItem.year || '—'}
                    {selectedItem.mediaType === 'tv' && 'network' in selectedItem && selectedItem.network
                      ? ` • ${selectedItem.network}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white text-2xl px-2"
                >
                  X
                </button>
              </div>

              <div className="mt-4">
                <div className="w-full">
                  <div className="w-full max-h-[280px] md:max-h-[360px] bg-slate-800/60 rounded-lg overflow-hidden">
                    {selectedItem.poster ? (
                      <img
                        src={selectedItem.poster}
                        alt={selectedItem.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-6 text-center">
                        No poster
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                {selectedItem.mediaType === 'movies' ? (
                  <>
                    <StatusBadge status={selectedItem.hasFile ? 'downloaded' : 'not_in_library'} />
                    <span className="glass-chip px-2 py-1 rounded">
                      {formatSize(selectedItem.sizeOnDisk)}
                    </span>
                  </>
                ) : (
                  <>
                    <StatusBadge
                      status={
                        selectedItem.episodeCount &&
                        selectedItem.episodeFileCount === selectedItem.episodeCount
                          ? 'downloaded'
                          : 'not_in_library'
                      }
                    />
                    <span className="glass-chip px-2 py-1 rounded">
                      {selectedItem.episodeFileCount || 0}/{selectedItem.episodeCount || 0} eps
                    </span>
                    <span className="glass-chip px-2 py-1 rounded">
                      {formatSize(selectedItem.sizeOnDisk)}
                    </span>
                  </>
                )}
                {selectedItem.path && (
                  <span className="glass-chip px-2 py-1 rounded">{selectedItem.path}</span>
                )}
                <span className="glass-chip px-2 py-1 rounded">
                  {selectedItem.monitored ? 'Monitored' : 'Unmonitored'}
                </span>
              </div>

              {selectedItem.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mt-3">
                  {selectedItem.overview}
                </p>
              )}

              {selectedItem.mediaType === 'tv' &&
                'seasons' in selectedItem &&
                selectedItem.seasons &&
                selectedItem.seasons.length > 0 && (
                  <div className="mt-6">
                    <div className="text-xs text-slate-400 mb-2">Seasons</div>
                    <div className="grid gap-2">
                      {selectedItem.seasons.map((season) => {
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
                                  if (next.has(seasonNumber)) {
                                    next.delete(seasonNumber)
                                  } else {
                                    next.add(seasonNumber)
                                  }
                                  return next
                                })
                              }}
                              className="w-full flex items-center justify-between"
                            >
                              <span>Season {season.seasonNumber ?? '—'}</span>
                              <span className="text-slate-300">
                                {season.episodeFileCount || 0}/{season.episodeCount || 0} eps
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="mt-2 space-y-1 text-xs text-slate-300">
                                {episodes.length === 0 && (
                                  <div className="text-slate-500">
                                    {episodesLoading ? 'Loading episodes...' : 'No episodes found'}
                                  </div>
                                )}
                                {episodes.map((episode) => (
                                  <div
                                    key={episode.id}
                                    className="flex items-center justify-between"
                                  >
                                    <span className="truncate">
                                      {episode.episodeNumber != null
                                        ? `E${String(episode.episodeNumber).padStart(2, '0')}`
                                        : 'E--'}{' '}
                                      {episode.title || 'Untitled'}
                                    </span>
                                    <span className="text-slate-500">
                                      {episode.hasFile ? '✓' : '○'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 px-4 pb-8 md:px-8 text-slate-300">Loading library...</div>}>
      <LibraryContent />
    </Suspense>
  )
}
