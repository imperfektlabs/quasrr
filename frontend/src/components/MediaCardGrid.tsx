'use client'

import { useState } from 'react'
import type { DiscoveryResult, SonarrLibraryItem, RadarrLibraryItem } from '@/types'
import { formatSeriesYearSpan, formatSize, getRatingLink } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'
import { ProjectorIcon, TvIcon, SearchIcon, ReelIcon } from './Icons'

// Discriminated union for all media item types
type MediaItem =
  | { source: 'discovery'; data: DiscoveryResult }
  | { source: 'library'; data: (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' }) }

type MediaCardProps = {
  item: MediaItem
  onClick?: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
  discoverySearchBusy?: boolean
  discoveryMode?: 'interactive' | 'external'
  externalUrl?: string
  externalLabel?: string
  onTypeToggle?: (type: DiscoveryResult['type']) => void
  onLibrarySearch?: () => void
  librarySearchBusy?: boolean
  onLibraryDelete?: () => void
}

export function MediaCardGrid({
  item,
  onClick,
  onShowReleases,
  discoverySearchBusy = false,
  discoveryMode = 'interactive',
  externalUrl,
  externalLabel = 'View Source',
  onTypeToggle,
  onLibrarySearch,
  librarySearchBusy = false,
  onLibraryDelete,
}: MediaCardProps) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')

  // Extract common fields
  const poster = item.source === 'discovery' ? item.data.poster : item.data.poster
  const title = item.source === 'discovery' ? item.data.title : item.data.title
  const year = item.source === 'discovery' ? item.data.year : item.data.year
  const overview = item.source === 'discovery' ? item.data.overview : item.data.overview

  // Determine media type and status
  let mediaType: 'movie' | 'tv'
  let status: 'not_in_library' | 'in_library' | 'partial' | 'downloaded'
  let ratings: React.ReactNode = null
  let badges: React.ReactNode = null
  let overlayActions: React.ReactNode = null
  let mobileActions: React.ReactNode = null

  if (item.source === 'discovery') {
    const result = item.data
    mediaType = result.type
    status = result.status

    // Ratings
    const priorityOrder = ['imdb', 'tmdb', 'tvdb', 'rottentomatoes']
    const sortedRatings = result.ratings
      ? [...result.ratings]
          .filter((r) => !['trakt', 'metacritic'].includes(r.source.toLowerCase()))
          .sort((a, b) => {
            const aIdx = priorityOrder.indexOf(a.source.toLowerCase())
            const bIdx = priorityOrder.indexOf(b.source.toLowerCase())
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
          })
          .slice(0, 2)
      : []

    ratings = sortedRatings.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {sortedRatings.map((rating) => (
          <RatingBadge
            key={rating.source}
            rating={rating}
            href={getRatingLink(result, rating)}
          />
        ))}
      </div>
    )

    // Badges
    if (discoveryMode === 'external') {
      badges = null
    } else {
      const discoveryLibraryLink = result.type === 'movie' && result.tmdb_id
        ? `/library?tmdb=${result.tmdb_id}`
        : (result.type === 'tv' && result.tvdb_id ? `/library?tvdb=${result.tvdb_id}` : null)

      badges = (
        <div className="flex flex-wrap gap-1.5 items-center">
          {result.status !== 'not_in_library' && discoveryLibraryLink ? (
            <a
              href={discoveryLibraryLink}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex"
              title="View in library"
            >
              <StatusBadge status={result.status} />
            </a>
          ) : (
            <StatusBadge status={result.status} />
          )}
          {result.type === 'tv' && result.seasons && result.seasons > 1 && (
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="glass-badge text-2xs px-1.5 py-0.5 rounded cursor-pointer border-0 transition-smooth hover:shadow-glow-cyan"
            >
              <option value="all">All</option>
              {Array.from({ length: result.seasons }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>S{s}</option>
              ))}
            </select>
          )}
        </div>
      )
    }

    // Action button
    const handleReleasesClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (result.type === 'tv' && selectedSeason !== 'all') {
        onShowReleases?.(result, selectedSeason)
      } else {
        onShowReleases?.(result)
      }
    }

    if (discoveryMode === 'external') {
      overlayActions = null
      mobileActions = null
    } else {
      overlayActions = (
        <button
          onClick={handleReleasesClick}
          disabled={discoverySearchBusy}
          className="h-6 w-6 rounded bg-cyan-500/90 hover:bg-cyan-400 hover:shadow-glow-cyan text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
          aria-label="Find releases"
          title="Find releases"
        >
          {discoverySearchBusy ? (
            <ReelIcon className="h-full w-full p-1 animate-spin" />
          ) : (
            <SearchIcon className="h-3 w-3" />
          )}
        </button>
      )
      mobileActions = (
        <button
          onClick={handleReleasesClick}
          disabled={discoverySearchBusy}
          className="h-8 w-8 rounded bg-cyan-500/90 hover:bg-cyan-400 text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
          aria-label="Find releases"
          title="Find releases"
        >
          {discoverySearchBusy ? (
            <ReelIcon className="h-full w-full p-1.5 animate-spin" />
          ) : (
            <SearchIcon className="h-3.5 w-3.5" />
          )}
        </button>
      )
    }
  } else {
    // Library item
    const libItem = item.data
    mediaType = libItem.mediaType === 'movies' ? 'movie' : 'tv'

    if (libItem.mediaType === 'movies') {
      status = libItem.hasFile ? 'downloaded' : 'in_library'
    } else {
      const total = libItem.totalEpisodeCount ?? libItem.episodeCount ?? 0
      const downloaded = libItem.episodeFileCount ?? 0
      status = total > 0 && downloaded >= total ? 'downloaded' : downloaded > 0 ? 'partial' : 'in_library'
    }

    // Ratings
    const libRatings = (libItem.ratings && libItem.ratings.length > 0)
      ? libItem.ratings
      : (libItem.imdbRating ? [{ source: 'imdb', value: libItem.imdbRating }] : [])
    const filteredRatings = mediaType === 'tv'
      ? libRatings.filter((r) => r.source.toLowerCase() === 'tvdb').slice(0, 1)
      : libRatings.slice(0, 2)

    ratings = filteredRatings.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {filteredRatings.map((rating) => {
          const source = rating.source.toLowerCase()
          let href = null
          if (source === 'imdb' && libItem.imdbId) href = `https://www.imdb.com/title/${libItem.imdbId}/`
          else if (source === 'tmdb' && (libItem as RadarrLibraryItem).tmdbId) {
            const tmdbId = (libItem as RadarrLibraryItem).tmdbId
            href = mediaType === 'movie' ? `https://www.themoviedb.org/movie/${tmdbId}` : `https://www.themoviedb.org/tv/${tmdbId}`
          }
          return <RatingBadge key={rating.source} rating={rating} href={href} />
        })}
      </div>
    )

    // Badges
    badges = (
      <div className="flex flex-wrap gap-1.5 items-center">
        <StatusBadge status={status} />
        {libItem.mediaType === 'tv' && (
          <span className="glass-badge text-2xs px-1.5 py-0.5 rounded">
            {libItem.episodeFileCount || 0}/{libItem.totalEpisodeCount ?? libItem.episodeCount ?? 0}
          </span>
        )}
        <span className="glass-badge text-2xs px-1.5 py-0.5 rounded">
          {formatSize(libItem.sizeOnDisk)}
        </span>
      </div>
    )

    // Action buttons
    overlayActions = (
      <>
        {libItem.mediaType === 'movies' && (
          <button
            onClick={(e) => { e.stopPropagation(); onLibrarySearch?.() }}
            disabled={librarySearchBusy}
            className="h-6 w-6 rounded bg-cyan-500/90 hover:bg-cyan-400 hover:shadow-glow-cyan text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
            aria-label="Search releases"
            title="Search releases"
          >
            {librarySearchBusy ? (
              <ReelIcon className="h-full w-full p-1 animate-spin" />
            ) : (
              <SearchIcon className="h-3 w-3" />
            )}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onLibraryDelete?.() }}
          className="h-6 w-6 rounded bg-rose-500/80 hover:bg-rose-500 text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
          aria-label="Remove title"
          title="Remove title"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      </>
    )
    mobileActions = (
      <>
        {libItem.mediaType === 'movies' && (
          <button
            onClick={(e) => { e.stopPropagation(); onLibrarySearch?.() }}
            disabled={librarySearchBusy}
            className="h-8 w-8 rounded bg-cyan-500/90 hover:bg-cyan-400 text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
            aria-label="Search releases"
            title="Search releases"
          >
            {librarySearchBusy ? (
              <ReelIcon className="h-full w-full p-1.5 animate-spin" />
            ) : (
              <SearchIcon className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onLibraryDelete?.() }}
          className="h-8 w-8 rounded bg-rose-500/80 hover:bg-rose-500 text-white inline-flex items-center justify-center transition-all duration-300 active:scale-95"
          aria-label="Remove title"
          title="Remove title"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      </>
    )
  }

  // Metadata
  const metadata = item.source === 'discovery'
    ? item.data.year
      ? `${item.data.year}${item.data.type === 'movie' && item.data.runtime ? ` • ${item.data.runtime}m` : ''}${item.data.type === 'tv' && item.data.seasons ? ` • ${item.data.seasons}S` : ''}`
      : ''
    : item.data.mediaType === 'tv'
      ? formatSeriesYearSpan({
          year: item.data.year,
          firstAired: item.data.firstAired,
          lastAired: item.data.lastAired,
          ended: item.data.ended,
        })
      : item.data.year ? `${item.data.year}` : ''

  return (
    <div className="glass-card rounded-xl overflow-hidden group transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/20 hover:border-cyan-400/40">
      {/* POSTER - Full-width hero */}
      {item.source === 'discovery' && discoveryMode === 'external' && externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full aspect-[2/3] relative overflow-hidden bg-slate-800/60 block"
          title={externalLabel}
        >
          {poster ? (
            <>
              <img
                src={poster}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute top-2 right-2 z-10">
                <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 rounded-md p-1.5 shadow-lg">
                  {mediaType === 'movie' ? (
                    <ProjectorIcon className="h-3.5 w-3.5 text-cyan-400" />
                  ) : (
                    <TvIcon className="h-3.5 w-3.5 text-purple-400" />
                  )}
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <div className="flex items-center justify-end gap-1.5">
                  {ratings}
                  {overlayActions && <div className="hidden md:flex items-center gap-1.5">{overlayActions}</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
              No poster
            </div>
          )}
        </a>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="w-full aspect-[2/3] relative overflow-hidden bg-slate-800/60"
          title="View details"
        >
        {poster ? (
          <>
            <img
              src={poster}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            {/* Media type indicator - always visible in top-right */}
            <div className="absolute top-2 right-2 z-10">
              <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 rounded-md p-1.5 shadow-lg">
                {mediaType === 'movie' ? (
                  <ProjectorIcon className="h-3.5 w-3.5 text-cyan-400" />
                ) : (
                  <TvIcon className="h-3.5 w-3.5 text-purple-400" />
                )}
              </div>
            </div>

            {/* Gradient overlay that appears on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Badges overlaid on poster bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              <div className="flex flex-wrap items-center gap-1.5">
                {badges}
                {overlayActions && <div className="hidden md:flex items-center gap-1.5 ml-auto">{overlayActions}</div>}
              </div>
              {ratings}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No poster
          </div>
        )}
        </button>
      )}

      {/* CONTENT - Compact below poster */}
      <div className="p-3 space-y-2.5">
        <div>
          <h3 className="font-semibold text-sm leading-tight truncate text-slate-50 group-hover:text-cyan-200 transition-colors">
            {title}
          </h3>
          {metadata && (
            <p className="text-2xs text-gray-400 mt-0.5 truncate">
              {metadata}
            </p>
          )}
        </div>

        {mobileActions && (
          <div className="flex md:hidden items-center justify-end gap-2">
            {mobileActions}
          </div>
        )}
      </div>
    </div>
  )
}
