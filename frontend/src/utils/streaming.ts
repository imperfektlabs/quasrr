/**
 * Streaming service utilities
 * Constants and helpers for streaming service logos and links
 */

/**
 * Mapping of streaming service IDs to their logo paths
 */
export const STREAMING_LOGOS: Record<string, string> = {
  netflix: '/logos/streaming/netflix.avif',
  crave: '/logos/streaming/crave.avif',
  disney_plus: '/logos/streaming/disney_plus.avif',
  amazon_prime: '/logos/streaming/amazon_prime.avif',
  apple_tv: '/logos/streaming/apple_tv.avif',
  paramount_plus: '/logos/streaming/paramount_plus.avif',
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
 * Get the website URL for a streaming service
 * @param id - Streaming service ID
 * @returns Website URL or undefined if not found
 */
export function getStreamingLink(id: string): string | undefined {
  return STREAMING_LINKS[id]
}
