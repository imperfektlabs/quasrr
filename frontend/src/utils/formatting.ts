/**
 * Formatting and utility functions
 * Helpers for data transformation, formatting, and processing
 */

import type { Release, Rating, DiscoveryResult, SearchType } from '@/types'

/**
 * Normalize ID query input (imdb:tt123, tvdb:456, etc.)
 * @param input - User query input
 * @returns Normalized query and metadata
 */
export function normalizeIdQuery(input: string): { query: string; isIdQuery: boolean; forcedType?: SearchType } {
  const trimmed = input.trim()
  const match = /^(imdb|tmdb|tvdb)\s*[:#]\s*(tt\d+|\d+)$/i.exec(trimmed)
  if (match) {
    const prefix = match[1].toLowerCase()
    const value = match[2]
    return {
      query: `${prefix}:${value}`,
      isIdQuery: true,
      forcedType: prefix === 'tvdb' ? 'tv' : undefined,
    }
  }
  if (/^tt\d+$/i.test(trimmed)) {
    return { query: `imdb:${trimmed}`, isIdQuery: true }
  }
  return { query: input, isIdQuery: false }
}

/**
 * Get a unique key for a release
 * @param release - Release object
 * @returns Unique identifier string
 */
export function getReleaseKey(release: Release): string {
  return release.guid || `${release.title}-${release.indexer}-${release.size}-${release.publish_date || ''}`
}

/**
 * Sort releases by size (smallest first) for AI processing
 * @param list - Array of releases
 * @returns Sorted copy of releases
 */
export function sortReleasesForAi(list: Release[]): Release[] {
  return [...list].sort((a, b) => a.size - b.size)
}

/**
 * Format a timestamp as date or time
 * @param value - Unix timestamp (seconds)
 * @param mode - 'date' for full date/time, 'time' for time only
 * @returns Formatted string
 */
export function formatTimestamp(value: number | null | undefined, mode: 'date' | 'time' = 'date'): string {
  if (!value) return 'Unknown'
  const date = new Date(value * 1000)
  return mode === 'time' ? date.toLocaleTimeString() : date.toLocaleString()
}

/**
 * Format a rating value with optional vote count
 * @param rating - Rating object
 * @returns Formatted rating string (e.g., "8.5 (1,234)")
 */
export function formatRating(rating: Rating): string {
  const value = rating.value.toFixed(1)
  const votes = rating.votes ? ` (${rating.votes.toLocaleString()})` : ''
  return `${value}${votes}`
}

/**
 * Format rating source name for display
 * @param source - Rating source identifier
 * @returns Human-readable source name
 */
export function formatRatingSource(source: string): string {
  const map: Record<string, string> = {
    tmdb: 'TMDB',
    imdb: 'IMDb',
    trakt: 'Trakt',
    metacritic: 'Metacritic',
    rottentomatoes: 'RT',
    rottenTomatoes: 'RT',
    tvdb: 'TVDB',
    justwatch: 'JW',
  }
  return map[source] || source.toUpperCase()
}

/**
 * Get external link for a rating source
 * @param result - Discovery result with IDs
 * @param rating - Rating object with source
 * @returns URL to rating source or null
 */
export function getRatingLink(result: DiscoveryResult, rating: Rating): string | null {
  const source = rating.source.toLowerCase()

  if (source === 'imdb' && result.imdb_id) {
    return `https://www.imdb.com/title/${result.imdb_id}/`
  }
  if (source === 'tmdb' && result.tmdb_id) {
    return result.type === 'movie'
      ? `https://www.themoviedb.org/movie/${result.tmdb_id}`
      : `https://www.themoviedb.org/tv/${result.tmdb_id}`
  }
  if (source === 'justwatch') {
    return `https://www.justwatch.com/ca/search?q=${encodeURIComponent(result.title)}`
  }
  if (source === 'metacritic') {
    const typePath = result.type === 'movie' ? 'movie' : 'tv'
    return `https://www.metacritic.com/search/${typePath}/${encodeURIComponent(result.title)}/results`
  }
  if (source === 'rottentomatoes') {
    return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(result.title)}`
  }
  if (source === 'tvdb') {
    return `https://thetvdb.com/search?query=${encodeURIComponent(result.title)}`
  }

  return null
}

/**
 * Format byte size to human-readable string
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 GB", "500 MB")
 */
export function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function parseYear(value?: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4})/)
  return match ? match[1] : null
}

/**
 * Format a TV series year span (e.g., "2006-2010" or "2020-").
 */
export function formatSeriesYearSpan(params: {
  year?: number
  firstAired?: string
  lastAired?: string
  ended?: boolean
}): string {
  const start = parseYear(params.firstAired) ?? (params.year ? `${params.year}` : null)
  if (!start) return ''
  const ended = params.ended === true
  if (!ended) return `${start}-`
  const end = parseYear(params.lastAired)
  if (!end) return `${start}-${start}`
  return `${start}-${end}`
}
