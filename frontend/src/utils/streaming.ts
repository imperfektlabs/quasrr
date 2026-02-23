/**
 * Streaming service utilities
 * Constants and helpers for streaming service logos and links
 */

/**
 * Mapping of streaming service IDs to their logo paths
 */
export const STREAMING_LOGOS: Record<string, string> = {
  netflix: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/netflix.svg',
  crave: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Crave_2018_logo.svg',
  disney_plus: 'https://cdn.brandfetch.io/idhQlYRiX2/theme/light/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1769147818509',
  amazon_prime: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/amazon-prime.svg',
  apple_tv: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/apple-tv-plus-light.svg',
  paramount_plus: 'https://cdn.brandfetch.io/idU9biO3N_/theme/light/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1758268970538',
  amazon_video: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/amazon-light.svg',
  amcplus: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/AMC%2B_logo.png',
  amc_plus: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/AMC%2B_logo.png',
  apple: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/apple-light.svg',
  britbox: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Britbox_2022_%28UK%29.svg',
  apple_tv_store: 'https://www.pngfind.com/pngs/m/362-3629314_apple-tv-apple-hd-png-download.png',
  fubo: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg',
  fubotv: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Fubo_2023.svg',
  global_tv: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/Global_Television_Network_Logo.svg',
  hoopla: 'https://www.hoopladigital.com/_next/static/media/Hoopla_white.71dcc678.png',
  hayu: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Hayu_Logo_Coral_svg.svg',
  hulu: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/hulu.svg',
  plex: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Plex_logo_2022_full-color-on-black.svg',
  pluto_tv: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Pluto_TV_logo_2024.svg',
  tubi: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Tubi_logo_2024.svg',
  tubi_tv: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Tubi_logo_2024.svg',
  google_play_movies: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/google-play.svg',
  citytvplus: 'https://m.media-amazon.com/images/S/vcaws-image-intake-bucket-prod/11de3ad13ededfdfbe34317eae6fcb89._BR-6_AC_SX1000_FMpng_.png',
  youtube: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/youtube-tv.svg',
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
  appletvplus: 'apple_tv',
  appletv: 'apple_tv',
  paramountplus: 'paramount_plus',
  amcplus: 'amcplus',
  amc: 'amcplus',
  fubo: 'fubo',
  fubotv: 'fubo',
  tubi: 'tubi',
  tubitv: 'tubi',
  pluto: 'pluto_tv',
  plutotv: 'pluto_tv',
  hulu: 'hulu',
  hayu: 'hayu',
  hoopla: 'hoopla',
  britbox: 'britbox',
  plex: 'plex',
  globaltv: 'global_tv',
  citytvplus: 'citytvplus',
  apple: 'apple',
  appleoriginals: 'apple',
  amazonvideo: 'amazon_video',
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
