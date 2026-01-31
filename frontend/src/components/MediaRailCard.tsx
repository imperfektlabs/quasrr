'use client'

import type { DiscoveryResult } from '@/types'

type MediaRailCardProps = {
  result: DiscoveryResult
  onClick?: () => void
  onShowReleases?: (result: DiscoveryResult) => void
}

export function MediaRailCard({ result, onClick, onShowReleases }: MediaRailCardProps) {
  const primaryMeta = result.type === 'movie'
    ? `${result.year || '—'}${result.runtime ? ` • ${result.runtime} min` : ''}`
    : `${result.year || '—'}${result.seasons ? ` • ${result.seasons} season${result.seasons !== 1 ? 's' : ''}` : ''}`

  const chip = result.status === 'downloaded'
    ? 'Downloaded'
    : result.status === 'in_library'
      ? 'In Library'
      : 'Missing'

  return (
    <article className="rail-card" onClick={onClick}>
      <div className="rail-card__poster">
        {result.poster ? (
          <img src={result.poster} alt={result.title} loading="lazy" />
        ) : (
          <div className="rail-card__poster--empty">No poster</div>
        )}
      </div>
      <div className="rail-card__body">
        <h3 className="rail-card__title">{result.title}</h3>
        <div className="rail-card__meta">{primaryMeta}</div>
        <div className="rail-card__chips">
          <span className="glass-chip">{chip}</span>
          {result.type === 'movie' ? (
            <span className="glass-chip">Movie</span>
          ) : (
            <span className="glass-chip">TV</span>
          )}
        </div>
        {result.overview && (
          <p className="rail-card__overview">{result.overview}</p>
        )}
        {onShowReleases && (
          <div className="rail-card__actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onShowReleases(result)
              }}
            >
              Find Releases
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
