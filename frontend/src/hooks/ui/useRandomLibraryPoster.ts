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
    if (!enabled) return

    const fetchRandomPoster = async () => {
      try {
        const backendUrl = getBackendUrl()

        // Fetch both libraries in parallel
        const [sonarrRes, radarrRes] = await Promise.all([
          fetch(`${backendUrl}/sonarr/library`).catch(() => null),
          fetch(`${backendUrl}/radarr/library`).catch(() => null),
        ])

        const items: LibraryItem[] = []

        // Collect Sonarr library items
        if (sonarrRes?.ok) {
          const sonarrData = await sonarrRes.json()
          if (Array.isArray(sonarrData)) {
            items.push(...sonarrData)
          }
        }

        // Collect Radarr library items
        if (radarrRes?.ok) {
          const radarrData = await radarrRes.json()
          if (Array.isArray(radarrData)) {
            items.push(...radarrData)
          }
        }

        // Filter items with valid posters
        const itemsWithPosters = items.filter((item) =>
          typeof item.poster === 'string' && item.poster.length > 0
        )

        // Select random poster
        if (itemsWithPosters.length > 0) {
          const randomIndex = Math.floor(Math.random() * itemsWithPosters.length)
          const selectedItem = itemsWithPosters[randomIndex]
          setPoster(selectedItem.poster || null)
        }
      } catch (error) {
        console.error('Failed to fetch random library poster:', error)
        setPoster(null)
      }
    }

    fetchRandomPoster()
  }, [enabled])

  return poster
}
