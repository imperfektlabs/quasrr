'use client'

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
    }
  | {
      item: { source: 'library'; data: LibraryItem }
      onClick?: () => void
    }

export function MediaRailCard(props: MediaRailCardProps) {
  const { item, onClick } = props
  const isDiscovery = item.source === 'discovery'
  const data = item.data

  const poster = data.poster
  const title = data.title

  const primaryMeta = isDiscovery
    ? data.type === 'movie'
      ? `${data.year || '—'}${data.runtime ? ` • ${data.runtime} min` : ''}`
      : `${formatSeriesYearSpan({
        year: data.year,
        firstAired: data.first_aired,
        lastAired: data.last_aired,
        ended: data.ended,
      }) || data.year || '—'}${data.seasons ? ` • ${data.seasons} season${data.seasons !== 1 ? 's' : ''}` : ''}`
    : data.mediaType === 'movies'
      ? `${data.year || '—'} • ${formatSize(data.sizeOnDisk || 0)}`
      : `${formatSeriesYearSpan({
        year: data.year,
        firstAired: data.firstAired,
        lastAired: data.lastAired,
        ended: data.ended,
      }) || data.year || '—'} • ${data.episodeFileCount || 0}/${data.episodeCount || 0} eps`

  const statusChip = isDiscovery
    ? data.status === 'downloaded'
      ? 'Downloaded'
      : data.status === 'in_library'
        ? 'In Library'
        : 'Missing'
    : data.mediaType === 'movies'
      ? (data.hasFile ? 'Downloaded' : 'Missing')
      : (data.episodeCount && data.episodeFileCount === data.episodeCount ? 'Downloaded' : 'Missing')

  const typeChip = isDiscovery
    ? (data.type === 'movie' ? 'Movie' : 'TV')
    : (data.mediaType === 'movies' ? 'Movie' : 'TV')

  return (
    <article className="rail-card" onClick={onClick}>
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
        {'overview' in data && data.overview && (
          <p className="rail-card__overview">{data.overview}</p>
        )}
        {'onShowReleases' in props && props.onShowReleases && isDiscovery && (
          <div className="rail-card__actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
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
