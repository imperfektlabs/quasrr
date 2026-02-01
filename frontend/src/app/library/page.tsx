'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SonarrLibraryItem, RadarrLibraryItem, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { formatSize } from '@/utils/formatting'
import { useClickOutside } from '@/hooks'
import { NavigationMenu } from '@/components/NavigationMenu'
import { MediaRail } from '@/components/MediaRail'
import { DetailModal } from '@/components/DetailModal'

type ConfigResponse = {
  streaming_services?: StreamingService[]
  integrations?: {
    sonarr_url?: string
    radarr_url?: string
    sabnzbd_url?: string
  }
}

type MediaType = 'movies' | 'tv'
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
  const [sortField, setSortField] = useState<'added' | 'imdbRating' | 'popularity' | 'releaseDate' | 'size' | 'title'>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [searchText, setSearchText] = useState('')
  const [filterModes, setFilterModes] = useState<Set<'downloaded' | 'missing' | 'monitored' | 'unmonitored'>>(new Set())
  const [mediaTypes, setMediaTypes] = useState<Set<MediaType>>(() => {
    const type = searchParams.get('type')
    if (type === 'movies' || type === 'tv') {
      return new Set<MediaType>([type])
    }
    return new Set<MediaType>(['movies', 'tv'])
  })
  const searchInputRef = useRef<HTMLInputElement | null>(null)

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
      setMediaTypes(new Set<MediaType>([type]))
    } else {
      setMediaTypes(new Set<MediaType>(['movies', 'tv']))
    }
  }, [searchParams])

  // Close menu when clicking outside
  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

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
      if (!mediaTypes.has(item.mediaType)) {
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
  }, [combinedItems, sortField, sortDir, searchText, filterModes, mediaTypes])

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

  const updateMediaTypes = (updater: (prev: Set<MediaType>) => Set<MediaType>) => {
    setMediaTypes((prev) => {
      const next = updater(prev)
      const params = new URLSearchParams(searchParams.toString())
      if (next.size === 1) {
        const [only] = Array.from(next.values())
        params.set('type', only)
      } else {
        params.delete('type')
      }
      const newUrl = params.toString() ? `?${params.toString()}` : '/library'
      router.push(newUrl)
      return next
    })
  }

  const toggleMediaType = (type: MediaType) => {
    updateMediaTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size === 1) return next
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
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
  }

  return (
    <main className="min-h-screen pt-16 px-4 pb-8 md:px-10">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="library"
        config={config}
      />

      <div className="w-full space-y-4">
        <section className="space-y-3">
          <div className="sticky top-14 z-20">
            <div className="glass-panel glass-header p-2 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {mediaTypes.size === 1 ? (mediaTypes.has('movies') ? 'Movies' : 'Series') : 'Library'}
                  </span>
                  <span className="text-lg font-semibold text-slate-100">{sortedItems.length}</span>
                  <span className="text-slate-400">({formatSize(totalSize)})</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleMediaType('movies')}
                    className={`px-2.5 py-1 rounded transition ${
                      mediaTypes.has('movies')
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    Movies
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMediaType('tv')}
                    className={`px-2.5 py-1 rounded transition ${
                      mediaTypes.has('tv')
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    TV
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
            </div>
          </div>

          {loading && <div className="text-slate-300">Loading library...</div>}
          {error && <div className="text-amber-300">Error: {error}</div>}
          {!loading && !error && sortedItems.length === 0 && (
            <div className="text-slate-400">No items found.</div>
          )}

          {!loading && !error && sortedItems.length > 0 && (
            <div className="rail-bleed">
              <MediaRail>
                {sortedItems.map((item) => (
                  <DetailModal
                    key={`${item.mediaType}-${item.id}`}
                    mode="library"
                    libraryItem={item}
                    embedded
                    className="rail-panel"
                    onClose={() => {}}
                    onLibraryDelete={handleLibraryDelete}
                  />
                ))}
              </MediaRail>
            </div>
          )}
        </section>
      </div>
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
