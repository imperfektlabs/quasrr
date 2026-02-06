/**
 * Random library poster hook
 * Fetches a random poster from library items for background decoration
 */

import { useEffect, useState } from 'react'
import { getBackendUrl } from '@/utils/backend'

type LibraryItem = {
  poster?: string | null
}

/**
 * Fetch and return a random poster from the user's library
 * @param enabled - Whether to fetch posters
 * @returns poster URL or null
 */
export function useRandomLibraryPoster(enabled: boolean): string | null {
  const [poster, setPoster] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      console.log('[useRandomLibraryPoster] Not enabled')
      return
    }

    console.log('[useRandomLibraryPoster] Fetching library posters...')

    const fetchRandomPoster = async () => {
      try {
        const backendUrl = getBackendUrl()
        console.log('[useRandomLibraryPoster] Backend URL:', backendUrl)

        // Fetch both libraries in parallel
        const [sonarrRes, radarrRes] = await Promise.all([
          fetch(`${backendUrl}/sonarr/library`).catch(() => null),
          fetch(`${backendUrl}/radarr/library`).catch(() => null),
        ])

        const items: LibraryItem[] = []

        // Collect Sonarr library items
        if (sonarrRes?.ok) {
          const sonarrData = await sonarrRes.json()
          console.log('[useRandomLibraryPoster] Sonarr items:', sonarrData?.length || 0)
          if (Array.isArray(sonarrData)) {
            items.push(...sonarrData)
          }
        } else {
          console.log('[useRandomLibraryPoster] Sonarr fetch failed')
        }

        // Collect Radarr library items
        if (radarrRes?.ok) {
          const radarrData = await radarrRes.json()
          console.log('[useRandomLibraryPoster] Radarr items:', radarrData?.length || 0)
          if (Array.isArray(radarrData)) {
            items.push(...radarrData)
          }
        } else {
          console.log('[useRandomLibraryPoster] Radarr fetch failed')
        }

        console.log('[useRandomLibraryPoster] Total library items:', items.length)

        // Filter items with valid posters
        const itemsWithPosters = items.filter((item) =>
          typeof item.poster === 'string' && item.poster.length > 0
        )

        console.log('[useRandomLibraryPoster] Items with posters:', itemsWithPosters.length)

        // Select random poster
        if (itemsWithPosters.length > 0) {
          const randomIndex = Math.floor(Math.random() * itemsWithPosters.length)
          const selectedItem = itemsWithPosters[randomIndex]
          console.log('[useRandomLibraryPoster] Selected poster:', selectedItem.poster)
          setPoster(selectedItem.poster || null)
        } else {
          console.log('[useRandomLibraryPoster] No posters found')
        }
      } catch (error) {
        console.error('[useRandomLibraryPoster] Failed to fetch:', error)
        setPoster(null)
      }
    }

    fetchRandomPoster()
  }, [enabled])

  return poster
}
