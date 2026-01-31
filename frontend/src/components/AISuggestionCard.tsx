'use client'

import type { AIIntentPlan } from '@/types'
import { formatSeriesYearSpan } from '@/utils/formatting'

type AISuggestionCardProps = {
  plan?: AIIntentPlan | null
  busy?: boolean
  error?: string | null
  onAccept?: () => void
  onContinue?: () => void
  onDismiss?: () => void
}

export function AISuggestionCard({
  plan,
  busy = false,
  error = null,
  onAccept,
  onContinue,
  onDismiss,
}: AISuggestionCardProps) {
  const intent = plan?.intent
  const availability = plan?.availability

  // Build display title
  const displayTitle = availability?.title || intent?.title || plan?.query || ''
  const poster = availability?.poster_url

  // Build year label
  const yearLabel = intent?.media_type === 'tv'
    ? formatSeriesYearSpan({
        year: availability?.year ? Number.parseInt(availability.year, 10) : undefined,
        firstAired: availability?.first_aired,
        lastAired: availability?.last_aired,
        ended: availability?.ended ?? undefined,
      }) || availability?.year
    : availability?.year

  // Build episode info if present
  let episodeInfo = ''
  if (intent?.season) {
    episodeInfo = `S${String(intent.season).padStart(2, '0')}`
    if (intent?.episode) {
      episodeInfo += `E${String(intent.episode).padStart(2, '0')}`
    }
  }

  if (busy) {
    return (
      <article className="rail-card rail-card--ai-suggestion">
        <div className="rail-card__ai-eyebrow">AI</div>
        <div className="rail-card__ai-status">Interpreting...</div>
      </article>
    )
  }

  if (error) {
    return (
      <article className="rail-card rail-card--ai-suggestion rail-card--ai-error">
        <div className="rail-card__ai-eyebrow">AI</div>
        <div className="rail-card__ai-status">Could not interpret</div>
        <button
          type="button"
          onClick={onDismiss}
          className="rail-card__ai-dismiss"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </article>
    )
  }

  if (!plan || !intent) {
    return null
  }

  return (
    <article className="rail-card rail-card--ai-suggestion">
      <div className="rail-card__ai-eyebrow">AI thinks you meant</div>

      {poster && (
        <div className="rail-card__poster rail-card__poster--small">
          <img src={poster} alt={displayTitle} loading="lazy" />
        </div>
      )}

      <div className="rail-card__ai-title">{displayTitle}</div>

      <div className="rail-card__ai-meta">
        {yearLabel && <span>{yearLabel}</span>}
        {episodeInfo && <span className="rail-card__ai-episode">{episodeInfo}</span>}
        {intent.media_type && intent.media_type !== 'unknown' && (
          <span className="rail-card__ai-type">{intent.media_type === 'tv' ? 'TV' : 'Movie'}</span>
        )}
      </div>

      <div className="rail-card__ai-prompt">Are we right?</div>

      <div className="rail-card__ai-actions">
        <button
          type="button"
          onClick={onAccept}
          className="rail-card__ai-accept"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rail-card__ai-continue"
        >
          Search original
        </button>
      </div>
    </article>
  )
}
