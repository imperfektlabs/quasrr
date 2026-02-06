import { useEffect, useState } from 'react'

export type ViewMode = 'grid' | 'list'

const STORAGE_KEY = 'quasrr_view_mode'
const MOBILE_BREAKPOINT = 768

/**
 * Custom hook to manage view mode preference (Grid vs List)
 * - Stores preference in localStorage
 * - Defaults to "list" on mobile (<768px) and "grid" on desktop
 * - Handles window resize to update default when no stored preference exists
 */
export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // Check localStorage first
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null
      if (stored === 'grid' || stored === 'list') {
        return stored
      }

      // Default based on screen size
      return window.innerWidth < MOBILE_BREAKPOINT ? 'list' : 'grid'
    }
    return 'grid'
  })

  const [hasStoredPreference, setHasStoredPreference] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'grid' || stored === 'list'
    }
    return false
  })

  // Update default based on window size (only if no stored preference)
  useEffect(() => {
    if (hasStoredPreference || typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT
      const defaultMode = isMobile ? 'list' : 'grid'
      setViewModeState(defaultMode)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [hasStoredPreference])

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode)
    setHasStoredPreference(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode)
    }
  }

  return {
    viewMode,
    setViewMode,
    isGridView: viewMode === 'grid',
    isListView: viewMode === 'list',
  }
}
