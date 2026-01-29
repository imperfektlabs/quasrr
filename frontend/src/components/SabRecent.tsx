'use client'

import { useEffect, useRef, useState } from 'react'
import type { SabRecentResponse } from '@/types'
import { formatTimestamp } from '@/utils/formatting'

export function SabRecent({ data, error }: { data: SabRecentResponse | null, error: string | null }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const initializedRef = useRef(false)

  const buildLibraryUrl = ({
    mediaType,
    title,
    season,
    episode,
  }: {
    mediaType: 'movie' | 'tv' | 'unknown'
    title: string
    season?: number
    episode?: number
  }) => {
    const params = new URLSearchParams()
    if (mediaType === 'tv') params.set('type', 'tv')
    if (mediaType === 'movie') params.set('type', 'movies')
    if (title) params.set('q', title)
    if (typeof season === 'number') params.set('season', season.toString())
    if (typeof episode === 'number') params.set('episode', episode.toString())
    const query = params.toString()
    return query ? `/library?${query}` : '/library'
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Initially, collapse all groups for consistent behavior
  useEffect(() => {
    if (!data || initializedRef.current) return
    const initialCollapsed = new Set(data.groups.map(g => g.groupKey))
    setCollapsedGroups(initialCollapsed)
    initializedRef.current = true
  }, [data])

  if (error) {
    return <div className="text-red-400">Error fetching recent items: {error}</div>
  }
  if (!data) {
    return <div className="text-yellow-400">Loading recent items...</div>
  }
  if (data.groups.length === 0) {
    return <div className="text-gray-400">No recent downloads</div>
  }

  return (
    <div className="space-y-3">
      {data.groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.groupKey)
        const sizeText = group.totalSize > 0 ? `${(group.totalSize / (1024 ** 3)).toFixed(2)} GB` : 'Unknown size'

        return (
          <div key={group.groupKey} className="glass-card rounded-lg">
            <button
              className="p-3 w-full text-left"
              onClick={() => toggleGroup(group.groupKey)}
            >
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold truncate" title={group.title}>{group.title}</p>
                <span className="text-xs text-gray-400">{isCollapsed ? 'Show' : 'Hide'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                <span>{group.count} item(s)</span>
                <span className="mx-2">|</span>
                <span>{sizeText}</span>
                <span className="mx-2">|</span>
                <span>{formatTimestamp(group.latestCompletedTime)}</span>
              </div>
            </button>
            {!isCollapsed && (
              <div className="border-t border-slate-700/60 px-3 py-2 space-y-2">
                {group.items.map(item => (
                  <div key={item.name} className="text-xs">
                    <a
                      href={buildLibraryUrl({
                        mediaType: item.mediaType,
                        title: item.parsedTitle || group.title,
                        season: item.season,
                        episode: item.episode,
                      })}
                      className="text-gray-300 truncate hover:text-cyan-200 transition-colors"
                      title={item.name}
                    >
                      {item.name}
                    </a>
                    <div className="text-gray-500 flex justify-between">
                       <span>{item.status} - {item.size}</span>
                       <span>{formatTimestamp(item.completedTime, 'time')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
