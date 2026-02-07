/**
 * Type definitions for Quasrr frontend
 * Extracted from page.tsx for better organization and reusability
 */

// ============================================
// API & Configuration Types
// ============================================

export type HealthStatus = {
  status: string
} | null

export type ConfigStatus = {
  app: { name: string; log_level: string }
  user: { country: string; language: string }
  ai: {
    provider: string
    model: string
    api_key: string | null
    available_providers?: string[]
    openai_model?: string | null
    grok_model?: string | null
    perplexity_model?: string | null
    gemini_model?: string | null
    openrouter_model?: string | null
    deepseek_model?: string | null
    anthropic_model?: string | null
    local_endpoint_url?: string | null
  }
  streaming_services: { id: string; name: string; enabled: boolean }[]
  integrations: {
    sonarr_url: string | null
    radarr_url: string | null
    sabnzbd_url: string | null
    plex_url?: string | null
    tmdb_api_key?: string | null
  }
  features: {
    show_download_always: boolean
    ai_suggestions: boolean
    auto_quality_filter: boolean
  }
  dashboard: {
    show_sonarr: boolean
    show_radarr: boolean
    show_sabnzbd: boolean
    show_plex: boolean
  }
  layout?: {
    discovery_search_position: 'top' | 'bottom'
    library_search_position: 'top' | 'bottom'
    view_mode?: 'grid' | 'list'
  }
  sabnzbd: {
    recent_group_limit: number
  }
} | null

// ============================================
// Search & Discovery Types
// ============================================

export type SearchType = 'movie' | 'tv'
export type SearchFilterType = 'all' | SearchType
export type SearchStatusFilter = 'all' | 'not_in_library' | 'in_library' | 'partial' | 'downloaded'
export type SearchSortField =
  | 'added'
  | 'imdbRating'
  | 'popularity'
  | 'releaseDate'
  | 'size'
  | 'title'
  | 'relevance'
  | 'year'
  | 'rating'
export type SearchSortDirection = 'asc' | 'desc'

export type Rating = {
  source: string
  value: number
  votes?: number
}

export type StreamingService = {
  id: string
  name: string
  enabled: boolean
}

// Discovery result from Stage 1 search
export type DiscoveryResult = {
  type: SearchType
  title: string
  year?: number
  first_aired?: string
  last_aired?: string
  ended?: boolean
  overview?: string
  poster?: string
  status: 'not_in_library' | 'in_library' | 'partial' | 'downloaded'
  tmdb_id?: number
  imdb_id?: string
  runtime?: number
  genres?: string[]
  radarr_id?: number | null
  tvdb_id?: number
  network?: string
  series_status?: string
  seasons?: number
  sonarr_id?: number | null
  ratings?: Rating[]
  cast?: string[]
  popularity?: number
}

export type SearchResponse = {
  query: string
  type: string
  count: number
  total_count: number
  page: number
  page_size: number
  total_pages: number
  results: DiscoveryResult[]
}

// ============================================
// Release Types
// ============================================

// Release from Stage 2 indexer search
export type Release = {
  title: string
  size: number
  size_formatted: string
  size_gb: number
  quality: string
  resolution?: number
  source?: string
  indexer: string
  indexer_id?: number
  age: string
  publish_date?: string
  protocol: string
  guid?: string
  info_url?: string
  rejected: boolean
  rejections?: string[]
  // TV-specific
  season?: number
  episode?: number[]
  full_season?: boolean
  on_disk?: boolean
}

export type ReleaseResponse = {
  title: string
  year?: number
  type: string
  season?: number
  requested_season?: number
  requested_episode?: number
  requested_episode_title?: string
  poster?: string
  tmdb_id?: number
  tvdb_id?: number
  radarr_id?: number
  sonarr_id?: number
  runtime?: number
  releases: Release[]
  message?: string
  episode_meta?: Record<number, Record<number, {
    title?: string | null
    airDate?: string | null
  }>>
  episode_file?: {
    relativePath?: string | null
    path?: string | null
    sceneName?: string | null
  } | null
  movie_file?: {
    relativePath?: string | null
    path?: string | null
    sceneName?: string | null
  } | null
  episode_downloaded?: EpisodeDownloadMap
  season_progress?: SeasonProgress[]
}

export type SortField = 'size' | 'quality' | 'age' | 'title'
export type SortDirection = 'asc' | 'desc' | null

export type EpisodeDownloadMap = Record<string, Record<string, boolean>>

export type SeasonProgress = {
  season: number
  downloaded: number
  total: number
}

// ============================================
// AI Types
// ============================================

export type AISuggestion = {
  index?: number
  guid?: string | null
  title?: string | null
  reason?: string
  warnings?: string[]
}

export type AIIntent = {
  media_type: 'movie' | 'tv' | 'unknown'
  title: string
  season?: number | null
  episode?: number | null
  episode_date?: string | null
  action?: 'search' | 'download'
  quality?: string | null
  confidence?: number
  notes?: string
}

export type AIAvailability = {
  tmdb_id?: number
  title?: string
  year?: string
  first_aired?: string
  last_aired?: string
  ended?: boolean | null
  overview?: string
  poster_url?: string
  link?: string
  flatrate?: { name: string; logo_url?: string | null }[]
  subscribed?: string[]
  media_type?: 'movie' | 'tv'
}

export type AIIntentPlan = {
  query: string
  intent: AIIntent
  availability?: AIAvailability
  recommendation?: 'watch' | 'search' | 'download'
}

// ============================================
// SABnzbd Types
// ============================================

export type SabQueueItem = {
  id?: string
  name: string
  status: string
  percentage: string
  size_total: string
  size_remaining: string
  speed: string
  eta: string
  category: string
  parsedTitle: string
  mediaType: 'movie' | 'tv' | 'unknown'
  season?: number
  episode?: number
  groupKey: string
}

export type SabQueueResponse = {
  jobs: SabQueueItem[]
  speed: string
  paused?: boolean
  status?: string
}

export type SabRecentItem = {
  name: string
  status: string
  completedTime: number | null
  size: string
  category: string
  parsedTitle: string
  mediaType: 'movie' | 'tv' | 'unknown'
  season?: number
  episode?: number
  groupKey: string
}

export type SabRecentGroup = {
  groupKey: string
  title: string
  mediaType: 'movie' | 'tv' | 'unknown'
  count: number
  totalSize: number
  latestCompletedTime: number | null
  items: SabRecentItem[]
}

export type SabRecentResponse = {
  groups: SabRecentGroup[]
}

// ============================================
// Library Types
// ============================================

export type RadarrLibraryItem = {
  id: number
  title: string
  year?: number
  overview?: string
  path?: string
  hasFile: boolean
  movieFilePath?: string | null
  movieFileRelativePath?: string | null
  movieFileSceneName?: string | null
  monitored: boolean
  sizeOnDisk?: number
  tmdbId?: number
  imdbId?: string
  imdbRating?: number
  ratings?: Rating[]
  popularity?: number
  releaseDate?: string
  added?: string
  poster?: string
}

export type SonarrLibraryItem = {
  id: number
  title: string
  year?: number
  overview?: string
  path?: string
  status?: string
  network?: string
  monitored: boolean
  seasonCount?: number
  episodeCount?: number
  episodeFileCount?: number
  totalEpisodeCount?: number
  sizeOnDisk?: number
  tvdbId?: number
  imdbId?: string
  imdbRating?: number
  ratings?: Rating[]
  popularity?: number
  releaseDate?: string
  firstAired?: string
  lastAired?: string
  ended?: boolean
  added?: string
  poster?: string
  seasons?: Array<{
    seasonNumber?: number
    episodeCount?: number
    episodeFileCount?: number
    totalEpisodeCount?: number
  }>
}

export type SonarrEpisode = {
  id?: number
  episodeFileId?: number
  seasonNumber?: number
  episodeNumber?: number
  title?: string
  airDate?: string
  hasFile?: boolean
  quality?: string | null
  relativePath?: string | null
  filePath?: string | null
  sceneName?: string | null
  size?: number | null
}

// ============================================
// Integration Types
// ============================================

export type IntegrationHealthIssue = {
  level?: string
  message?: string
  source?: string
}

export type IntegrationWarning = {
  level?: string
  message?: string
}

export type IntegrationStatus = {
  status: string
  message?: string
  version?: string
  health?: IntegrationHealthIssue[]
  warnings?: IntegrationWarning[]
}

export type IntegrationsStatus = {
  radarr: IntegrationStatus
  sonarr: IntegrationStatus
  sabnzbd: IntegrationStatus
  plex: IntegrationStatus
}

// ============================================
// Dashboard Types
// ============================================

export type DashboardSummary = {
  sonarr: {
    configured: boolean
    series_count: number
    episode_count: number
    size_on_disk: number
  }
  radarr: {
    configured: boolean
    movie_files_count: number
    movies_count: number
    size_on_disk: number
  }
  sabnzbd: {
    configured: boolean
    download_today: number
    download_month: number
  }
  plex: {
    configured: boolean
    recently_added: number
    active_streams: number
  }
}

// ============================================
// Component Props Types
// ============================================

export type IconProps = {
  className?: string
}
