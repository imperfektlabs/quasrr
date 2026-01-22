/**
 * Backend API utilities
 * Helper functions for constructing URLs and interacting with backend services
 */

/**
 * Get the backend API base URL
 * Uses the current hostname with port 8000
 */
export function getBackendUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.protocol}//${window.location.hostname}:8000`
}

/**
 * Get URL for local tools (Sonarr, Radarr, SABnzbd, etc.)
 * @param port - Port number of the tool
 * @param path - Optional path to append
 */
export function getLocalToolUrl(port: number, path = ''): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.protocol}//${window.location.hostname}:${port}${path}`
}
