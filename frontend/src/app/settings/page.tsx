'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useSettings, useClickOutside, useRandomLibraryPoster } from '@/hooks'
import { getLocalToolUrl } from '@/utils/backend'
import { NavigationMenu } from '@/components'
import { getStreamingLogo } from '@/utils/streaming'

export default function SettingsPage() {
  const { config, setConfig } = useBackendApiSetup()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  // Random library poster for background
  const randomPoster = useRandomLibraryPoster(Boolean(config))

  const {
    country: settingsCountry,
    setCountry: setSettingsCountry,
    aiProvider: settingsAiProvider,
    setAiProvider: setSettingsAiProvider,
    showSonarr: settingsShowSonarr,
    setShowSonarr: setSettingsShowSonarr,
    showRadarr: settingsShowRadarr,
    setShowRadarr: setSettingsShowRadarr,
    showSabnzbd: settingsShowSabnzbd,
    setShowSabnzbd: setSettingsShowSabnzbd,
    showPlex: settingsShowPlex,
    setShowPlex: setSettingsShowPlex,
    sabRecentLimit: settingsSabRecentLimit,
    setSabRecentLimit: setSettingsSabRecentLimit,
    discoverySearchPosition: settingsDiscoverySearchPosition,
    setDiscoverySearchPosition: setSettingsDiscoverySearchPosition,
    librarySearchPosition: settingsLibrarySearchPosition,
    setLibrarySearchPosition: setSettingsLibrarySearchPosition,
    viewMode,
    setViewMode,
    saving: settingsSaving,
    error: settingsError,
    saved: settingsSaved,
    streamingBusy: streamingUpdateBusy,
    streamingError: streamingUpdateError,
    toggleStreaming: handleStreamingToggle,
    saveDashboard: saveDashboardSettings,
    saveSettings,
  } = useSettings(config, setConfig)

  const availableAiProviders = config?.ai.available_providers ?? []
  const availableAiProviderSet = new Set(availableAiProviders)
  const aiProviderOptions = [
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic' },
  ]

  const selectedProviderAvailable = availableAiProviderSet.has(settingsAiProvider)
  const selectedProviderOption = aiProviderOptions.find((p) => p.id === settingsAiProvider)
  const selectedProviderModel = selectedProviderOption && config?.ai
    ? (config.ai[`${settingsAiProvider}_model` as keyof typeof config.ai] as string | undefined) || null
    : null

  const aiProviderIcons: Record<string, string> = {
    openai: '/logos/ai/openai.svg',
    anthropic: '/logos/ai/anthropic.svg',
    openrouter: '/logos/ai/openrouter.svg',
  }

  const sortedStreamingServices = [...(config?.streaming_services ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))

  const toolIcons: Record<string, string> = {
    sonarr: '/logos/tools/sonarr.svg',
    radarr: '/logos/tools/radarr.svg',
    sabnzbd: '/logos/tools/sabnzbd.svg',
    plex: '/logos/tools/plex.svg',
  }

  const toolLinks: Record<string, string> = {
    sonarr: config?.integrations.sonarr_url || getLocalToolUrl(8989),
    radarr: config?.integrations.radarr_url || getLocalToolUrl(7878),
    sabnzbd: config?.integrations.sabnzbd_url || getLocalToolUrl(8080),
    plex: config?.integrations.plex_url || getLocalToolUrl(32400, '/web'),
  }

  const integrations = [
    {
      id: 'sonarr',
      name: 'Sonarr',
      icon: toolIcons.sonarr,
      link: toolLinks.sonarr,
      checked: settingsShowSonarr,
      onChange: (checked: boolean) => {
        setSettingsShowSonarr(checked)
        void saveDashboardSettings({ show_sonarr: checked })
      },
    },
    {
      id: 'radarr',
      name: 'Radarr',
      icon: toolIcons.radarr,
      link: toolLinks.radarr,
      checked: settingsShowRadarr,
      onChange: (checked: boolean) => {
        setSettingsShowRadarr(checked)
        void saveDashboardSettings({ show_radarr: checked })
      },
    },
    {
      id: 'sabnzbd',
      name: 'SABnzbd',
      icon: toolIcons.sabnzbd,
      link: toolLinks.sabnzbd,
      checked: settingsShowSabnzbd,
      onChange: (checked: boolean) => {
        setSettingsShowSabnzbd(checked)
        void saveDashboardSettings({ show_sabnzbd: checked })
      },
    },
    {
      id: 'plex',
      name: 'Plex',
      icon: toolIcons.plex,
      link: toolLinks.plex,
      checked: settingsShowPlex,
      onChange: (checked: boolean) => {
        setSettingsShowPlex(checked)
        void saveDashboardSettings({ show_plex: checked })
      },
    },
  ]

  return (
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8 relative overflow-hidden">
      {/* Background poster with gradient overlays */}
      {randomPoster && (
        <>
          <div className="fixed inset-0 z-0">
            <img
              src={randomPoster}
              alt="Background"
              className="w-full h-full object-cover object-center blur-3xl opacity-20 scale-110"
            />
          </div>
          <div className="fixed inset-0 z-0 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-900/95" />
        </>
      )}

      <div className="relative z-10">
        <NavigationMenu
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          menuButtonRef={menuButtonRef}
          menuPanelRef={menuPanelRef}
          currentPage="settings"
          config={config}
        />

        <div className="max-w-5xl mx-auto">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
              Settings
            </h1>
            <p className="text-sm text-slate-400">Configure your Quasrr experience</p>
          </div>

        {!config ? (
          <div className="glass-panel rounded-lg p-6 text-center">
            <div className="text-slate-400 animate-pulse">Loading configuration...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Feedback messages */}
            {settingsError && (
              <div className="glass-panel rounded-lg p-3 bg-rose-500/10 border border-rose-500/30">
                <p className="text-sm text-rose-300">Error: {settingsError}</p>
              </div>
            )}
            {settingsSaved && (
              <div className="glass-panel rounded-lg p-3 bg-cyan-500/10 border border-cyan-500/30">
                <p className="text-sm text-cyan-300">Settings saved successfully</p>
              </div>
            )}
            {settingsSaving && (
              <div className="glass-panel rounded-lg p-3 bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm text-amber-300">Saving settings...</p>
              </div>
            )}

            {/* AI Providers */}
            <section className="glass-panel rounded-xl border border-slate-700/40 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-1 flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Provider
              </h2>
              <p className="text-xs text-slate-400 mb-4">Select your AI provider for suggestions</p>

              <div className="grid grid-cols-3 gap-4 mb-3">
                {aiProviderOptions.map((provider) => {
                  const isAvailable = availableAiProviderSet.has(provider.id)
                  const isSelected = settingsAiProvider === provider.id
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        setSettingsAiProvider(provider.id)
                        void saveSettings({ ai_provider: provider.id })
                      }}
                      title={`${provider.label}${!isAvailable ? ' (not configured)' : ''}`}
                      className={`
                        group relative aspect-square rounded-xl p-6
                        flex items-center justify-center transition-all
                        ${isSelected && isAvailable
                          ? 'bg-gradient-to-br from-cyan-600/30 to-purple-600/20 border-2 border-cyan-500/60 shadow-lg shadow-cyan-500/20'
                          : isAvailable
                            ? 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-cyan-500/40 hover:bg-slate-700/40'
                            : 'bg-slate-900/40 border-2 border-slate-800/40 opacity-40 cursor-not-allowed'
                        }
                      `}
                    >
                      {aiProviderIcons[provider.id] ? (
                        <img
                          src={aiProviderIcons[provider.id]}
                          alt={provider.label}
                          className="w-12 h-12 object-contain"
                        />
                      ) : (
                        <div className="text-2xl text-slate-500 font-bold">AI</div>
                      )}
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedProviderModel && (
                <div className="text-xs text-slate-400 mt-2">
                  Model: <span className="text-slate-200">{selectedProviderModel}</span>
                </div>
              )}
              {!selectedProviderAvailable && settingsAiProvider && (
                <div className="mt-2 text-xs text-rose-400">
                  Selected provider is not configured in .env
                </div>
              )}
              {availableAiProviderSet.size === 0 && (
                <div className="text-xs text-slate-500 mt-2">
                  No AI providers configured in .env
                </div>
              )}
            </section>

            {/* Dashboard Integrations */}
            <section className="glass-panel rounded-xl border border-slate-700/40 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-1 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                Dashboard Cards
              </h2>
              <p className="text-xs text-slate-400 mb-4">Show/hide cards on the homepage dashboard</p>

              <div className="grid grid-cols-4 gap-4">
                {integrations.map((integration) => (
                  <button
                    key={integration.id}
                    type="button"
                    onClick={() => integration.onChange(!integration.checked)}
                    title={integration.name}
                    className={`
                      group relative aspect-square rounded-xl p-6
                      flex items-center justify-center transition-all
                      ${integration.checked
                        ? 'bg-gradient-to-br from-purple-600/30 to-pink-600/20 border-2 border-purple-500/60 shadow-lg shadow-purple-500/20'
                        : 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-purple-500/40 hover:bg-slate-700/40'
                      }
                    `}
                  >
                    <a
                      href={integration.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-12 h-12 flex items-center justify-center"
                    >
                      <img
                        src={integration.icon}
                        alt={integration.name}
                        className="w-12 h-12 object-contain"
                      />
                    </a>
                    {integration.checked && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center shadow-lg">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Streaming Services */}
            <section className="glass-panel rounded-xl border border-slate-700/40 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-1 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                Streaming Services
              </h2>
              <p className="text-xs text-slate-400 mb-4">Select your subscribed streaming platforms</p>

              {streamingUpdateError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                  <p className="text-xs text-rose-300">Error: {streamingUpdateError}</p>
                </div>
              )}

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                {sortedStreamingServices.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    disabled={streamingUpdateBusy}
                    onClick={() => handleStreamingToggle(service.id, !service.enabled)}
                    title={service.name}
                    className={`
                      group relative aspect-square rounded-lg p-3
                      flex items-center justify-center transition-all
                      ${service.enabled
                        ? 'bg-gradient-to-br from-emerald-600/30 to-teal-600/20 border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-emerald-500/40 hover:bg-slate-700/40'
                      }
                      ${streamingUpdateBusy ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {getStreamingLogo(service.id) ? (
                      <img
                        src={getStreamingLogo(service.id)}
                        alt={service.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <div className="text-xs text-slate-500">?</div>
                    )}
                    {service.enabled && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* General Settings */}
            <section className="glass-panel rounded-xl border border-slate-700/40 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-1 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                General
              </h2>
              <p className="text-xs text-slate-400 mb-4">Basic configuration options</p>

              <div className="grid md:grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Country Code</span>
                  <input
                    type="text"
                    value={settingsCountry}
                    onChange={(event) => setSettingsCountry(event.target.value.toUpperCase())}
                    onBlur={() => void saveSettings()}
                    placeholder="US"
                    maxLength={2}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">View Mode</span>
                  <select
                    value={viewMode}
                    onChange={(event) => {
                      const next = event.target.value as 'grid' | 'list'
                      setViewMode(next)
                      void saveSettings({ view_mode: next })
                    }}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  >
                    <option value="grid">Grid (Poster-focused)</option>
                    <option value="list">List (Compact)</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Discovery Search Position</span>
                  <select
                    value={settingsDiscoverySearchPosition}
                    onChange={(event) => {
                      const next = event.target.value as 'top' | 'bottom'
                      setSettingsDiscoverySearchPosition(next)
                      void saveSettings({ discovery_search_position: next })
                    }}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Library Search Position</span>
                  <select
                    value={settingsLibrarySearchPosition}
                    onChange={(event) => {
                      const next = event.target.value as 'top' | 'bottom'
                      setSettingsLibrarySearchPosition(next)
                      void saveSettings({ library_search_position: next })
                    }}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Recent Download Groups</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settingsSabRecentLimit}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (!Number.isNaN(value)) setSettingsSabRecentLimit(value)
                    }}
                    onBlur={() => {
                      const value = Math.max(1, Math.min(20, settingsSabRecentLimit || 10))
                      setSettingsSabRecentLimit(value)
                      void saveSettings({ sab_recent_group_limit: value })
                    }}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  />
                </label>
              </div>
            </section>
          </div>
        )}
        </div>
      </div>
    </main>
  )
}
