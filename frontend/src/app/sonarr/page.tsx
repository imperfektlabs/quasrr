'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SonarrLibraryItem } from '@/types'
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

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.sizeOnDisk || 0), 0),
    [items]
  )
  const sortedItems = useMemo(() => {
    const next = [...items]
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
  }, [items, sortField, sortDir])

  return (
    <main className="min-h-screen pt-20 px-4 pb-8 md:px-8">
      <header className="fixed top-0 left-0 right-0 z-40 px-4 md:px-8 py-3 glass-panel border-b border-slate-700/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            className="px-3 py-2 rounded bg-slate-800/60 text-slate-200 inline-flex items-center gap-2"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <div className="text-lg font-semibold">Sonarr Library</div>
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
        </section>

        <section className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Library</h2>
            <span className="text-xs text-slate-400">Read-only</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
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

          {loading && <div className="text-slate-300">Loading library...</div>}
          {error && <div className="text-amber-300">Error: {error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="text-slate-400">No series found.</div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="grid gap-2">
              {sortedItems.map((series) => (
                <div
                  key={series.id}
                  className="glass-card rounded-lg px-3 py-2 flex flex-wrap items-center gap-3"
                >
                  <div className="w-12 h-16 rounded bg-slate-800/60 overflow-hidden flex-shrink-0">
                    {series.poster ? (
                      <img
                        src={series.poster}
                        alt={series.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
                        No poster
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-sm">{series.title}</div>
                    <div className="text-xs text-slate-400">
                      {series.year || '—'}
                      {series.network ? ` • ${series.network}` : ''}
                      {series.path ? ` • ${series.path}` : ''}
                    </div>
                  </div>
                  <StatusBadge
                    status={
                      series.episodeCount && series.episodeFileCount === series.episodeCount
                        ? 'downloaded'
                        : 'in_library'
                    }
                  />
                  <div className="text-xs text-slate-300">
                    {series.episodeFileCount || 0}/{series.episodeCount || 0} eps
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatSize(series.sizeOnDisk)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
