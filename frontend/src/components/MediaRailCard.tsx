'use client'

import { useState } from 'react'
import type { DiscoveryResult, RadarrLibraryItem, SonarrLibraryItem } from '@/types'
import { formatSeriesYearSpan, formatSize } from '@/utils/formatting'

type LibraryItem =
  | (SonarrLibraryItem & { mediaType: 'tv' })
  | (RadarrLibraryItem & { mediaType: 'movies' })

type MediaRailCardProps =
  | {
      item: { source: 'discovery'; data: DiscoveryResult }
      onClick?: () => void
      onShowReleases?: (result: DiscoveryResult) => void
      expanded?: boolean
      onExpand?: () => void
      onCollapse?: () => void
    }
  | {
      item: { source: 'library'; data: LibraryItem }
      onClick?: () => void
      expanded?: boolean
      onExpand?: () => void
      onCollapse?: () => void
    }

export function MediaRailCard(props: MediaRailCardProps) {
  const { item, onClick, expanded = false, onExpand, onCollapse } = props
  const [localExpanded, setLocalExpanded] = useState(false)

  const isExpanded = expanded || localExpanded

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isExpanded) {
      // Already expanded, do nothing on card click (use collapse button)
      return
    }
    // Expand the card
    if (onExpand) {
      onExpand()
    } else {
      setLocalExpanded(true)
    }
  }

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onCollapse) {
      onCollapse()
    } else {
      setLocalExpanded(false)
    }
  }

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick?.()
  }

  if (item.source === 'discovery') {
    const data = item.data
    const poster = data.poster
    const title = data.title
    const primaryMeta = data.type === 'movie'
      ? `${data.year || '—'}${data.runtime ? ` • ${data.runtime} min` : ''}`
      : `${formatSeriesYearSpan({
        year: data.year,
        firstAired: data.first_aired,
        lastAired: data.last_aired,
        ended: data.ended,
      }) || data.year || '—'}${data.seasons ? ` • ${data.seasons} season${data.seasons !== 1 ? 's' : ''}` : ''}`
    const statusChip = data.status === 'downloaded'
      ? 'Downloaded'
      : data.status === 'in_library'
        ? 'In Library'
        : 'Missing'
    const typeChip = data.type === 'movie' ? 'Movie' : 'TV'

    return (
      <article
        className={`rail-card ${isExpanded ? 'rail-card--expanded' : ''}`}
        onClick={handleClick}
        data-expanded={isExpanded}
      >
        <div className="rail-card__poster">
          {poster ? (
            <img src={poster} alt={title} loading="lazy" />
          ) : (
            <div className="rail-card__poster--empty">No poster</div>
          )}
        </div>
        <div className="rail-card__body">
          <h3 className="rail-card__title">{title}</h3>
          <div className="rail-card__meta">{primaryMeta}</div>
          <div className="rail-card__chips">
            <span className="glass-chip">{statusChip}</span>
            <span className="glass-chip">{typeChip}</span>
          </div>

          {/* Expanded content */}
          {isExpanded && (
            <div className="rail-card__expanded-content">
              {data.overview && (
                <p className="rail-card__overview rail-card__overview--visible">{data.overview}</p>
              )}
              {data.genres && data.genres.length > 0 && (
                <div className="rail-card__genres">
                  {data.genres.slice(0, 3).map((g) => (
                    <span key={g} className="glass-chip">{g}</span>
                  ))}
                </div>
              )}
              <div className="rail-card__expanded-actions">
                {'onShowReleases' in props && props.onShowReleases && (
                  <button
                    type="button"
                    className="rail-card__action-btn rail-card__action-btn--primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onShowReleases?.(data)
                    }}
                  >
                    Find Releases
                  </button>
                )}
                <button
                  type="button"
                  className="rail-card__action-btn"
                  onClick={handleViewDetails}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="rail-card__collapse-btn"
                  onClick={handleCollapse}
                  aria-label="Collapse"
                >
                  &times;
                </button>
              </div>
            </div>
          )}

          {/* Collapsed: show overview on focus only */}
          {!isExpanded && data.overview && (
            <p className="rail-card__overview">{data.overview}</p>
          )}
          {!isExpanded && 'onShowReleases' in props && props.onShowReleases && (
            <div className="rail-card__actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onShowReleases?.(data)
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

  const data = item.data
  const poster = data.poster
  const title = data.title
  const primaryMeta = data.mediaType === 'movies'
    ? `${data.year || '—'} • ${formatSize(data.sizeOnDisk || 0)}`
    : `${formatSeriesYearSpan({
      year: data.year,
      firstAired: data.firstAired,
      lastAired: data.lastAired,
      ended: data.ended,
    }) || data.year || '—'} • ${data.episodeFileCount || 0}/${data.episodeCount || 0} eps`
  const statusChip = data.mediaType === 'movies'
    ? (data.hasFile ? 'Downloaded' : 'Missing')
    : (data.episodeCount && data.episodeFileCount === data.episodeCount ? 'Downloaded' : 'Missing')
  const typeChip = data.mediaType === 'movies' ? 'Movie' : 'TV'

  return (
    <article
      className={`rail-card ${isExpanded ? 'rail-card--expanded' : ''}`}
      onClick={handleClick}
      data-expanded={isExpanded}
    >
      <div className="rail-card__poster">
        {poster ? (
          <img src={poster} alt={title} loading="lazy" />
        ) : (
          <div className="rail-card__poster--empty">No poster</div>
        )}
      </div>
      <div className="rail-card__body">
        <h3 className="rail-card__title">{title}</h3>
        <div className="rail-card__meta">{primaryMeta}</div>
        <div className="rail-card__chips">
          <span className="glass-chip">{statusChip}</span>
          <span className="glass-chip">{typeChip}</span>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="rail-card__expanded-content">
            {data.overview && (
              <p className="rail-card__overview rail-card__overview--visible">{data.overview}</p>
            )}
            <div className="rail-card__expanded-meta">
              <span>Size: {formatSize(data.sizeOnDisk || 0)}</span>
              {data.path && <span className="rail-card__path">{data.path}</span>}
            </div>
            <div className="rail-card__expanded-actions">
              <button
                type="button"
                className="rail-card__action-btn"
                onClick={handleViewDetails}
              >
                Manage
              </button>
              <button
                type="button"
                className="rail-card__collapse-btn"
                onClick={handleCollapse}
                aria-label="Collapse"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Collapsed: show overview on focus only */}
        {!isExpanded && data.overview && (
          <p className="rail-card__overview">{data.overview}</p>
        )}
      </div>
    </article>
  )
}
