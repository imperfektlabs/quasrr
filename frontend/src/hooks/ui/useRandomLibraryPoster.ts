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
      console.log('[useRandomLibraryPoster] Hook disabled, enabled=', enabled)
      return
    }

    console.log('[useRandomLibraryPoster] Hook enabled, fetching posters...')

    const fetchRandomPoster = async () => {
      try {
        const backendUrl = getBackendUrl()
        console.log('[useRandomLibraryPoster] Backend URL:', backendUrl)

        // Fetch both libraries in parallel
        const [sonarrRes, radarrRes] = await Promise.all([
          fetch(`${backendUrl}/sonarr/library`).catch((err) => {
            console.error('[useRandomLibraryPoster] Sonarr fetch error:', err)
            return null
          }),
          fetch(`${backendUrl}/radarr/library`).catch((err) => {
            console.error('[useRandomLibraryPoster] Radarr fetch error:', err)
            return null
          }),
        ])

        console.log('[useRandomLibraryPoster] Sonarr response:', sonarrRes?.ok, sonarrRes?.status)
        console.log('[useRandomLibraryPoster] Radarr response:', radarrRes?.ok, radarrRes?.status)

        const items: LibraryItem[] = []

        // Collect Sonarr library items
        if (sonarrRes?.ok) {
          const sonarrData = await sonarrRes.json()
          if (Array.isArray(sonarrData)) {
            console.log('[useRandomLibraryPoster] Sonarr items:', sonarrData.length)
            items.push(...sonarrData)
          }
        }

        // Collect Radarr library items
        if (radarrRes?.ok) {
          const radarrData = await radarrRes.json()
          if (Array.isArray(radarrData)) {
            console.log('[useRandomLibraryPoster] Radarr items:', radarrData.length)
            items.push(...radarrData)
          }
        }

        console.log('[useRandomLibraryPoster] Total items:', items.length)

        // Filter items with valid posters
        const itemsWithPosters = items.filter((item) =>
          typeof item.poster === 'string' && item.poster.length > 0
        )

        console.log('[useRandomLibraryPoster] Items with posters:', itemsWithPosters.length)

        // Select random poster
        if (itemsWithPosters.length > 0) {
          const randomIndex = Math.floor(Math.random() * itemsWithPosters.length)
          const selectedItem = itemsWithPosters[randomIndex]
          const posterUrl = selectedItem.poster || null
          console.log('[useRandomLibraryPoster] Selected poster URL:', posterUrl)

          // Log to backend for docker console visibility
          try {
            await fetch(`${backendUrl}/log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                level: 'info',
                message: `Random poster selected: ${posterUrl}`,
              }),
            }).catch(() => {
              // Silently fail if logging endpoint doesn't exist yet
            })
          } catch {
            // Ignore logging errors
          }

          setPoster(posterUrl)
          console.log('[useRandomLibraryPoster] Poster state updated')
        } else {
          console.log('[useRandomLibraryPoster] No items with posters found')
        }
      } catch (error) {
        console.error('[useRandomLibraryPoster] Error fetching posters:', error)
        setPoster(null)
      }
    }

    // Small delay to ensure backend is ready
    const timer = setTimeout(fetchRandomPoster, 100)
    return () => clearTimeout(timer)
  }, [enabled])

  return poster
}
