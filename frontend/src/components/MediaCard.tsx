'use client'

import { useState } from 'react'
import type { DiscoveryResult, SonarrLibraryItem, RadarrLibraryItem } from '@/types'
import { formatSeriesYearSpan, formatSize, getRatingLink } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'
import { ProjectorIcon, TvIcon, SearchIcon } from './Icons'

// Discriminated union for all media item types
type MediaItem =
  | { source: 'discovery'; data: DiscoveryResult }
  | { source: 'library'; data: (SonarrLibraryItem & { mediaType: 'tv' }) | (RadarrLibraryItem & { mediaType: 'movies' }) }

type MediaCardProps = {
  item: MediaItem
  onClick?: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
  onTypeToggle?: (type: DiscoveryResult['type']) => void
  onLibrarySearch?: () => void
  onLibraryDelete?: () => void
}

export function MediaCard({
  item,
  onClick,
  onShowReleases,
  onTypeToggle,
  onLibrarySearch,
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
  let actionButtons: React.ReactNode = null

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

    // Action button
    const handleReleasesClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (result.type === 'tv' && selectedSeason !== 'all') {
        onShowReleases?.(result, selectedSeason)
      } else {
        onShowReleases?.(result)
      }
    }

    actionButtons = (
      <button
        onClick={handleReleasesClick}
        className="w-full bg-cyan-500/90 hover:bg-cyan-400 hover:shadow-glow-cyan text-white py-2 px-3 rounded-lg inline-flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-95"
        aria-label="Find releases"
      >
        <SearchIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Find Releases</span>
      </button>
    )
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
    actionButtons = (
      <div className="flex gap-2">
        {libItem.mediaType === 'movies' && (
          <button
            onClick={(e) => { e.stopPropagation(); onLibrarySearch?.() }}
            className="flex-1 bg-cyan-500/90 hover:bg-cyan-400 hover:shadow-glow-cyan text-white py-2 px-3 rounded-lg inline-flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-95"
          >
            <SearchIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Search</span>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onLibraryDelete?.() }}
          className="flex-1 bg-rose-500/80 hover:bg-rose-500 text-white py-2 px-3 rounded-lg inline-flex items-center justify-center transition-all duration-300 hover:scale-[1.02] active:scale-95"
        >
          <span className="text-sm font-medium">Remove</span>
        </button>
      </div>
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
            {/* Gradient overlay that appears on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Badges overlaid on poster bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              {badges}
              {ratings}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No poster
          </div>
        )}
      </button>

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

        {actionButtons}
      </div>
    </div>
  )
}
