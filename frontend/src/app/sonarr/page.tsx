'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SonarrEpisode, SonarrLibraryItem } from '@/types'
import { getBackendUrl, getLocalToolUrl } from '@/utils/backend'
import { StatusBadge } from '@/components/StatusBadge'

type ConfigResponse = {
  integrations?: {
    sonarr_url?: string
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

export default function SonarrPage() {
  const [items, setItems] = useState<SonarrLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sonarrUrl, setSonarrUrl] = useState<string>('')
  const [sortField, setSortField] = useState<'added' | 'title' | 'year' | 'size'>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [searchText, setSearchText] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'downloaded' | 'missing' | 'monitored' | 'unmonitored'>('all')
  const [selectedSeries, setSelectedSeries] = useState<SonarrLibraryItem | null>(null)
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, SonarrEpisode[]>>({})
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())
  const [episodesLoading, setEpisodesLoading] = useState(false)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      try {
        const backendUrl = getBackendUrl()
        setSonarrUrl(getLocalToolUrl(8989))

        const [configRes, libraryRes] = await Promise.all([
          fetch(`${backendUrl}/config`),
          fetch(`${backendUrl}/sonarr/library`),
        ])

        if (configRes.ok) {
          const config = (await configRes.json()) as ConfigResponse
          if (config.integrations?.sonarr_url) {
            setSonarrUrl(config.integrations.sonarr_url)
          }
        }

        if (!libraryRes.ok) {
          const err = await libraryRes.json().catch(() => ({}))
          throw new Error(err.detail || `HTTP ${libraryRes.status}`)
        }

        const data = (await libraryRes.json()) as SonarrLibraryItem[]
        if (active) {
          setItems(data)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load Sonarr library')
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
    if (!selectedSeries) return
    let active = true

    const fetchEpisodes = async () => {
      setEpisodesLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/sonarr/series/${selectedSeries.id}/episodes`)
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
  }, [selectedSeries])

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.sizeOnDisk || 0), 0),
    [items]
  )
  const totalDownloaded = useMemo(
    () => items.filter((item) => (item.episodeCount || 0) > 0 && item.episodeFileCount === item.episodeCount).length,
    [items]
  )
  const totalMissing = useMemo(
    () => items.filter((item) => (item.episodeCount || 0) > (item.episodeFileCount || 0)).length,
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
      const missingEpisodes = (item.episodeCount || 0) > (item.episodeFileCount || 0)
      const fullyDownloaded = (item.episodeCount || 0) > 0 && !missingEpisodes
      if (filterMode === 'downloaded') return fullyDownloaded
      if (filterMode === 'missing') return missingEpisodes
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
      <header className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3 glass-panel border-b border-slate-700/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            className="px-3 py-2 rounded bg-slate-800/60 text-slate-200 inline-flex items-center gap-2"
          >
            <span>←</span>
            <span>Home</span>
          </Link>
          <Link
            href="/"
            className="text-lg md:text-xl font-semibold tracking-wide hover:text-cyan-300 transition-colors"
            title="Go home"
          >
            Quasrr
          </Link>
          <a
            href={sonarrUrl || '#'}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded bg-cyan-500/80 hover:bg-cyan-400 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            aria-disabled={!sonarrUrl}
          >
            Open Sonarr
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto space-y-4">
        <section className="glass-panel rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-slate-400">Series</div>
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
            <div className="text-slate-400">No series found.</div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="grid gap-2">
              {sortedItems.map((series) => {
                const fullyDownloaded =
                  (series.episodeCount || 0) > 0 &&
                  series.episodeFileCount === series.episodeCount
                return (
                  <button
                    key={series.id}
                    type="button"
                    onClick={() => setSelectedSeries(series)}
                    className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40"
                  >
                    <div className="w-24 md:w-32 flex-shrink-0">
                      <div className="aspect-[2/3] w-full bg-slate-800/60">
                        {series.poster ? (
                          <img
                            src={series.poster}
                            alt={series.title}
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
                          {series.title}
                        </div>
                        {series.overview && (
                          <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-2 mt-1">
                            {series.overview}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                        <StatusBadge status={fullyDownloaded ? 'downloaded' : 'not_in_library'} />
                        <span className="text-slate-400">
                          {series.episodeFileCount || 0}/{series.episodeCount || 0} eps
                        </span>
                        <span className="text-slate-400">{formatSize(series.sizeOnDisk)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {selectedSeries && (
        <div
          className="fixed inset-0 glass-modal z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedSeries(null)}
        >
          <div
            className="glass-panel rounded-lg p-4 md:p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-4">
                <div className="w-20 sm:w-24 flex-shrink-0">
                  <div className="aspect-[2/3] w-full bg-slate-800/60 rounded-lg overflow-hidden">
                    {selectedSeries.poster ? (
                      <img
                        src={selectedSeries.poster}
                        alt={selectedSeries.title}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                        No poster
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedSeries.title}</h2>
                  <p className="text-gray-400 text-sm">
                    {selectedSeries.year || '—'}
                    {selectedSeries.network ? ` • ${selectedSeries.network}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSeries(null)}
                className="text-gray-400 hover:text-white text-2xl px-2"
              >
                X
              </button>
            </div>

            {selectedSeries.overview && (
              <p className="text-gray-300 text-sm leading-relaxed mt-3">
                {selectedSeries.overview}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
              <StatusBadge
                status={
                  selectedSeries.episodeCount &&
                  selectedSeries.episodeFileCount === selectedSeries.episodeCount
                    ? 'downloaded'
                    : 'not_in_library'
                }
              />
              <span className="glass-chip px-2 py-1 rounded">
                {selectedSeries.episodeFileCount || 0}/{selectedSeries.episodeCount || 0} eps
              </span>
              <span className="glass-chip px-2 py-1 rounded">
                {formatSize(selectedSeries.sizeOnDisk)}
              </span>
              {selectedSeries.path && (
                <span className="glass-chip px-2 py-1 rounded">{selectedSeries.path}</span>
              )}
              <span className="glass-chip px-2 py-1 rounded">
                {selectedSeries.monitored ? 'Monitored' : 'Unmonitored'}
              </span>
            </div>

            {selectedSeries.seasons && selectedSeries.seasons.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-slate-400 mb-2">Seasons</div>
                <div className="grid gap-2">
                  {selectedSeries.seasons.map((season) => {
                    const seasonNumber = season.seasonNumber ?? 0
                    const isExpanded = expandedSeasons.has(seasonNumber)
                    const episodes = episodesBySeason[seasonNumber] || []
                    return (
                      <div key={seasonNumber} className="glass-card rounded-md px-3 py-2 text-xs">
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
                          <div className="mt-2 space-y-1 text-[11px] text-slate-300">
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
      )}
    </main>
  )
}
