'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ConfigStatus, StreamingService } from '@/types'
import { getBackendUrl } from '@/utils/backend'
import { getStreamingLogo, getStreamingLink } from '@/utils/streaming'
import { SearchIcon } from './Icons'
import { useAuth } from '@/contexts/AuthContext'

type MenuConfig = (ConfigStatus | {
  streaming_services?: StreamingService[]
  ai?: {
    provider?: string
    providers?: Array<{
      id: string
      label: string
      available: boolean
      selected: boolean
      model?: string | null
      base_url?: string | null
    }>
  }
  dashboard?: {
    show_sonarr?: boolean
    show_radarr?: boolean
    show_sabnzbd?: boolean
    show_plex?: boolean
  }
  layout?: {
    discovery_search_position?: 'top' | 'bottom'
    library_search_position?: 'top' | 'bottom'
    view_mode?: 'grid' | 'list'
  }
  sabnzbd?: {
    recent_group_limit?: number
  }
}) | null

type QuickConfig = {
  aiProvider: string
  aiProviders: Array<{ id: string; label: string; available: boolean }>
  dashboard: {
    show_sonarr: boolean
    show_radarr: boolean
    show_sabnzbd: boolean
    show_plex: boolean
  }
  layout: {
    discovery_search_position: 'top' | 'bottom'
    library_search_position: 'top' | 'bottom'
    view_mode: 'grid' | 'list'
  }
  sabRecentLimit: number
  streamingServices: StreamingService[]
}

const aiProviderIcons: Record<string, string> = {
  openai: '/logos/ai/openai.svg',
  grok: '/logos/ai/grok.png',
  perplexity: '/logos/ai/perplexity.svg',
  anthropic: '/logos/ai/anthropic.svg',
  openrouter: '/logos/ai/openrouter.svg',
  gemini: '/logos/ai/gemini.svg',
  deepseek: '/logos/ai/deepseek.svg',
  local: '/logos/ai/local.svg',
}

const dashboardCards = [
  { id: 'show_sonarr', label: 'Sonarr', icon: '/logos/tools/sonarr.svg' },
  { id: 'show_radarr', label: 'Radarr', icon: '/logos/tools/radarr.svg' },
  { id: 'show_sabnzbd', label: 'SABnzbd', icon: '/logos/tools/sabnzbd.svg' },
  { id: 'show_plex', label: 'Plex', icon: '/logos/tools/plex.svg' },
] as const

function mapQuickConfig(config: MenuConfig): QuickConfig | null {
  if (!config) return null

  return {
    aiProvider: config.ai?.provider ?? '',
    aiProviders: [...(config.ai?.providers ?? [])]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((p) => ({ id: p.id, label: p.label, available: p.available })),
    dashboard: {
      show_sonarr: config.dashboard?.show_sonarr ?? true,
      show_radarr: config.dashboard?.show_radarr ?? true,
      show_sabnzbd: config.dashboard?.show_sabnzbd ?? true,
      show_plex: config.dashboard?.show_plex ?? false,
    },
    layout: {
      discovery_search_position: config.layout?.discovery_search_position ?? 'top',
      library_search_position: config.layout?.library_search_position ?? 'top',
      view_mode: config.layout?.view_mode ?? 'grid',
    },
    sabRecentLimit: config.sabnzbd?.recent_group_limit ?? 10,
    streamingServices: [...(config.streaming_services ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export type NavigationMenuProps = {
  menuOpen: boolean
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  menuButtonRef: React.RefObject<HTMLButtonElement>
  menuPanelRef: React.RefObject<HTMLDivElement>
  currentPage: 'home' | 'library' | 'downloads' | 'status' | 'settings'
  config?: MenuConfig
  onHomeClick?: () => void
}

type MobileView =
  | 'root'
  | 'settings-sections'
  | 'settings-ai-provider'
  | 'settings-dashboard-cards'
  | 'settings-streaming-services'
  | 'settings-discovery-search'
  | 'settings-library-search'
  | 'settings-view-mode'
  | 'settings-sab-limit'
  | 'streaming-links'

type SettingsSectionId =
  | 'ai-provider'
  | 'dashboard-cards'
  | 'streaming-services'
  | 'discovery-search'
  | 'library-search'
  | 'view-mode'
  | 'sab-limit'

function renderSectionIcon(sectionId: SettingsSectionId) {
  switch (sectionId) {
    case 'ai-provider':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M4.2 7l2.2 1.2M17.6 15.8L19.8 17M2 12h3M19 12h3M4.2 17l2.2-1.2M17.6 8.2L19.8 7" />
        </svg>
      )
    case 'dashboard-cards':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="4" rx="1.5" />
          <rect x="14" y="10" width="7" height="11" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'streaming-services':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M8 20h8M12 16v4" />
          <path d="M10 9l5 2.5-5 2.5V9z" />
        </svg>
      )
    case 'discovery-search':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.2-4.2" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      )
    case 'library-search':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <circle cx="16.5" cy="8.5" r="2.5" />
        </svg>
      )
    case 'view-mode':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="7" height="7" rx="1.2" />
          <rect x="14" y="4" width="7" height="7" rx="1.2" />
          <path d="M3 16h18M3 20h18" />
        </svg>
      )
    case 'sab-limit':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v6" />
          <path d="M9 6l3-3 3 3" />
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 15h8M8 18h5" />
        </svg>
      )
    default:
      return null
  }
}

export function NavigationMenu({
  menuOpen,
  setMenuOpen,
  menuButtonRef,
  menuPanelRef,
  currentPage,
  config,
  onHomeClick,
}: NavigationMenuProps) {
  const router = useRouter()
  const { logout } = useAuth()

  const [activeSettings, setActiveSettings] = useState(false)
  const [activeStreaming, setActiveStreaming] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('root')
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(null)
  const [quickConfig, setQuickConfig] = useState<QuickConfig | null>(mapQuickConfig(config ?? null))
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)

  useEffect(() => {
    setQuickConfig(mapQuickConfig(config ?? null))
  }, [config])

  useEffect(() => {
    if (!menuOpen) {
      setActiveSettings(false)
      setActiveStreaming(false)
      setMobileView('root')
      setActiveSection(null)
      setQuickError(null)
    }
  }, [menuOpen])

  const enabledStreamingServices = config?.streaming_services?.filter((service) => service.enabled) || []

  const handleHomeClick = () => {
    if (onHomeClick) onHomeClick()
    else router.push('/')
    setMobileView('root')
    setMenuOpen(false)
  }

  const handleNavigate = (path: '/' | '/downloads' | '/status' | '/settings') => {
    router.push(path)
    setMobileView('root')
    setMenuOpen(false)
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
    setMobileView('root')
    setMenuOpen(false)
  }

  const ensureQuickConfig = useCallback(async () => {
    if (quickConfig?.aiProviders.length || quickConfig?.streamingServices.length) return

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config`)
      if (!res.ok) throw new Error('Unable to load settings options')
      const data = (await res.json()) as MenuConfig
      setQuickConfig(mapQuickConfig(data))
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Unable to load settings options')
    }
  }, [quickConfig])

  const patchSettings = useCallback(async (payload: Record<string, unknown>) => {
    setQuickBusy(true)
    setQuickError(null)
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { detail?: string }).detail || 'Failed to update setting')
      }
      setMenuOpen(false)
      window.location.reload()
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Failed to update setting')
    } finally {
      setQuickBusy(false)
    }
  }, [setMenuOpen])

  const patchStreaming = useCallback(async (enabledIds: string[]) => {
    setQuickBusy(true)
    setQuickError(null)
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/config/streaming_services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_ids: enabledIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { detail?: string }).detail || 'Failed to update streaming services')
      }
      setMenuOpen(false)
      window.location.reload()
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Failed to update streaming services')
    } finally {
      setQuickBusy(false)
    }
  }, [setMenuOpen])

  const sectionItems = useMemo(() => ([
    { id: 'ai-provider' as const, label: 'AI Provider' },
    { id: 'dashboard-cards' as const, label: 'Dashboard Cards' },
    { id: 'streaming-services' as const, label: 'Streaming Services' },
    { id: 'discovery-search' as const, label: 'Discovery Search' },
    { id: 'library-search' as const, label: 'Library Search' },
    { id: 'view-mode' as const, label: 'View Mode' },
    { id: 'sab-limit' as const, label: 'Recent Downloads' },
  ]), [])

  const quick = quickConfig

  const flyoutPanelClass = 'absolute left-full top-0 glass-panel rounded-md border border-slate-700/40 bg-slate-900/95 shadow-[0_18px_45px_rgba(3,6,20,0.55)] p-0 grid'

  const renderThirdLevel = () => {
    if (!activeSection || !quick) return null

    if (activeSection === 'ai-provider') {
      return (
        <div className={`${flyoutPanelClass} w-[280px]`}>
          {quick.aiProviders.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No AI providers available</div>
          ) : quick.aiProviders.map((provider) => {
            const selected = provider.id === quick.aiProvider
            return (
              <button
                key={provider.id}
                type="button"
                disabled={quickBusy || !provider.available}
                onClick={() => {
                  if (!provider.available) return
                  void patchSettings({ ai_provider: provider.id })
                }}
                className={`w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
                  selected
                    ? 'bg-cyan-600/20 text-cyan-100'
                    : provider.available
                      ? 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
                      : 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                }`}
              >
                {aiProviderIcons[provider.id]
                  ? <img src={aiProviderIcons[provider.id]} alt={provider.label} className="h-5 w-5 object-contain" />
                  : <span className="h-5 w-5 bg-slate-700 text-[10px] inline-flex items-center justify-center">AI</span>}
                <span className="truncate">{provider.label}</span>
                {selected && <span className="ml-auto text-[10px] text-cyan-300">ACTIVE</span>}
              </button>
            )
          })}
        </div>
      )
    }

    if (activeSection === 'dashboard-cards') {
      return (
        <div className={`${flyoutPanelClass} w-[260px]`}>
          {dashboardCards.map((card) => {
            const checked = quick.dashboard[card.id]
            return (
              <button
                key={card.id}
                type="button"
                disabled={quickBusy}
                onClick={() => {
                  void patchSettings({ dashboard: { [card.id]: !checked } })
                }}
                className={`w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
                  checked ? 'bg-purple-600/20 text-purple-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
                }`}
              >
                <img src={card.icon} alt={card.label} className="h-5 w-5 object-contain" />
                <span>{card.label}</span>
                <span className={`ml-auto text-[10px] ${checked ? 'text-purple-300' : 'text-slate-400'}`}>{checked ? 'ON' : 'OFF'}</span>
              </button>
            )
          })}
        </div>
      )
    }

    if (activeSection === 'streaming-services') {
      return (
        <div className={`${flyoutPanelClass} w-[280px]`}>
          {quick.streamingServices.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No streaming services found</div>
          ) : quick.streamingServices.map((service) => {
            const checked = service.enabled
            return (
              <button
                key={service.id}
                type="button"
                disabled={quickBusy}
                onClick={() => {
                  const nextEnabled = quick.streamingServices
                    .map((s) => (s.id === service.id ? (checked ? null : s.id) : (s.enabled ? s.id : null)))
                    .filter((id): id is string => Boolean(id))
                  void patchStreaming(nextEnabled)
                }}
                className={`w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
                  checked ? 'bg-emerald-600/20 text-emerald-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
                }`}
              >
                {getStreamingLogo(service.id)
                  ? <img src={getStreamingLogo(service.id)} alt={service.name} className="h-5 w-5 object-contain" />
                  : <span className="h-5 w-5 bg-slate-700 text-[10px] inline-flex items-center justify-center">TV</span>}
                <span>{service.name}</span>
                <span className={`ml-auto text-[10px] ${checked ? 'text-emerald-300' : 'text-slate-400'}`}>{checked ? 'ON' : 'OFF'}</span>
              </button>
            )
          })}
        </div>
      )
    }

    if (activeSection === 'discovery-search') {
      return (
        <div className={`${flyoutPanelClass} w-[220px]`}>
          {(['top', 'bottom'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              disabled={quickBusy}
              onClick={() => { void patchSettings({ layout: { discovery_search_position: pos } }) }}
              className={`w-full px-3 py-2 border-b border-slate-700/40 text-left text-sm ${
                quick.layout.discovery_search_position === pos ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {pos === 'top' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
                </svg>
                {pos === 'top' ? 'Top' : 'Bottom'}
              </span>
            </button>
          ))}
        </div>
      )
    }

    if (activeSection === 'library-search') {
      return (
        <div className={`${flyoutPanelClass} w-[220px]`}>
          {(['top', 'bottom'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              disabled={quickBusy}
              onClick={() => { void patchSettings({ layout: { library_search_position: pos } }) }}
              className={`w-full px-3 py-2 border-b border-slate-700/40 text-left text-sm ${
                quick.layout.library_search_position === pos ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {pos === 'top' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
                </svg>
                {pos === 'top' ? 'Top' : 'Bottom'}
              </span>
            </button>
          ))}
        </div>
      )
    }

    if (activeSection === 'view-mode') {
      return (
        <div className={`${flyoutPanelClass} w-[220px]`}>
          {(['grid', 'list'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={quickBusy}
              onClick={() => { void patchSettings({ layout: { view_mode: mode } }) }}
              className={`w-full px-3 py-2 border-b border-slate-700/40 text-left text-sm ${
                quick.layout.view_mode === mode ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
              }`}
            >
              {mode === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </div>
      )
    }

    return (
      <div className={`${flyoutPanelClass} w-[220px]`}>
        {[5, 10, 15, 20].map((count) => (
          <button
            key={count}
            type="button"
            disabled={quickBusy}
            onClick={() => { void patchSettings({ sabnzbd: { recent_group_limit: count } }) }}
            className={`w-full px-3 py-2 border-b border-slate-700/40 text-left text-sm ${
              quick.sabRecentLimit === count ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'
            }`}
          >
            {count} Groups
          </button>
        ))}
      </div>
    )
  }

  const handleMobileOpenSettingsQuick = async () => {
    await ensureQuickConfig()
    setMobileView('settings-sections')
  }

  const handleMobileOpenStreamingLinks = async () => {
    if (enabledStreamingServices.length === 0) {
      await ensureQuickConfig()
    }
    setMobileView('streaming-links')
  }

  const getMobileBackTarget = (view: MobileView): MobileView => {
    if (view === 'settings-sections' || view === 'streaming-links') return 'root'
    if (view.startsWith('settings-')) return 'settings-sections'
    return 'root'
  }

  const renderMobileQuickOptions = () => {
    if (!quick) {
      return <div className="px-3 py-3 text-sm text-slate-400">Loading options...</div>
    }

    if (mobileView === 'settings-ai-provider') {
      return quick.aiProviders.length === 0 ? (
        <div className="px-3 py-3 text-sm text-slate-500">No AI providers available</div>
      ) : (
        quick.aiProviders.map((provider) => {
          const selected = provider.id === quick.aiProvider
          return (
            <button
              key={provider.id}
              type="button"
              disabled={quickBusy || !provider.available}
              onClick={() => {
                if (!provider.available) return
                void patchSettings({ ai_provider: provider.id })
              }}
              className={`w-full px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
                selected ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 text-slate-200'
              } ${!provider.available ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {aiProviderIcons[provider.id]
                ? <img src={aiProviderIcons[provider.id]} alt={provider.label} className="h-5 w-5 object-contain" />
                : <span className="h-5 w-5 bg-slate-700 text-[10px] inline-flex items-center justify-center">AI</span>}
              <span>{provider.label}</span>
              {selected && <span className="ml-auto text-[10px] text-cyan-300">ACTIVE</span>}
            </button>
          )
        })
      )
    }

    if (mobileView === 'settings-dashboard-cards') {
      return dashboardCards.map((card) => {
        const checked = quick.dashboard[card.id]
        return (
          <button
            key={card.id}
            type="button"
            disabled={quickBusy}
            onClick={() => { void patchSettings({ dashboard: { [card.id]: !checked } }) }}
            className={`w-full px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
              checked ? 'bg-purple-600/20 text-purple-100' : 'bg-slate-800/50 text-slate-200'
            }`}
          >
            <img src={card.icon} alt={card.label} className="h-5 w-5 object-contain" />
            <span>{card.label}</span>
            <span className={`ml-auto text-[10px] ${checked ? 'text-purple-300' : 'text-slate-400'}`}>{checked ? 'ON' : 'OFF'}</span>
          </button>
        )
      })
    }

    if (mobileView === 'settings-streaming-services') {
      return quick.streamingServices.length === 0 ? (
        <div className="px-3 py-3 text-sm text-slate-500">No streaming services found</div>
      ) : (
        quick.streamingServices.map((service) => {
          const checked = service.enabled
          return (
            <button
              key={service.id}
              type="button"
              disabled={quickBusy}
              onClick={() => {
                const nextEnabled = quick.streamingServices
                  .map((s) => (s.id === service.id ? (checked ? null : s.id) : (s.enabled ? s.id : null)))
                  .filter((id): id is string => Boolean(id))
                void patchStreaming(nextEnabled)
              }}
              className={`w-full px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${
                checked ? 'bg-emerald-600/20 text-emerald-100' : 'bg-slate-800/50 text-slate-200'
              }`}
            >
              {getStreamingLogo(service.id)
                ? <img src={getStreamingLogo(service.id)} alt={service.name} className="h-5 w-5 object-contain" />
                : <span className="h-5 w-5 bg-slate-700 text-[10px] inline-flex items-center justify-center">TV</span>}
              <span>{service.name}</span>
              <span className={`ml-auto text-[10px] ${checked ? 'text-emerald-300' : 'text-slate-400'}`}>{checked ? 'ON' : 'OFF'}</span>
            </button>
          )
        })
      )
    }

    if (mobileView === 'settings-discovery-search') {
      return (['top', 'bottom'] as const).map((pos) => (
        <button
          key={pos}
          type="button"
          disabled={quickBusy}
          onClick={() => { void patchSettings({ layout: { discovery_search_position: pos } }) }}
          className={`w-full px-3 py-3 border-b border-slate-700/40 text-left text-sm ${
            quick.layout.discovery_search_position === pos ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 text-slate-200'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {pos === 'top' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
            </svg>
            {pos === 'top' ? 'Top' : 'Bottom'}
          </span>
        </button>
      ))
    }

    if (mobileView === 'settings-library-search') {
      return (['top', 'bottom'] as const).map((pos) => (
        <button
          key={pos}
          type="button"
          disabled={quickBusy}
          onClick={() => { void patchSettings({ layout: { library_search_position: pos } }) }}
          className={`w-full px-3 py-3 border-b border-slate-700/40 text-left text-sm ${
            quick.layout.library_search_position === pos ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 text-slate-200'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {pos === 'top' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
            </svg>
            {pos === 'top' ? 'Top' : 'Bottom'}
          </span>
        </button>
      ))
    }

    if (mobileView === 'settings-view-mode') {
      return (['grid', 'list'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={quickBusy}
          onClick={() => { void patchSettings({ layout: { view_mode: mode } }) }}
          className={`w-full px-3 py-3 border-b border-slate-700/40 text-left text-sm ${
            quick.layout.view_mode === mode ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 text-slate-200'
          }`}
        >
          {mode === 'grid' ? 'Grid' : 'List'}
        </button>
      ))
    }

    if (mobileView === 'settings-sab-limit') {
      return [5, 10, 15, 20].map((count) => (
        <button
          key={count}
          type="button"
          disabled={quickBusy}
          onClick={() => { void patchSettings({ sabnzbd: { recent_group_limit: count } }) }}
          className={`w-full px-3 py-3 border-b border-slate-700/40 text-left text-sm ${
            quick.sabRecentLimit === count ? 'bg-cyan-600/20 text-cyan-100' : 'bg-slate-800/50 text-slate-200'
          }`}
        >
          {count} Groups
        </button>
      ))
    }

    return null
  }

  const mobileSectionTarget: Record<(typeof sectionItems)[number]['id'], MobileView> = {
    'ai-provider': 'settings-ai-provider',
    'dashboard-cards': 'settings-dashboard-cards',
    'streaming-services': 'settings-streaming-services',
    'discovery-search': 'settings-discovery-search',
    'library-search': 'settings-library-search',
    'view-mode': 'settings-view-mode',
    'sab-limit': 'settings-sab-limit',
  }

  const mobileViewTitle: Record<MobileView, string> = {
    root: 'Menu',
    'settings-sections': 'Settings Quick Options',
    'settings-ai-provider': 'AI Provider',
    'settings-dashboard-cards': 'Dashboard Cards',
    'settings-streaming-services': 'Streaming Services',
    'settings-discovery-search': 'Discovery Search',
    'settings-library-search': 'Library Search',
    'settings-view-mode': 'View Mode',
    'settings-sab-limit': 'Recent Downloads',
    'streaming-links': 'Streaming Services',
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 pt-1">
      <div className="max-w-5xl mx-auto">
        <div className="glass-panel rounded-md border border-slate-700/40 shadow-[0_18px_45px_rgba(3,6,20,0.5)] px-3 md:px-4 py-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            onMouseEnter={() => setMenuOpen(true)}
            className="px-2 py-2 rounded bg-slate-800/60 text-slate-200 inline-flex items-center"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            ref={menuButtonRef}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleHomeClick}
            className="text-xl font-medium uppercase tracking-[0.3em] text-slate-400 hover:text-cyan-300 transition-colors"
            title="Go home"
          >
            QUASRR
          </button>
        </div>

        {menuOpen && (
          <div ref={menuPanelRef} className="relative mt-2">
            <div
              onMouseLeave={() => setMenuOpen(false)}
              className="hidden md:grid w-full md:w-[340px] glass-panel rounded-md border border-slate-700/40 bg-slate-900/95 shadow-[0_18px_45px_rgba(3,6,20,0.5)] p-0 text-sm text-slate-200"
            >
              <button type="button" onClick={handleHomeClick} className="px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60 transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12l9-9 9 9" />
                  <path d="M5 10v10h14V10" />
                </svg>
                <span>Home</span>
              </button>

              <button type="button" onClick={() => handleNavigate('/')} className={`px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'home' ? 'bg-slate-700/60' : 'bg-slate-800/50 hover:bg-slate-700/60'}`}>
                <SearchIcon className="h-4 w-4" />
                <span>Search</span>
              </button>

              <button type="button" onClick={() => handleNavigate('/downloads')} className={`px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'downloads' ? 'bg-slate-700/60' : 'bg-slate-800/50 hover:bg-slate-700/60'}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                <span>Download Activity</span>
              </button>

              <button type="button" onClick={() => handleNavigate('/status')} className={`px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'status' ? 'bg-slate-700/60' : 'bg-slate-800/50 hover:bg-slate-700/60'}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h4l2-4 4 8 2-4h4" />
                </svg>
                <span>System Status</span>
              </button>

              <div className="relative" onMouseEnter={() => { setActiveSettings(true); void ensureQuickConfig() }} onMouseLeave={() => { setActiveSettings(false); setActiveSection(null) }}>
                <button
                  type="button"
                  onClick={() => handleNavigate('/settings')}
                  className={`w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'settings' ? 'bg-slate-700/60' : 'bg-slate-800/50 hover:bg-slate-700/60'}`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1.5 1.5H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
                  </svg>
                  <span>Settings</span>
                  <svg className="ml-auto h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>

                {activeSettings && (
                  <div className="absolute left-full top-0 w-[230px] glass-panel rounded-md border border-slate-700/40 bg-slate-900/95 shadow-[0_18px_45px_rgba(3,6,20,0.55)] p-0 grid">
                    {sectionItems.map((section) => (
                      <div key={section.id} className="relative" onMouseEnter={() => setActiveSection(section.id)}>
                        <button type="button" className={`w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm ${activeSection === section.id ? 'bg-slate-700/70 text-slate-100' : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-200'}`}>
                          <span className="h-5 w-5 rounded bg-slate-700/80 inline-flex items-center justify-center text-slate-300">{renderSectionIcon(section.id)}</span>
                          <span>{section.label}</span>
                          <svg className="ml-auto h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </button>
                        {activeSection === section.id && renderThirdLevel()}
                      </div>
                    ))}
                    {quickError && <div className="px-3 py-2 text-xs text-rose-300">{quickError}</div>}
                  </div>
                )}
              </div>

              <Link href="/library" onClick={() => setMenuOpen(false)} className={`px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'library' ? 'bg-slate-700/60' : 'bg-slate-800/50 hover:bg-slate-700/60'}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Library</span>
              </Link>

              <div
                className="relative"
                onMouseEnter={() => setActiveStreaming(true)}
                onMouseLeave={() => setActiveStreaming(false)}
              >
                <button
                  type="button"
                  className="w-full px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
                  </svg>
                  <span>Streaming Services</span>
                  <svg className="ml-auto h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>

                {activeStreaming && (
                  <div className="absolute left-full top-0 w-[260px] glass-panel rounded-md border border-slate-700/40 bg-slate-900/95 shadow-[0_18px_45px_rgba(3,6,20,0.55)] p-0 grid">
                    {enabledStreamingServices.length === 0 ? (
                      <span className="px-3 py-2 text-xs text-slate-500">No enabled services</span>
                    ) : enabledStreamingServices.map((service) => {
                      const link = getStreamingLink(service.id) || `https://www.${service.id.replace(/_/g, '')}.com`
                      return (
                        <a
                          key={service.id}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMenuOpen(false)}
                          className="px-3 py-2 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60"
                        >
                          {getStreamingLogo(service.id)
                            ? <img src={getStreamingLogo(service.id)} alt={service.name} className="h-4 w-4 object-contain" />
                            : <span className="text-gray-500 text-xs">?</span>}
                          <span>{service.name}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-700/40">
                <button type="button" onClick={handleLogout} className="w-full px-3 py-2 inline-flex items-center gap-2 text-left bg-rose-900/30 hover:bg-rose-800/40 text-rose-200">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                  <span>Log Out</span>
                </button>
              </div>
            </div>

            <div className="md:hidden glass-panel rounded-md border border-slate-700/40 bg-slate-900/95 shadow-[0_18px_45px_rgba(3,6,20,0.5)] p-0 grid text-sm text-slate-200 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {mobileView !== 'root' && (
                <button
                  type="button"
                  onClick={() => setMobileView(getMobileBackTarget(mobileView))}
                  className="px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span>Back</span>
                  <span className="ml-auto text-xs text-slate-400">{mobileViewTitle[mobileView]}</span>
                </button>
              )}

              {mobileView === 'root' && (
                <>
                  <button type="button" onClick={handleHomeClick} className="px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12l9-9 9 9" />
                      <path d="M5 10v10h14V10" />
                    </svg>
                    <span>Home</span>
                  </button>

                  <button type="button" onClick={() => handleNavigate('/')} className={`px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'home' ? 'bg-slate-700/60' : 'bg-slate-800/50'}`}>
                    <SearchIcon className="h-4 w-4" />
                    <span>Search</span>
                  </button>

                  <button type="button" onClick={() => handleNavigate('/downloads')} className={`px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'downloads' ? 'bg-slate-700/60' : 'bg-slate-800/50'}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v12" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    <span>Download Activity</span>
                  </button>

                  <button type="button" onClick={() => handleNavigate('/status')} className={`px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'status' ? 'bg-slate-700/60' : 'bg-slate-800/50'}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12h4l2-4 4 8 2-4h4" />
                    </svg>
                    <span>System Status</span>
                  </button>

                  <button type="button" onClick={() => handleNavigate('/settings')} className={`px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'settings' ? 'bg-slate-700/60' : 'bg-slate-800/50'}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1.5 1.5H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
                    </svg>
                    <span>Settings (Full Page)</span>
                  </button>

                  <button type="button" onClick={() => void handleMobileOpenSettingsQuick()} className="px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50">
                    <span className="h-5 w-5 rounded bg-slate-700/80 inline-flex items-center justify-center text-slate-300">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 3l1.8 3.6L18 8.4l-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-1.8L12 3z" />
                      </svg>
                    </span>
                    <span>Settings Quick Options</span>
                    <svg className="ml-auto h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>

                  <Link href="/library" onClick={() => setMenuOpen(false)} className={`px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left ${currentPage === 'library' ? 'bg-slate-700/60' : 'bg-slate-800/50'}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    <span>Library</span>
                  </Link>

                  <button type="button" onClick={() => void handleMobileOpenStreamingLinks()} className="px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
                    </svg>
                    <span>Streaming Services</span>
                    <svg className="ml-auto h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>

                  <button type="button" onClick={handleLogout} className="w-full px-3 py-3 inline-flex items-center gap-2 text-left bg-rose-900/30 text-rose-200">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="M16 17l5-5-5-5" />
                      <path d="M21 12H9" />
                    </svg>
                    <span>Log Out</span>
                  </button>
                </>
              )}

              {mobileView === 'settings-sections' && (
                <>
                  {sectionItems.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setMobileView(mobileSectionTarget[section.id])}
                      className="w-full px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left text-sm bg-slate-800/50"
                    >
                      <span className="h-5 w-5 rounded bg-slate-700/80 inline-flex items-center justify-center text-slate-300">{renderSectionIcon(section.id)}</span>
                      <span>{section.label}</span>
                      <svg className="ml-auto h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  ))}
                </>
              )}

              {(mobileView.startsWith('settings-') && mobileView !== 'settings-sections') && renderMobileQuickOptions()}

              {mobileView === 'streaming-links' && (
                <>
                  {enabledStreamingServices.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">No enabled services</div>
                  ) : (
                    enabledStreamingServices.map((service) => {
                      const link = getStreamingLink(service.id) || `https://www.${service.id.replace(/_/g, '')}.com`
                      return (
                        <a
                          key={service.id}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMenuOpen(false)}
                          className="px-3 py-3 border-b border-slate-700/40 inline-flex items-center gap-2 text-left bg-slate-800/50"
                        >
                          {getStreamingLogo(service.id)
                            ? <img src={getStreamingLogo(service.id)} alt={service.name} className="h-4 w-4 object-contain" />
                            : <span className="text-gray-500 text-xs">?</span>}
                          <span>{service.name}</span>
                        </a>
                      )
                    })
                  )}
                </>
              )}

              {quickError && <div className="px-3 py-2 text-xs text-rose-300">{quickError}</div>}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
