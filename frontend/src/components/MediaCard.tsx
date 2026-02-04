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

  const renderRatings = (
    ratings: DiscoveryResult['ratings'] | null | undefined,
    getHref: (rating: NonNullable<DiscoveryResult['ratings']>[number]) => string | null,
  ) => {
    if (!ratings || ratings.length === 0) return null
    const priorityOrder = ['imdb', 'tmdb', 'tvdb', 'rottentomatoes']
    const sortedRatings = [...ratings]
      .filter((rating) => !['trakt', 'metacritic'].includes(rating.source.toLowerCase()))
      .sort((a, b) => {
        const aSource = a.source.toLowerCase()
        const bSource = b.source.toLowerCase()
        const aIndex = priorityOrder.indexOf(aSource)
        const bIndex = priorityOrder.indexOf(bSource)
        const normalizedA = aIndex === -1 ? priorityOrder.length : aIndex
        const normalizedB = bIndex === -1 ? priorityOrder.length : bIndex
        return normalizedA - normalizedB
      })
    return (
      <div className="flex flex-wrap justify-start md:justify-end gap-1.5 sm:gap-2">
        {sortedRatings
          .slice(0, 3)
          .map((rating, idx) => (
            <span
              key={rating.source}
              className={idx === 0 ? 'inline-flex' : 'hidden sm:inline-flex'}
            >
              <RatingBadge
                rating={rating}
                href={getHref(rating)}
              />
            </span>
          ))}
      </div>
    )
  }

  const getLibraryRatingLink = (
    rating: NonNullable<DiscoveryResult['ratings']>[number],
    libItem: SonarrLibraryItem | RadarrLibraryItem,
    type: 'movie' | 'tv',
  ) => {
    const source = rating.source.toLowerCase()
    if (source === 'imdb' && libItem.imdbId) {
      return `https://www.imdb.com/title/${libItem.imdbId}/`
    }
    if (source === 'tmdb' && (libItem as RadarrLibraryItem).tmdbId) {
      const tmdbId = (libItem as RadarrLibraryItem).tmdbId
      return type === 'movie'
        ? `https://www.themoviedb.org/movie/${tmdbId}`
        : `https://www.themoviedb.org/tv/${tmdbId}`
    }
    if (source === 'tvdb') {
      return `https://thetvdb.com/search?query=${encodeURIComponent(libItem.title)}`
    }
    return null
  }

  // Extract common fields based on source
  const poster = item.source === 'discovery' ? item.data.poster : item.data.poster
  const title = item.source === 'discovery' ? item.data.title : item.data.title
  const year = item.source === 'discovery' ? item.data.year : item.data.year
  const overview = item.source === 'discovery' ? item.data.overview : item.data.overview

  // Determine media type and status
  let mediaType: 'movie' | 'tv'
  let status: 'not_in_library' | 'in_library' | 'partial' | 'downloaded'
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

    const discoveryLibraryLink = result.type === 'movie' && result.tmdb_id
      ? `/library?tmdb=${result.tmdb_id}`
      : (result.type === 'tv' && result.tvdb_id ? `/library?tvdb=${result.tvdb_id}` : null)

    statusBadge = (
      <div className="flex flex-wrap gap-1.5 items-center">
        {result.status !== 'not_in_library' && discoveryLibraryLink ? (
          <a
            href={discoveryLibraryLink}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex"
            title="View in library"
            aria-label="View in library"
          >
            <StatusBadge status={result.status} />
          </a>
        ) : (
          <StatusBadge status={result.status} />
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onTypeToggle?.(result.type)
          }}
          className="glass-chip text-xs px-2 py-1 rounded transition hover:border-slate-200/70 inline-flex items-center justify-center"
          title={`Filter to ${result.type === 'movie' ? 'movies' : 'TV shows'}`}
          aria-label={`Filter to ${result.type === 'movie' ? 'movies' : 'TV shows'}`}
        >
          {result.type === 'movie' ? (
            <ProjectorIcon className="h-3.5 w-3.5" />
          ) : (
            <TvIcon className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">{result.type === 'movie' ? 'Movie' : 'TV'}</span>
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
        {renderRatings(result.ratings, (rating) => getRatingLink(result, rating))}

        <button
          onClick={handleReleasesClick}
          className="bg-cyan-500/80 hover:bg-cyan-400 text-white h-7 w-7 sm:h-8 sm:w-8 rounded inline-flex items-center justify-center transition-colors ml-auto md:ml-0"
          aria-label="Find releases"
        >
          <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      </div>
    )
  } else {
    // Library item
    const libItem = item.data
    mediaType = libItem.mediaType === 'movies' ? 'movie' : 'tv'

    if (libItem.mediaType === 'movies') {
      status = libItem.hasFile ? 'downloaded' : 'in_library'
    } else {
      const totalEpisodes = libItem.totalEpisodeCount ?? libItem.episodeCount ?? 0
      const downloadedEpisodes = libItem.episodeFileCount ?? 0
      if (totalEpisodes > 0 && downloadedEpisodes >= totalEpisodes) {
        status = 'downloaded'
      } else if (downloadedEpisodes > 0) {
        status = 'partial'
      } else {
        status = 'in_library'
      }
    }

    const libraryYearLabel = libItem.mediaType === 'tv'
      ? formatSeriesYearSpan({
        year: libItem.year,
        firstAired: libItem.firstAired,
        lastAired: libItem.lastAired,
        ended: libItem.ended,
      })
      : (libItem.year ? `${libItem.year}` : '')
    metadata = libraryYearLabel ? (
      <div className="text-xs text-gray-400 mt-0.5">
        {libraryYearLabel}
      </div>
    ) : null

    statusBadge = (
      <div className="flex flex-wrap gap-1.5 items-center">
        <StatusBadge status={status} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onTypeToggle?.(libItem.mediaType === 'movies' ? 'movie' : 'tv')
          }}
          className="glass-chip text-xs px-2 py-1 rounded transition hover:border-slate-200/70 inline-flex items-center justify-center"
          title={`Filter to ${libItem.mediaType === 'movies' ? 'movies' : 'TV shows'}`}
          aria-label={`Filter to ${libItem.mediaType === 'movies' ? 'movies' : 'TV shows'}`}
        >
          {libItem.mediaType === 'movies' ? (
            <ProjectorIcon className="h-3.5 w-3.5" />
          ) : (
            <TvIcon className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">{libItem.mediaType === 'movies' ? 'Movie' : 'TV'}</span>
        </button>
        {libItem.mediaType === 'tv' && (
          <span className="glass-chip text-xs px-2 py-1 rounded">
            {libItem.episodeFileCount || 0}/{libItem.totalEpisodeCount ?? libItem.episodeCount ?? 0} eps
          </span>
        )}
        <span className="glass-chip text-xs px-2 py-1 rounded">{formatSize(libItem.sizeOnDisk)}</span>
      </div>
    )

    const libraryRatings = (libItem.ratings && libItem.ratings.length > 0)
      ? libItem.ratings
      : (libItem.imdbRating ? [{ source: 'imdb', value: libItem.imdbRating }] : [])
    const filteredRatings = mediaType === 'tv'
      ? libraryRatings.filter((rating) => rating.source.toLowerCase() === 'tvdb')
      : libraryRatings

    actionButton = (
      <div className="flex flex-wrap items-center justify-between md:flex-col md:items-end md:justify-start gap-2">
        {renderRatings(filteredRatings, (rating) => getLibraryRatingLink(rating, libItem, mediaType))}

        <div className="flex items-center gap-2 ml-auto md:ml-0">
          {libItem.mediaType === 'movies' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onLibrarySearch?.()
              }}
              className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-cyan-500/80 text-white hover:bg-cyan-400 inline-flex items-center justify-center transition-colors"
              title="Search All"
              aria-label="Search All"
            >
              <SearchIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onLibraryDelete?.()
            }}
            className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-rose-500/70 text-white hover:bg-rose-500/80 inline-flex items-center justify-center transition-colors"
            title="Remove title from library"
            aria-label="Remove title from library"
          >
            ✕
          </button>
        </div>
      </div>
    )
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
      <div className="w-[7.5rem] md:w-[10rem] flex-shrink-0">
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
                  className="w-full h-full object-contain block"
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
                  className="w-full h-full object-contain block"
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
