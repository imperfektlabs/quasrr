'use client'

import { useState } from 'react'
import type { DiscoveryResult, SonarrLibraryItem, RadarrLibraryItem } from '@/types'
import { getRatingLink } from '@/utils/formatting'
import { formatSize } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'

// Discriminated union for all media item types
type MediaItem =
  | { source: 'discovery'; data: DiscoveryResult }
  | { source: 'library'; data: (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' }) }

type MediaCardProps = {
  item: MediaItem
  onClick?: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
  onTypeToggle?: (type: DiscoveryResult['type']) => void
}

export function MediaCard({ item, onClick, onShowReleases, onTypeToggle }: MediaCardProps) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')

  // Extract common fields based on source
  const poster = item.source === 'discovery' ? item.data.poster : item.data.poster
  const title = item.source === 'discovery' ? item.data.title : item.data.title
  const year = item.source === 'discovery' ? item.data.year : item.data.year
  const overview = item.source === 'discovery' ? item.data.overview : item.data.overview

  // Determine media type and status
  let mediaType: 'movie' | 'tv'
  let status: 'not_in_library' | 'in_library' | 'downloaded'
  let statusBadge: React.ReactNode
  let metadata: React.ReactNode
  let actionButton: React.ReactNode

  if (item.source === 'discovery') {
    const result = item.data
    mediaType = result.type
    status = result.status

    // Discovery metadata: year only
    metadata = result.year ? (
      <div className="text-xs text-gray-400 mt-0.5">
        {result.year}
        {result.type === 'movie' && result.runtime && ` • ${result.runtime} min`}
        {result.type === 'tv' && result.seasons && ` • ${result.seasons} season${result.seasons !== 1 ? 's' : ''}`}
        {result.type === 'tv' && result.network && ` • ${result.network}`}
      </div>
    ) : null

    statusBadge = (
      <div className="flex flex-wrap gap-1.5 items-center">
        <StatusBadge status={result.status} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onTypeToggle?.(result.type)
          }}
          className="glass-chip text-xs px-2 py-1 rounded transition hover:border-slate-200/70"
          title={`Filter to ${result.type === 'movie' ? 'movies' : 'TV shows'}`}
        >
          {result.type === 'movie' ? 'Movie' : 'TV'}
        </button>
        {result.type === 'tv' && result.seasons && result.seasons > 0 && (
          <select
            value={selectedSeason}
            onChange={(event) => {
              const value = event.target.value
              setSelectedSeason(value === 'all' ? 'all' : Number(value))
            }}
            onClick={(event) => event.stopPropagation()}
            className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-1 text-[11px]"
            title="Season"
          >
            <option value="all">All seasons</option>
            {Array.from({ length: result.seasons }, (_, index) => index + 1).map((season) => (
              <option key={season} value={season}>
                Season {season}
              </option>
            ))}
          </select>
        )}
      </div>
    )

    const handleReleasesClick = (event: React.MouseEvent) => {
      event.stopPropagation()
      if (result.type === 'tv' && selectedSeason !== 'all') {
        onShowReleases?.(result, selectedSeason)
        return
      }
      onShowReleases?.(result)
    }

    actionButton = (
      <div className="flex flex-wrap items-center justify-between md:flex-col md:items-end md:justify-start gap-2">
        {result.ratings && result.ratings.length > 0 && (
          <div className="flex flex-wrap justify-start md:justify-end gap-1.5 sm:gap-2">
            {result.ratings
              .filter((rating) => rating.source.toLowerCase() !== 'trakt')
              .slice(0, 3)
              .map((rating, idx) => (
                <span
                  key={rating.source}
                  className={idx === 0 ? 'inline-flex' : 'hidden sm:inline-flex'}
                >
                  <RatingBadge
                    rating={rating}
                    href={getRatingLink(result, rating)}
                  />
                </span>
              ))}
          </div>
        )}

        <button
          onClick={handleReleasesClick}
          className="bg-cyan-500/80 hover:bg-cyan-400 text-white py-1 px-2 sm:py-1.5 sm:px-3 rounded text-[11px] sm:text-xs font-semibold tracking-wide transition-colors ml-auto md:ml-0"
        >
          Find Releases
        </button>
      </div>
    )
  } else {
    // Library item
    const libItem = item.data
    mediaType = libItem.mediaType === 'movies' ? 'movie' : 'tv'

    const isDownloaded = libItem.mediaType === 'movies'
      ? libItem.hasFile
      : (libItem.episodeCount || 0) > 0 && libItem.episodeFileCount === libItem.episodeCount

    status = isDownloaded ? 'downloaded' : 'not_in_library'

    // Library metadata: year only
    metadata = libItem.year ? (
      <div className="text-xs text-gray-400 mt-0.5">
        {libItem.year}
      </div>
    ) : null

    statusBadge = (
      <div className="flex flex-wrap gap-1.5 items-center">
        <StatusBadge status={status} />
        <span className="glass-chip text-xs px-2 py-1 rounded">
          {libItem.mediaType === 'movies' ? 'Movie' : 'TV'}
        </span>
        {libItem.mediaType === 'tv' && (
          <span className="text-xs text-slate-400">
            {libItem.episodeFileCount || 0}/{libItem.episodeCount || 0} eps
          </span>
        )}
        <span className="text-xs text-slate-400">{formatSize(libItem.sizeOnDisk)}</span>
      </div>
    )

    actionButton = null
  }

  // Unified card layout - same structure for both discovery and library
  const CardWrapper = item.source === 'discovery' ? 'div' : 'button'
  const wrapperProps = item.source === 'library'
    ? { type: 'button' as const, onClick }
    : {}

  return (
    <CardWrapper
      {...wrapperProps}
      className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40"
    >
      {/* Poster */}
      <div className="w-24 md:w-32 flex-shrink-0">
        <div className="aspect-[2/3] w-full bg-slate-800/60">
          {item.source === 'discovery' ? (
            <button
              type="button"
              onClick={onClick}
              className="w-full h-full"
              title="Open details"
            >
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                  No poster
                </div>
              )}
            </button>
          ) : (
            <>
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                  No poster
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content - unified grid layout */}
      <div className="flex-1 p-2 sm:p-3 grid grid-cols-1 md:grid-cols-[1fr,140px] gap-2 md:gap-3 min-w-0">
        {/* Left column: Title, metadata, badges, overview */}
        <div className="min-w-0">
          <div className="mb-1">
            <h3 className="font-semibold text-sm sm:text-base leading-tight truncate">
              {title}
            </h3>
            {metadata}
          </div>

          <div className="mb-2">
            {statusBadge}
          </div>

          {overview && (
            <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-2 sm:line-clamp-3">
              {overview}
            </p>
          )}
        </div>

        {/* Right column: Ratings and action button (discovery only) */}
        {actionButton}
      </div>
    </CardWrapper>
  )
}
