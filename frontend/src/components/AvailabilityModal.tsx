'use client'

import { useEffect, useState } from 'react'
import type { AIIntentPlan, AIAvailability, DiscoveryResult, ReleaseResponse } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { getRatingLink } from '@/utils/formatting'
import { StatusBadge } from './StatusBadge'
import { RatingBadge } from './RatingBadge'

export function AvailabilityModal({
  mode,
  plan,
  result,
  releaseData,
  busy = false,
  error = null,
  onConfirm,
  onSearch,
  onClose,
  onShowReleases,
}: {
  mode: 'ai' | 'info'
  plan?: AIIntentPlan
  result?: DiscoveryResult
  releaseData?: ReleaseResponse | null
  busy?: boolean
  error?: string | null
  onConfirm?: (plan: AIIntentPlan) => void
  onSearch?: (query: string) => void
  onClose: () => void
  onShowReleases?: (result: DiscoveryResult, season?: number) => void
}) {
  const isAi = mode === 'ai'
  const intent = plan?.intent
  const [manualQuery, setManualQuery] = useState(plan?.query || '')
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all')
  const [availability, setAvailability] = useState<AIAvailability | null>(plan?.availability || null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (isAi) {
      setAvailability(plan?.availability || null)
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      setManualQuery(plan?.query || '')
      return
    }

    if (!result) return
    let active = true

    const fetchAvailability = async () => {
      setAvailability(null)
      setAvailabilityError(null)
      setAvailabilityLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const params = new URLSearchParams({
          query: result.title,
          type: result.type,
        })
        const response = await fetch(`${backendUrl}/availability?${params}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || `HTTP ${response.status}`)
        }
        const data = await response.json()
        if (active) {
          setAvailability(data.availability || null)
        }
      } catch (err) {
        if (active) {
          setAvailabilityError(err instanceof Error ? err.message : 'Failed to fetch availability')
        }
      } finally {
        if (active) {
          setAvailabilityLoading(false)
        }
      }
    }

    fetchAvailability()
    return () => {
      active = false
    }
  }, [isAi, plan?.availability, plan?.query, result])

  const actionLabel = 'Search anyway'

  const renderStreamingOptions = () => (
    <>
      {availabilityLoading && (
        <div className="text-xs text-gray-400">Loading streaming options...</div>
      )}
      {availability?.flatrate && availability.flatrate.length > 0 && (
        <div>
          <div className="text-gray-400 text-xs mb-2">Streaming options</div>
          <div className="flex flex-wrap gap-2">
            {availability.flatrate.map((provider) => {
              const isSubscribed = availability.subscribed?.includes(provider.name)
              return (
                <div
                  key={provider.name}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-xs border ${
                    isSubscribed
                      ? 'border-cyan-400/70 bg-cyan-900/20 text-cyan-200'
                      : 'border-slate-700/60 bg-slate-800/60 text-slate-200'
                  }`}
                >
                  {provider.logo_url ? (
                    <img
                      src={provider.logo_url}
                      alt={provider.name}
                      className="h-5 w-5 object-contain"
                    />
                  ) : (
                    <span className="text-gray-500">?</span>
                  )}
                  <span>{provider.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {availability?.link && (
        <a
          href={availability.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-xs text-cyan-300 hover:text-cyan-200"
        >
          View streaming options
        </a>
      )}
      {availabilityError && (
        <div className="text-xs text-red-400">Streaming: {availabilityError}</div>
      )}
    </>
  )

  if (isAi && !plan) return null
  if (!isAi && !result) return null

  return (
    <div className="fixed inset-0 glass-modal z-50 overflow-auto" onClick={onClose}>
      <div className="min-h-screen p-4">
        <div
          className={`mx-auto glass-panel rounded-lg p-4 md:p-6 ${
            isAi ? 'max-w-2xl' : 'max-w-3xl'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold">
                {isAi ? 'Plan & Availability' : result?.title}
              </h2>
              {isAi ? (
                <p className="text-gray-400 text-sm">"{plan?.query}"</p>
              ) : (
                <p className="text-gray-400 text-sm">
                  {result?.type === 'movie' ? 'Movie' : 'TV Series'}
                  {result?.year ? ` • ${result.year}` : ''}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl px-2">
              X
            </button>
          </div>

          {isAi ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[120px,1fr] text-sm">
              <div>
                {availability?.poster_url ? (
                  <div className="w-full rounded-lg bg-slate-800/60 overflow-hidden">
                    <img
                      src={availability.poster_url}
                      alt={availability.title || intent?.title}
                      className="w-full h-auto object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full rounded-lg bg-slate-800/60 flex items-center justify-center text-xs text-gray-500 p-6">
                    No poster
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="text-slate-200 text-lg font-semibold">
                  {availability?.title || intent?.title || plan?.query || 'Unknown'}
                </div>
                <div className="text-gray-400 text-xs">
                  {availability?.year || 'Unknown year'} {intent?.media_type && intent.media_type !== 'unknown' && `• ${intent.media_type}`}
                </div>
                {availability?.overview && (
                  <div
                    className="text-gray-300 text-xs leading-relaxed"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {availability.overview}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  {(releaseData?.requested_season || intent?.season) && (
                    <span className="glass-chip px-2 py-1 rounded">
                      S{(releaseData?.requested_season || intent?.season)?.toString().padStart(2, '0')}
                      {(releaseData?.requested_episode || intent?.episode) &&
                        `E${(releaseData?.requested_episode || intent?.episode)?.toString().padStart(2, '0')}`}
                    </span>
                  )}
                  {intent?.episode_date && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.episode_date}</span>
                  )}
                  {intent?.quality && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.quality}</span>
                  )}
                  {intent?.action && (
                    <span className="glass-chip px-2 py-1 rounded">{intent.action}</span>
                  )}
                </div>
                {intent?.notes && (
                  <div
                    className="text-gray-300"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {intent.notes}
                  </div>
                )}
                {renderStreamingOptions()}
                {plan?.recommendation === 'watch' && (
                  <div className="text-amber-300 text-xs">
                    Recommendation: stream instead of downloading.
                  </div>
                )}
                {error && (
                  <div className="text-red-400 text-xs">AI: {error}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid md:grid-cols-[160px,1fr] gap-4">
              <div className="w-full">
                {result?.poster ? (
                  <img
                    src={result.poster}
                    alt={result.title}
                    className="w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-full h-56 rounded-lg bg-slate-800/60 flex items-center justify-center text-gray-500 text-xs">
                    No poster
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {result && <StatusBadge status={result.status} />}
                  {result?.runtime && result.type === 'movie' && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.runtime} min
                    </span>
                  )}
                  {result?.type === 'tv' && result.seasons && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.seasons} season{result.seasons !== 1 ? 's' : ''}
                    </span>
                  )}
                  {result?.series_status && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.series_status}
                    </span>
                  )}
                  {result?.network && (
                    <span className="glass-chip text-xs px-2 py-1 rounded">
                      {result.network}
                    </span>
                  )}
                </div>

                {result?.genres && result.genres.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.genres.slice(0, 5).map((genre) => (
                      <span key={genre} className="glass-chip text-xs px-2 py-1 rounded">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {result?.ratings && result.ratings.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.ratings
                      .filter((rating) => rating.source.toLowerCase() !== 'trakt')
                      .map((rating) => (
                        <RatingBadge
                          key={rating.source}
                          rating={rating}
                          href={getRatingLink(result, rating)}
                        />
                      ))}
                  </div>
                )}

                {result?.overview && (
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {result.overview}
                  </p>
                )}

                {renderStreamingOptions()}

                {result?.type === 'tv' && result.seasons && result.seasons > 0 && (
                  <div>
                    <label className="text-xs text-gray-400">Season</label>
                    <select
                      value={selectedSeason}
                      onChange={(event) => {
                        const value = event.target.value
                        setSelectedSeason(value === 'all' ? 'all' : Number(value))
                      }}
                      className="mt-1 w-full bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                    >
                      <option value="all">All seasons</option>
                      {Array.from({ length: result.seasons }, (_, index) => index + 1).map((season) => (
                        <option key={season} value={season}>
                          Season {season}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!result || !onShowReleases) return
                      if (result.type === 'tv' && selectedSeason !== 'all') {
                        onShowReleases(result, selectedSeason)
                      } else {
                        onShowReleases(result)
                      }
                      onClose()
                    }}
                    className="bg-cyan-500/80 hover:bg-cyan-400 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
                  >
                    Find Releases
                  </button>
                </div>
              </div>
            </div>
          )}

          {isAi && (
            <>
              <div className="mt-4">
                <label className="text-xs text-gray-400">Search a different title</label>
                <div className="mt-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
                    placeholder="Type what you actually want"
                    className="flex-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => onSearch?.(manualQuery)}
                    disabled={busy || !manualQuery.trim()}
                    className="bg-slate-700/60 hover:bg-slate-600/70 disabled:bg-slate-700/40 disabled:cursor-not-allowed text-white py-2 px-3 rounded text-sm"
                  >
                    Search this
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => plan && onConfirm?.(plan)}
                  disabled={busy}
                  className="bg-cyan-500/80 hover:bg-cyan-400 disabled:bg-slate-700/60 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium"
                >
                  {busy ? 'Working...' : actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => plan && onSearch?.(plan.query)}
                  disabled={busy}
                  className="bg-slate-800/70 hover:bg-slate-700/70 text-white py-2 px-4 rounded text-sm"
                >
                  Search original query
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-slate-700/60 hover:bg-slate-600/70 text-white py-2 px-4 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
