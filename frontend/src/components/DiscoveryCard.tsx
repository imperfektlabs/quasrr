'use client'

import { useState } from 'react'
import type { DiscoveryResult } from '@/types'
import { getRatingLink } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'

export function DiscoveryCard({
  result,
  onShowReleases,
  onShowDetails,
}: {
  result: DiscoveryResult
  onShowReleases: (result: DiscoveryResult, season?: number) => void
  onShowDetails: (result: DiscoveryResult) => void
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')

  const handleReleasesClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (result.type === 'tv' && selectedSeason !== 'all') {
      onShowReleases(result, selectedSeason)
      return
    }
    onShowReleases(result)
  }

  return (
    <div className="glass-card rounded-lg overflow-hidden flex w-full text-left transition hover:border-slate-400/40">
      {/* Poster */}
      <div className="w-24 md:w-32 flex-shrink-0">
        <div className="aspect-[2/3] w-full bg-slate-800/60">
          <button
            type="button"
            onClick={() => onShowDetails(result)}
            className="w-full h-full"
            title="Open details"
          >
            {result.poster ? (
              <img
                src={result.poster}
                alt={result.title}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs p-2 text-center">
                No poster
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-2 sm:p-3 grid grid-cols-1 md:grid-cols-[1fr,140px] gap-2 md:gap-3 min-w-0">
        {/* Title and year */}
        <div className="min-w-0">
          <div className="mb-1">
            <h3 className="font-semibold text-sm sm:text-base leading-tight truncate">
              {result.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm text-gray-400">
              {result.year && <span>{result.year}</span>}
              {result.type === 'movie' && result.runtime && (
                <span>{result.runtime} min</span>
              )}
              {result.type === 'tv' && result.seasons && (
                <span>{result.seasons} season{result.seasons !== 1 ? 's' : ''}</span>
              )}
              {result.type === 'tv' && result.network && (
                <span className="truncate">{result.network}</span>
              )}
            </div>
          </div>

          <div className="mb-1 flex flex-wrap gap-1.5 items-center">
            <StatusBadge status={result.status} />
            <span className="glass-chip text-xs px-2 py-1 rounded">
              {result.type === 'movie' ? 'Movie' : 'TV'}
            </span>
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

          {result.overview && (
            <p className="text-gray-400 text-[11px] sm:text-xs line-clamp-1 sm:line-clamp-2 mb-2 sm:mb-3">
              {result.overview}
            </p>
          )}

          {/* Season picker moved to right column */}
        </div>

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
      </div>
    </div>
  )
}
