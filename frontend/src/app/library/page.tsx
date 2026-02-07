'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SonarrLibraryItem, RadarrLibraryItem, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { formatSize } from '@/utils/formatting'
import { useClickOutside } from '@/hooks'
import { NavigationMenu } from '@/components/NavigationMenu'
import { MediaCardGrid, MediaCardList } from '@/components'
import { DetailModal } from '@/components/DetailModal'
import { ArrowDownLineIcon, ArrowUpLineIcon, DriveStackIcon, EyeIcon, ProjectorIcon, TvIcon } from '@/components/Icons'
import { SearchPanel } from '@/components/SearchPanel'

type ConfigResponse = {
  streaming_services?: StreamingService[]
  integrations?: {
    sonarr_url?: string
    radarr_url?: string
    sabnzbd_url?: string
  }
  layout?: {
    discovery_search_position?: 'top' | 'bottom'
    library_search_position?: 'top' | 'bottom'
    view_mode?: 'grid' | 'list'
  }
}

type MediaType = 'movies' | 'tv'
type MediaTypeFilter = 'all' | MediaType
type LibraryItem = (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' })
type RawLibraryItem = SonarrLibraryItem | RadarrLibraryItem

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
  const [sortField, setSortField] = useState<'added' | 'imdbRating' | 'tvdbRating' | 'popularity' | 'releaseDate' | 'size' | 'title'>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const getTvdbRating = (item: typeof combinedItems[number]) => {
    const rating = item.ratings?.find((entry) => entry.source.toLowerCase() === 'tvdb')
    return rating?.value ?? 0
  }
  const [searchText, setSearchText] = useState('')
  const [autoExpandSeason, setAutoExpandSeason] = useState<number | null>(null)
  const [filterModes, setFilterModes] = useState<Set<'downloaded' | 'missing' | 'monitored' | 'unmonitored'>>(new Set())
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>(() => {
    const type = searchParams.get('type')
    if (type === 'movies' || type === 'tv') {
      return type
    }
    return 'all'
  })
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [autoSearch, setAutoSearch] = useState(false)
  const [autoDeleteOpen, setAutoDeleteOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const librarySearchAtBottom = (config?.layout?.library_search_position ?? 'top') === 'bottom'
  const librarySearchStickyClass = librarySearchAtBottom
    ? 'fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 md:px-8'
    : 'sticky top-16'

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
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = searchParams.get('q') || ''
    setSearchText(q)
  }, [searchParams])

  useEffect(() => {
    const type = searchParams.get('type')
    if (type === 'movies' || type === 'tv') {
      setMediaTypeFilter(type)
    } else {
      setMediaTypeFilter('all')
    }
  }, [searchParams])

  // Close menu when clicking outside
  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  // View mode (grid/list) from backend config
  const viewMode = (config?.layout?.view_mode as 'grid' | 'list') ?? 'grid'
  const isGridView = viewMode === 'grid'
  const isListView = viewMode === 'list'

  const combinedItems = useMemo<LibraryItem[]>(() => {
    const sonarr = sonarrItems.map((item) => ({ ...item, mediaType: 'tv' as const }))
    const radarr = radarrItems.map((item) => ({ ...item, mediaType: 'movies' as const }))
    return [...sonarr, ...radarr]
  }, [sonarrItems, radarrItems])

  const toLibraryItem = (item: RawLibraryItem): LibraryItem => {
    if ('hasFile' in item) {
      return { ...item, mediaType: 'movies' as const }
    }
    return { ...item, mediaType: 'tv' as const }
  }

  const sortedItems = useMemo(() => {
    const normalizedQuery = searchText.trim().toLowerCase()
    const filtered = combinedItems.filter((item) => {
      if (normalizedQuery && !item.title.toLowerCase().includes(normalizedQuery)) {
        return false
      }
      if (mediaTypeFilter !== 'all' && item.mediaType !== mediaTypeFilter) {
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

      if (filterModes.size === 0) return true
      if (filterModes.has('downloaded') && !isDownloaded) return false
      if (filterModes.has('missing') && !isMissing) return false
      if (filterModes.has('monitored') && !item.monitored) return false
      if (filterModes.has('unmonitored') && item.monitored) return false
      return true
    })

    const next = [...filtered]
    next.sort((a, b) => {
      let left = 0
      let right = 0
      if (sortField === 'title') {
        return (a.title || '').localeCompare(b.title || '') * (sortDir === 'asc' ? 1 : -1)
      }
      if (sortField === 'releaseDate') {
        left = a.releaseDate ? Date.parse(a.releaseDate) : 0
        right = b.releaseDate ? Date.parse(b.releaseDate) : 0
      } else if (sortField === 'imdbRating') {
        left = a.imdbRating || 0
        right = b.imdbRating || 0
      } else if (sortField === 'tvdbRating') {
        left = getTvdbRating(a)
        right = getTvdbRating(b)
      } else if (sortField === 'popularity') {
        left = a.popularity || 0
        right = b.popularity || 0
      } else if (sortField === 'size') {
        left = a.sizeOnDisk || 0
        right = b.sizeOnDisk || 0
      } else {
        left = a.year || 0
        right = b.year || 0
      }
      if (sortField === 'added') {
        left = a.added ? Date.parse(a.added) : 0
        right = b.added ? Date.parse(b.added) : 0
      }
      return (left - right) * (sortDir === 'asc' ? 1 : -1)
    })
    return next
  }, [combinedItems, sortField, sortDir, searchText, filterModes, mediaTypeFilter])

  const totalSize = useMemo(
    () => sortedItems.reduce((sum, item) => sum + (item.sizeOnDisk || 0), 0),
    [sortedItems]
  )

  const totalDownloaded = useMemo(() => {
    return sortedItems.filter((item) => {
      if (item.mediaType === 'movies') {
        return item.hasFile
      }
      return (item.episodeCount || 0) > 0 && item.episodeFileCount === item.episodeCount
    }).length
  }, [sortedItems])

  const totalMissing = useMemo(() => {
    return sortedItems.filter((item) => {
      if (item.mediaType === 'movies') {
        return !item.hasFile
      }
      return (item.episodeCount || 0) > (item.episodeFileCount || 0)
    }).length
  }, [sortedItems])

  const totalMonitored = useMemo(
    () => sortedItems.filter((item) => item.monitored).length,
    [sortedItems]
  )

  const updateMediaTypeFilter = (next: MediaTypeFilter) => {
    setMediaTypeFilter(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') {
      params.delete('type')
    } else {
      params.set('type', next)
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/library'
    router.push(newUrl)
  }

  const handleTypeToggle = (type: 'movie' | 'tv') => {
    updateMediaTypeFilter(type === 'movie' ? 'movies' : 'tv')
  }

  const toggleFilterMode = (mode: 'downloaded' | 'missing' | 'monitored' | 'unmonitored') => {
    setFilterModes((prev) => {
      const next = new Set(prev)
      if (next.has(mode)) {
        next.delete(mode)
      } else {
        next.add(mode)
      }
      return next
    })
  }

  const handleLibraryDelete = (item: LibraryItem) => {
    if (item.mediaType === 'tv') {
      setSonarrItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } else {
      setRadarrItems((prev) => prev.filter((entry) => entry.id !== item.id))
    }
    setSelectedItem(null)
  }

  const updateLibrarySearchPosition = async (next: 'top' | 'bottom') => {
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout: { library_search_position: next },
        }),
      })
      if (!res.ok) return
      const updated = await res.json()
      setConfig(updated.config)
    } catch {
      // Ignore layout update errors.
    }
  }

  useEffect(() => {
    if (loading) return
    const q = (searchParams.get('q') || '').toLowerCase()
    const tvdb = Number(searchParams.get('tvdb') || '')
    const tmdb = Number(searchParams.get('tmdb') || '')
    const season = Number(searchParams.get('season') || '')
    const wantedSeason = Number.isFinite(season) && season > 0 ? season : null

    let match: LibraryItem | undefined
    if (tvdb && Number.isFinite(tvdb)) {
      const found = sonarrItems.find((item) => item.tvdbId === tvdb)
      match = found ? { ...found, mediaType: 'tv' as const } : undefined
    } else if (tmdb && Number.isFinite(tmdb)) {
      const found = radarrItems.find((item) => item.tmdbId === tmdb)
      match = found ? { ...found, mediaType: 'movies' as const } : undefined
    } else if (q) {
      const pool: RawLibraryItem[] = mediaTypeFilter === 'tv'
        ? sonarrItems
        : mediaTypeFilter === 'movies'
          ? radarrItems
          : [...sonarrItems, ...radarrItems]
      const found = pool.find((item) => item.title.toLowerCase().includes(q))
      match = found ? toLibraryItem(found) : undefined
    }

    if (match) {
        setSelectedItem(match)
        if (match.mediaType === 'tv') {
          setAutoExpandSeason(wantedSeason)
        } else {
          setAutoExpandSeason(null)
        }
      }
  }, [loading, searchParams, sonarrItems, radarrItems, mediaTypeFilter])

  return (
    <main className="min-h-screen pt-16 px-4 pb-8 md:px-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="library"
        config={config}
      />

      <div className="max-w-5xl mx-auto space-y-4">
        <section className={`space-y-3 ${librarySearchAtBottom ? 'pb-28' : ''}`}>
          {(() => {
            const searchPanel = (
              <SearchPanel
                stickyClass={librarySearchStickyClass}
                headerTitle={(
                  <span>
                    {mediaTypeFilter === 'all' ? 'Library' : (mediaTypeFilter === 'movies' ? 'Movies' : 'Series')}
                    <span className="text-slate-400 font-normal ml-2">
                      {sortedItems.length.toLocaleString()} {sortedItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                )}
                headerRight={(
                  <>
                    <span
                      className="glass-chip px-2 py-1 rounded inline-flex items-center gap-1"
                      title="Total size"
                    >
                      <DriveStackIcon className="h-3.5 w-3.5" />
                      <span>{formatSize(totalSize)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleFilterMode('downloaded')}
                      className={`glass-chip px-2 py-1 rounded transition ${
                        filterModes.has('downloaded')
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                      title="Downloaded"
                      aria-pressed={filterModes.has('downloaded')}
                      aria-label={`Downloaded: ${totalDownloaded}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">✓</span>
                        <span>{totalDownloaded}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFilterMode('missing')}
                      className={`glass-chip px-2 py-1 rounded transition ${
                        filterModes.has('missing')
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                      title="Missing"
                      aria-pressed={filterModes.has('missing')}
                      aria-label={`Missing: ${totalMissing}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">○</span>
                        <span>{totalMissing}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFilterMode('monitored')}
                      className={`glass-chip px-2 py-1 rounded transition ${
                        filterModes.has('monitored')
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-300 hover:bg-slate-700/60'
                      }`}
                      title="Monitored"
                      aria-pressed={filterModes.has('monitored')}
                      aria-label={`Monitored: ${totalMonitored}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <EyeIcon className="h-3.5 w-3.5" />
                        <span>{totalMonitored}</span>
                      </span>
                    </button>
                  </>
                )}
                headerRightInline={(
                  <div className="flex gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const backendUrl = getBackendUrl()
                          await fetch(`${backendUrl}/config/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ layout: { view_mode: 'grid' } }),
                          })
                          setConfig(prev => prev ? { ...prev, layout: { ...prev.layout, view_mode: 'grid' } } : prev)
                        } catch (e) {
                          console.error('Failed to save view mode', e)
                        }
                      }}
                      className={`px-2 py-1 rounded transition ${
                        isGridView
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-400 hover:text-slate-200'
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
                        try {
                          const backendUrl = getBackendUrl()
                          await fetch(`${backendUrl}/config/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ layout: { view_mode: 'list' } }),
                          })
                          setConfig(prev => prev ? { ...prev, layout: { ...prev.layout, view_mode: 'list' } } : prev)
                        } catch (e) {
                          console.error('Failed to save view mode', e)
                        }
                      }}
                      className={`px-2 py-1 rounded transition ${
                        isListView
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="List view"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                )}
                toggle={{
                  onClick: () => {
                    const next = librarySearchAtBottom ? 'top' : 'bottom'
                    void updateLibrarySearchPosition(next)
                  },
                  title: librarySearchAtBottom ? 'Pin search to top' : 'Pin search to bottom',
                  ariaLabel: librarySearchAtBottom ? 'Pin search to top' : 'Pin search to bottom',
                  icon: librarySearchAtBottom ? (
                    <ArrowUpLineIcon className="h-4 w-4" />
                  ) : (
                    <ArrowDownLineIcon className="h-4 w-4" />
                  ),
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => updateMediaTypeFilter('all')}
                      className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                        mediaTypeFilter === 'all'
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
                      onClick={() => updateMediaTypeFilter('movies')}
                      className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                        mediaTypeFilter === 'movies'
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
                      onClick={() => updateMediaTypeFilter('tv')}
                      className={`px-2.5 py-1 rounded transition inline-flex items-center justify-center ${
                        mediaTypeFilter === 'tv'
                          ? 'bg-cyan-500/80 text-white'
                          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                      }`}
                      title="TV Shows"
                      aria-label="TV Shows"
                    >
                      <TvIcon className="h-5 w-5" />
                      <span className="sr-only">TV</span>
                    </button>
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="Search library..."
                      className="w-full min-w-0 bg-slate-900/60 border border-slate-700/60 rounded px-3 py-1.5 pr-8 text-md text-slate-200 placeholder-slate-500"
                    />
                    {searchText && (
                      <button
                        type="button"
                        onClick={() => setSearchText('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-slate-400 hover:text-slate-200"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <details>
                  <summary className="text-xs text-slate-300 cursor-pointer select-none">
                    Filters/Sorting
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <div className="flex flex-wrap items-center gap-2">
                      {(['downloaded', 'missing', 'monitored', 'unmonitored'] as const).map((mode) => (
                        <label key={mode} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={filterModes.has(mode)}
                            onChange={() => toggleFilterMode(mode)}
                          />
                          <span className="capitalize">{mode}</span>
                        </label>
                      ))}
                    </div>
                    <label className="text-slate-400">Sort</label>
                    <select
                      value={sortField}
                      onChange={(event) => setSortField(event.target.value as typeof sortField)}
                      className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-xs"
                    >
                      <option value="added">Added</option>
                      <option value="imdbRating">IMDb Rating</option>
                      <option value="tvdbRating">TVDB Rating</option>
                      <option value="popularity">Popularity</option>
                      <option value="releaseDate">Release Date</option>
                      <option value="size">Size on Disk</option>
                      <option value="title">Title</option>
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
              </SearchPanel>
            )

            const listContent = (
              <>
                {loading && <div className="text-slate-300">Loading library...</div>}
                {error && <div className="text-amber-300">Error: {error}</div>}
                {!loading && !error && sortedItems.length === 0 && (
                  <div className="text-slate-400">No items found.</div>
                )}

                {!loading && !error && sortedItems.length > 0 && (
                  <>
                    {isGridView && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                        {sortedItems.map((item, index) => (
                          <div
                            key={`${item.mediaType}-${item.id}`}
                            className="opacity-0 animate-fade-in"
                            style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'forwards' }}
                          >
                            <MediaCardGrid
                              item={{ source: 'library', data: item }}
                              onClick={() => {
                                setSelectedItem(item)
                                setAutoSearch(false)
                                setAutoDeleteOpen(false)
                              }}
                              onLibrarySearch={() => {
                                setSelectedItem(item)
                                setAutoSearch(true)
                                setAutoDeleteOpen(false)
                              }}
                              onLibraryDelete={() => {
                                setSelectedItem(item)
                                setAutoSearch(false)
                                setAutoDeleteOpen(true)
                              }}
                              onTypeToggle={handleTypeToggle}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {isListView && (
                      <div className="grid gap-2">
                        {sortedItems.map((item) => (
                          <MediaCardList
                            key={`${item.mediaType}-${item.id}`}
                            item={{ source: 'library', data: item }}
                            onClick={() => {
                              setSelectedItem(item)
                              setAutoSearch(false)
                              setAutoDeleteOpen(false)
                            }}
                            onLibrarySearch={() => {
                              setSelectedItem(item)
                              setAutoSearch(true)
                              setAutoDeleteOpen(false)
                            }}
                            onLibraryDelete={() => {
                              setSelectedItem(item)
                              setAutoSearch(false)
                              setAutoDeleteOpen(true)
                            }}
                            onTypeToggle={handleTypeToggle}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )

            return librarySearchAtBottom ? (
              <>
                {listContent}
                {searchPanel}
              </>
            ) : (
              <>
                {searchPanel}
                {listContent}
              </>
            )
          })()}
        </section>
      </div>

      {selectedItem && (
        <DetailModal
          mode="library"
          libraryItem={selectedItem}
          autoSearch={autoSearch}
          autoDeleteOpen={autoDeleteOpen}
          autoExpandSeason={autoExpandSeason}
          onClose={() => {
            setSelectedItem(null)
            setAutoSearch(false)
            setAutoDeleteOpen(false)
            setAutoExpandSeason(null)
          }}
          onLibraryDelete={handleLibraryDelete}
        />
      )}
    </main>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-16 px-4 pb-8 md:px-8 text-slate-300">Loading library...</div>}>
      <LibraryContent />
    </Suspense>
  )
}
