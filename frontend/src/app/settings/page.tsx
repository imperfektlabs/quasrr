'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useSettings, useClickOutside } from '@/hooks'
import { NavigationMenu } from '@/components'
import { getStreamingLogo } from '@/utils/streaming'

export default function SettingsPage() {
  const { config, setConfig } = useBackendApiSetup()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

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
    { id: 'openai', label: 'OpenAI' },
    { id: 'gemini', label: 'Gemini' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'local', label: 'Local' },
  ]

  const selectedProviderAvailable = settingsAiProvider
    ? availableAiProviderSet.has(settingsAiProvider)
    : false

  const selectedProviderModel = (() => {
    const ai = config?.ai
    if (!ai) return null
    if (settingsAiProvider === 'openai') return ai.openai_model || ai.model
    if (settingsAiProvider === 'gemini') return ai.gemini_model || ai.model
    if (settingsAiProvider === 'openrouter') return ai.openrouter_model || ai.model
    if (settingsAiProvider === 'deepseek') return ai.deepseek_model || ai.model
    if (settingsAiProvider === 'anthropic') return ai.anthropic_model || ai.model
    if (settingsAiProvider === 'local') return ai.model
    return ai.model
  })()

  return (
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="settings"
        config={config}
      />

      <div className="max-w-5xl mx-auto">
        {!config ? (
          <div className="glass-panel rounded-lg p-4 text-gray-400">
            Loading configuration...
          </div>
        ) : (
          <section id="settings" className="scroll-mt-24 mt-4 glass-panel rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Settings</h3>
            <p className="text-xs text-gray-400 mb-3">
              Non-secret settings only. Env vars still override these values.
            </p>
            {settingsError && (
              <div className="text-xs text-red-400 mb-2">Error: {settingsError}</div>
            )}
            {settingsSaved && (
              <div className="text-xs text-cyan-300 mb-2">Settings saved.</div>
            )}
            {settingsSaving && (
              <div className="text-xs text-amber-300 mb-2">Saving settings...</div>
            )}
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-gray-400">Country</span>
                <input
                  type="text"
                  value={settingsCountry}
                  onChange={(event) => setSettingsCountry(event.target.value.toUpperCase())}
                  onBlur={() => {
                    void saveSettings()
                  }}
                  className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                />
              </label>
              <div className="grid gap-1">
                <span className="text-xs text-gray-400">AI Provider</span>
                <div className="grid gap-2">
                  {aiProviderOptions.map((provider) => {
                    const isAvailable = availableAiProviderSet.has(provider.id)
                    const isChecked = settingsAiProvider === provider.id
                    return (
                      <label
                        key={provider.id}
                        className={`flex items-center gap-2 ${isAvailable ? '' : 'text-gray-500'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isAvailable}
                          onChange={(event) => {
                            if (!event.target.checked) {
                              return
                            }
                            setSettingsAiProvider(provider.id)
                            void saveSettings({ ai_provider: provider.id })
                          }}
                        />
                        <span>{provider.label}</span>
                      </label>
                    )
                  })}
                  {availableAiProviderSet.size === 0 && (
                    <span className="text-xs text-gray-500">No AI providers configured in .env</span>
                  )}
                </div>
              </div>
            </div>
            {selectedProviderModel && (
              <div className="mt-2 text-xs text-gray-400">
                AI model: <span className="text-gray-200">{selectedProviderModel}</span>
              </div>
            )}
            {!selectedProviderAvailable && settingsAiProvider && (
              <div className="mt-1 text-xs text-red-400">
                Selected provider is not configured in .env.
              </div>
            )}

            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Dashboard Cards</h4>
              <p className="text-xs text-gray-500 mb-2">
                If no cards are selected, the dashboard is hidden from the front page.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsShowSonarr}
                    onChange={(event) => {
                      const next = event.target.checked
                      setSettingsShowSonarr(next)
                      void saveDashboardSettings({ show_sonarr: next })
                    }}
                  />
                  <span>Sonarr</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsShowRadarr}
                    onChange={(event) => {
                      const next = event.target.checked
                      setSettingsShowRadarr(next)
                      void saveDashboardSettings({ show_radarr: next })
                    }}
                  />
                  <span>Radarr</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsShowSabnzbd}
                    onChange={(event) => {
                      const next = event.target.checked
                      setSettingsShowSabnzbd(next)
                      void saveDashboardSettings({ show_sabnzbd: next })
                    }}
                  />
                  <span>SABnzbd</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settingsShowPlex}
                    onChange={(event) => {
                      const next = event.target.checked
                      setSettingsShowPlex(next)
                      void saveDashboardSettings({ show_plex: next })
                    }}
                  />
                  <span>Plex</span>
                </label>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Layout</h4>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <label className="grid gap-1">
                  <span className="text-xs text-gray-400">Discovery search panel</span>
                  <select
                    value={settingsDiscoverySearchPosition}
                    onChange={(event) => {
                      const next = event.target.value as 'top' | 'bottom'
                      setSettingsDiscoverySearchPosition(next)
                      void saveSettings({ discovery_search_position: next })
                    }}
                    className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-gray-400">Library search panel</span>
                  <select
                    value={settingsLibrarySearchPosition}
                    onChange={(event) => {
                      const next = event.target.value as 'top' | 'bottom'
                      setSettingsLibrarySearchPosition(next)
                      void saveSettings({ library_search_position: next })
                    }}
                    className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Downloads</h4>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <label className="grid gap-1">
                  <span className="text-xs text-gray-400">Recent download groups</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settingsSabRecentLimit}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (Number.isNaN(value)) return
                      setSettingsSabRecentLimit(value)
                    }}
                    onBlur={() => {
                      const value = Math.max(1, Math.min(20, settingsSabRecentLimit || 10))
                      setSettingsSabRecentLimit(value)
                      void saveSettings({ sab_recent_group_limit: value })
                    }}
                    className="bg-slate-900/60 border border-slate-700/60 rounded px-2 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Streaming Services</h4>
              {streamingUpdateError && (
                <div className="text-xs text-red-400 mb-2">Error: {streamingUpdateError}</div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {config.streaming_services.map((service) => (
                  <label key={service.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={service.enabled}
                      disabled={streamingUpdateBusy}
                      onChange={(event) => handleStreamingToggle(service.id, event.target.checked)}
                    />
                    {getStreamingLogo(service.id) ? (
                      <img src={getStreamingLogo(service.id)} alt={service.name} className="h-5 w-5 object-contain" />
                    ) : (
                      <span className="text-gray-500 text-xs">?</span>
                    )}
                    <span>{service.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
