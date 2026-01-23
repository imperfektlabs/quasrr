/**
 * useClickOutside hook
 * Detects clicks outside of specified elements and triggers a callback
 */

import { useEffect, RefObject } from 'react'

/**
 * Hook that triggers a callback when clicking outside of specified elements
 * @param refs - Array of refs to elements that should NOT trigger the callback
 * @param callback - Function to call when clicking outside
 * @param enabled - Whether the hook is active (default: true)
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  callback: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node

      // Check if click is inside any of the provided refs
      for (const ref of refs) {
        if (ref.current?.contains(target)) {
          return
        }
      }

      // Click was outside all refs, trigger callback
      callback()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [refs, callback, enabled])
}
