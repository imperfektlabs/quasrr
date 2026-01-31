/**
 * Streaming service utilities
 * Constants and helpers for streaming service logos and links
 */

/**
 * Mapping of streaming service IDs to their logo paths
 */
export const STREAMING_LOGOS: Record<string, string> = {
  netflix: '/logos/streaming/netflix.svg',
  crave: '/logos/streaming/crave.svg',
  disney_plus: '/logos/streaming/disney_plus.svg',
  amazon_prime: '/logos/streaming/amazon_prime.svg',
  apple_tv: '/logos/streaming/apple_tv.svg',
  paramount_plus: '/logos/streaming/paramount_plus.svg',
  cbc_gem: '/logos/streaming/cbc_gem.svg',
  ctv: '/logos/streaming/ctv.svg',
  global_tv: '/logos/streaming/global_tv.svg',
  citytvplus: '/logos/streaming/citytvplus.svg',
  google_play_movies: '/logos/streaming/google_play_store.svg',
  apple_tv_store: '/logos/streaming/apple_store.svg',
  youtube: '/logos/streaming/youtube.svg',
}

/**
 * Mapping of streaming service IDs to their website URLs
 */
export const STREAMING_LINKS: Record<string, string> = {
  netflix: 'https://www.netflix.com',
  crave: 'https://www.crave.ca',
  disney_plus: 'https://www.disneyplus.com',
  amazon_prime: 'https://www.primevideo.com',
  apple_tv: 'https://tv.apple.com',
  paramount_plus: 'https://www.paramountplus.com',
  google_play_movies: 'https://play.google.com/store/movies',
  apple_tv_store: 'https://tv.apple.com/store',
  youtube: 'https://www.youtube.com',
}

const STREAMING_NAME_MAP: Record<string, string> = {
  netflix: 'netflix',
  crave: 'crave',
  disneyplus: 'disney_plus',
  amazonprimevideo: 'amazon_prime',
  primevideo: 'amazon_prime',
  amazonvideo: 'amazon_prime',
  appletvplus: 'apple_tv',
  appletv: 'apple_tv',
  paramountplus: 'paramount_plus',
  cbcgem: 'cbc_gem',
  citytvplus: 'citytvplus',
  googletv: 'google_play_movies',
  googleplaymovies: 'google_play_movies',
  youtube: 'youtube',
}

/**
 * Get the logo path for a streaming service
 * @param id - Streaming service ID
 * @returns Logo path or undefined if not found
 */
export function getStreamingLogo(id: string): string | undefined {
  return STREAMING_LOGOS[id]
}

/**
 * Get the logo path for a streaming provider name
 * @param name - Provider name from availability data
 * @returns Logo path or undefined if not found
 */
export function getStreamingLogoForProvider(name: string): string | undefined {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const id = STREAMING_NAME_MAP[normalized]
  return id ? getStreamingLogo(id) : undefined
}

/**
 * Get the website URL for a streaming service
 * @param id - Streaming service ID
 * @returns Website URL or undefined if not found
 */
export function getStreamingLink(id: string): string | undefined {
  return STREAMING_LINKS[id]
}
