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

type MediaCardListProps = {
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

export function MediaCardList({
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
}: MediaCardListProps) {
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
      <div className="flex flex-wrap justify-start md:justify-end gap-1.5">
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
      <div className="text-2xs text-gray-400 mt-0.5 leading-relaxed">
        {result.year}
        {result.type === 'movie' && result.runtime && ` • ${result.runtime} min`}
        {result.type === 'tv' && result.seasons && ` • ${result.seasons} season${result.seasons !== 1 ? 's' : ''}`}
        {result.type === 'tv' && result.network && ` • ${result.network}`}
      </div>
    ) : null

    if (discoveryMode === 'external') {
      statusBadge = (
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onTypeToggle?.(result.type)
            }}
            className="glass-badge text-2xs px-1.5 py-0.5 rounded transition-smooth hover:shadow-glow-cyan inline-flex items-center justify-center"
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
        </div>
      )
    } else {
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
            className="glass-badge text-2xs px-1.5 py-0.5 rounded transition-smooth hover:shadow-glow-cyan inline-flex items-center justify-center"
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
          {result.type === 'tv' && result.seasons && result.seasons > 1 && (
            <select
              value={selectedSeason}
              onChange={(event) => {
                const value = event.target.value
                setSelectedSeason(value === 'all' ? 'all' : Number(value))
              }}
              onClick={(event) => event.stopPropagation()}
              className="glass-badge text-2xs px-1.5 py-0.5 rounded cursor-pointer border-0 transition-smooth hover:shadow-glow-cyan"
              title="Season"
            >
              <option value="all">All</option>
              {Array.from({ length: result.seasons }, (_, index) => index + 1).map((season) => (
                <option key={season} value={season}>
                  S{season}
                </option>
              ))}
            </select>
          )}
        </div>
      )
    }

    const handleReleasesClick = (event: React.MouseEvent) => {
      event.stopPropagation()
      if (result.type === 'tv' && selectedSeason !== 'all') {
        onShowReleases?.(result, selectedSeason)
        return
      }
      onShowReleases?.(result)
    }

    if (discoveryMode === 'external') {
      actionButton = (
        <div className="flex flex-wrap items-center justify-between md:flex-col md:items-end md:justify-start gap-2">
          {renderRatings(result.ratings, (rating) => getRatingLink(result, rating))}
        </div>
      )
    } else {
      actionButton = (
        <div className="flex flex-wrap items-center justify-between md:flex-col md:items-end md:justify-start gap-2">
          {renderRatings(result.ratings, (rating) => getRatingLink(result, rating))}

          <button
            onClick={handleReleasesClick}
            disabled={discoverySearchBusy}
            className="bg-cyan-500/90 hover:bg-cyan-400 hover:shadow-glow-cyan text-white h-8 w-8 sm:h-9 sm:w-9 rounded-lg inline-flex items-center justify-center transition-smooth active:scale-95 ml-auto md:ml-0"
            aria-label="Find releases"
          >
            {discoverySearchBusy ? (
              <ReelIcon className="h-full w-full p-1.5 sm:p-2 animate-spin" />
            ) : (
              <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </button>
        </div>
      )
    }
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
      <div className="text-2xs text-gray-400 mt-0.5 leading-relaxed">
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
          className="glass-badge text-2xs px-1.5 py-0.5 rounded transition-smooth hover:shadow-glow-cyan inline-flex items-center justify-center"
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
          <span className="glass-badge text-2xs px-1.5 py-0.5 rounded">
            {libItem.episodeFileCount || 0}/{libItem.totalEpisodeCount ?? libItem.episodeCount ?? 0} eps
          </span>
        )}
        <span className="glass-badge text-2xs px-1.5 py-0.5 rounded">{formatSize(libItem.sizeOnDisk)}</span>
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
              disabled={librarySearchBusy}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-cyan-500/90 text-white hover:bg-cyan-400 hover:shadow-glow-cyan inline-flex items-center justify-center transition-smooth active:scale-95"
              title="Search All"
              aria-label="Search All"
            >
              {librarySearchBusy ? (
                <ReelIcon className="h-full w-full p-1.5 sm:p-2 animate-spin" />
              ) : (
                <SearchIcon className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onLibraryDelete?.()
            }}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-rose-500/80 text-white hover:bg-rose-500 transition-smooth active:scale-95"
            title="Remove title from library"
            aria-label="Remove title from library"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Horizontal card layout - optimized for mobile
  const CardWrapper = 'div'
  const wrapperProps = {}

  return (
    <CardWrapper
      {...wrapperProps}
      className="glass-card rounded-lg overflow-hidden flex w-full text-left transition-smooth active:scale-[0.98]"
    >
      {/* Poster - Responsive sizing */}
      <div className="w-28 sm:w-32 md:w-32 lg:w-36 xl:w-40 flex-shrink-0">
        <div className="aspect-[2/3] w-full bg-slate-800/60 relative overflow-hidden">
          {item.source === 'discovery' && discoveryMode === 'external' && externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full h-full relative overflow-hidden block"
              title={externalLabel}
            >
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xs p-2 text-center">
                  No poster
                </div>
              )}
            </a>
          ) : item.source === 'discovery' ? (
            <button
              type="button"
              onClick={onClick}
              className="w-full h-full relative overflow-hidden"
              title="Open details"
            >
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xs p-2 text-center">
                  No poster
                </div>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClick}
              className="w-full h-full relative overflow-hidden"
              title="Open details"
            >
              {poster ? (
                <img
                  src={poster}
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xs p-2 text-center">
                  No poster
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content - unified grid layout */}
      <div className="flex-1 p-2.5 sm:p-3 grid grid-cols-1 md:grid-cols-[1fr,150px] gap-2 md:gap-3 min-w-0">
        {/* Left column: Title, metadata, badges, overview */}
        <div className="min-w-0 flex flex-col">
          <div className="mb-1.5">
            <h3 className="font-semibold text-sm sm:text-base leading-tight truncate text-slate-50">
              {title}
            </h3>
            {metadata}
          </div>

          <div className="mb-1.5">
            {statusBadge}
          </div>

          {overview && (
            <p className="text-gray-400 text-2xs sm:text-xs line-clamp-2 sm:line-clamp-3 leading-relaxed hidden sm:block">
              {overview}
            </p>
          )}
        </div>

        {/* Right column: Ratings and action button */}
        {actionButton}
      </div>
    </CardWrapper>
  )
}
