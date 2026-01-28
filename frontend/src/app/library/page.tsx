'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SonarrLibraryItem, RadarrLibraryItem, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { formatSize } from '@/utils/formatting'
import { useClickOutside } from '@/hooks'
import { NavigationMenu } from '@/components/NavigationMenu'
import { MediaCard } from '@/components/MediaCard'
import { DetailModal } from '@/components/DetailModal'

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

  // Close menu when clicking outside
  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  const combinedItems = useMemo<LibraryItem[]>(() => {
    const sonarr = sonarrItems.map((item) => ({ ...item, mediaType: 'tv' as const }))
    const radarr = radarrItems.map((item) => ({ ...item, mediaType: 'movies' as const }))
    return [...sonarr, ...radarr]
  }, [sonarrItems, radarrItems])

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

  const handleTypeToggle = (type: 'movie' | 'tv') => {
    const nextType = type === 'movie' ? 'movies' : 'tv'
    handleMediaTypeChange(mediaType === nextType ? 'all' : nextType)
  }

  const handleLibraryDelete = (item: LibraryItem) => {
    if (item.mediaType === 'tv') {
      setSonarrItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } else {
      setRadarrItems((prev) => prev.filter((entry) => entry.id !== item.id))
    }
    setSelectedItem(null)
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
        <section className="space-y-3">
          <div className="sticky top-20 z-20">
            <div className="glass-panel rounded-lg p-3 space-y-3">
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-semibold text-slate-100">
                      {mediaType === 'movies' ? 'Movies' : mediaType === 'tv' ? 'Series' : 'Library'}
                    </span>
                    <span className="text-xl font-semibold text-slate-100">{sortedItems.length}</span>
                  </div>
                  <span>Total size: {formatSize(totalSize)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="glass-chip px-2 py-1 rounded">Downloaded: {totalDownloaded}</span>
                  <span className="glass-chip px-2 py-1 rounded">Missing: {totalMissing}</span>
                  <span className="glass-chip px-2 py-1 rounded">Monitored: {totalMonitored}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleMediaTypeChange('all')}
                    className={`px-2.5 py-1 rounded transition ${
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
                    className={`px-2.5 py-1 rounded transition ${
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
                    className={`px-2.5 py-1 rounded transition ${
                      mediaType === 'tv'
                        ? 'bg-cyan-500/80 text-white'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    TV
                  </button>
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    setTimeout(() => {
                      searchInputRef.current?.focus()
                    }, 0)
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      searchInputRef.current?.focus()
                    }, 0)
                  }}
                  placeholder="Search library..."
                  className="flex-1 min-w-0 bg-slate-900/60 border border-slate-700/60 rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500"
                />
              </div>

              <details>
                <summary className="text-xs text-slate-300 cursor-pointer select-none">
                  Filters/Sorting
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
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
            </div>
          </div>

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
                  onTypeToggle={handleTypeToggle}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedItem && (
        <DetailModal
          mode="library"
          libraryItem={selectedItem}
          onClose={() => setSelectedItem(null)}
          onLibraryDelete={handleLibraryDelete}
        />
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
