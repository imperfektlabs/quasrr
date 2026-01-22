'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RadarrLibraryItem, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { StatusBadge } from '@/components/StatusBadge'
import { NavigationMenu } from '@/components/NavigationMenu'

type ConfigResponse = {
  streaming_services?: StreamingService[]
  integrations?: {
    sonarr_url?: string
    radarr_url?: string
    sabnzbd_url?: string
  }
}

const formatSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export default function RadarrPage() {
  const router = useRouter()
  const [items, setItems] = useState<RadarrLibraryItem[]>([])
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
  const [selectedMovie, setSelectedMovie] = useState<RadarrLibraryItem | null>(null)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      try {
        const backendUrl = getBackendUrl()
        const [configRes, libraryRes] = await Promise.all([
          fetch(`${backendUrl}/config`),
          fetch(`${backendUrl}/radarr/library`),
        ])

        if (configRes.ok) {
          const configData = (await configRes.json()) as ConfigResponse
          if (active) {
            setConfig(configData)
          }
        }

        if (!libraryRes.ok) {
          const err = await libraryRes.json().catch(() => ({}))
          throw new Error(err.detail || `HTTP ${libraryRes.status}`)
        }

        const data = (await libraryRes.json()) as RadarrLibraryItem[]
        if (active) {
          setItems(data)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load Radarr library')
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

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.sizeOnDisk || 0), 0),
    [items]
  )
  const totalDownloaded = useMemo(
    () => items.filter((item) => item.hasFile).length,
    [items]
  )
  const totalMissing = useMemo(
    () => items.filter((item) => !item.hasFile).length,
    [items]
  )
  const totalMonitored = useMemo(
    () => items.filter((item) => item.monitored).length,
    [items]
  )
  const sortedItems = useMemo(() => {
    const normalizedQuery = searchText.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (normalizedQuery && !item.title.toLowerCase().includes(normalizedQuery)) {
        return false
      }
      if (filterMode === 'downloaded') return item.hasFile
      if (filterMode === 'missing') return !item.hasFile
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
  }, [items, sortField, sortDir, searchText, filterMode])

  return (
    <main className="min-h-screen pt-24 px-4 pb-8 md:px-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="radarr"
        config={config}
      />

      <div className="max-w-5xl mx-auto space-y-4">
        <section className="glass-panel rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-slate-400">Movies</div>
              <div className="text-xl font-semibold">{items.length}</div>
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
          {!loading && !error && items.length === 0 && (
            <div className="text-slate-400">No movies found.</div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="grid gap-2">
              {sortedItems.map((movie) => (
                <button
                  key={movie.id}
                  type="button"
                  onClick={() => setSelectedMovie(movie)}
                  className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40"
                >
                  <div className="w-24 md:w-32 flex-shrink-0">
                    <div className="aspect-[2/3] w-full bg-slate-800/60">
                      {movie.poster ? (
                        <img
                          src={movie.poster}
                          alt={movie.title}
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
                    <div className="flex-1 p-2 sm:p-3 flex flex-col justify-between min-w-0">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm sm:text-base leading-tight truncate">
                          {movie.title}
                        </div>
                        {movie.overview && (
                          <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-2 mt-1">
                            {movie.overview}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                        <StatusBadge status={movie.hasFile ? 'downloaded' : 'not_in_library'} />
                        <span className="text-slate-400">{formatSize(movie.sizeOnDisk)}</span>
                      </div>
                    </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedMovie && (
        <div
          className="fixed inset-0 glass-modal z-50 overflow-auto"
          onClick={() => setSelectedMovie(null)}
        >
          <div className="min-h-screen p-4">
            <div
              className="glass-panel rounded-lg p-4 md:p-6 max-w-6xl mx-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{selectedMovie.title}</h2>
                  <p className="text-gray-400 text-sm">
                    {selectedMovie.year || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMovie(null)}
                  className="text-gray-400 hover:text-white text-2xl px-2"
                >
                  X
                </button>
              </div>

              <div className="mt-4">
                <div className="w-full">
                  <div className="w-full max-h-[280px] md:max-h-[360px] bg-slate-800/60 rounded-lg overflow-hidden">
                    {selectedMovie.poster ? (
                      <img
                        src={selectedMovie.poster}
                        alt={selectedMovie.title}
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
                <StatusBadge status={selectedMovie.hasFile ? 'downloaded' : 'not_in_library'} />
                <span className="glass-chip px-2 py-1 rounded">
                  {formatSize(selectedMovie.sizeOnDisk)}
                </span>
                {selectedMovie.path && (
                  <span className="glass-chip px-2 py-1 rounded">{selectedMovie.path}</span>
                )}
                <span className="glass-chip px-2 py-1 rounded">
                  {selectedMovie.monitored ? 'Monitored' : 'Unmonitored'}
                </span>
              </div>

              {selectedMovie.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mt-3">
                  {selectedMovie.overview}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
