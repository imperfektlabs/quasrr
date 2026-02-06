/**
 * Custom hooks barrel export
 * Centralized export for all custom hooks
 */

// API hooks
export { useBackendApiSetup } from './api/useBackendApiSetup'
export type { BackendApiSetupResult } from './api/useBackendApiSetup'

export { useSettings } from './api/useSettings'
export type { SettingsResult } from './api/useSettings'

export { useDiscoverySearch } from './api/useDiscoverySearch'
export type { DiscoverySearchResult } from './api/useDiscoverySearch'

export { useAiIntentSearch } from './api/useAiIntentSearch'
export type { AiIntentSearchResult } from './api/useAiIntentSearch'

// SABnzbd hooks
export { useSabPolling } from './sab/useSabPolling'
export type { SabPollingResult } from './sab/useSabPolling'

export { useSabActions } from './sab/useSabActions'
export type { SabActionsResult } from './sab/useSabActions'

// Release hooks
export { useReleaseData } from './releases/useReleaseData'
export type { ReleaseDataResult } from './releases/useReleaseData'

export { useReleaseGrab } from './releases/useReleaseGrab'
export type { ReleaseGrabResult, GrabFeedback } from './releases/useReleaseGrab'

export { useAiSuggest } from './releases/useAiSuggest'
export type { AiSuggestResult } from './releases/useAiSuggest'

// UI hooks
export { useClickOutside } from './ui/useClickOutside'
