'use client'

import { useRef, useState, type FormEvent } from 'react'

import { useBackendApiSetup, useSettings, useClickOutside } from '@/hooks'
import { getLocalToolUrl, getBackendUrl } from '@/utils/backend'
import { NavigationMenu } from '@/components'
import { getStreamingLogo } from '@/utils/streaming'
import { useAuth } from '@/contexts/AuthContext'

export default function SettingsPage() {
  const { config, setConfig } = useBackendApiSetup()
  const { updateCredentials, logout } = useAuth()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const [currentUsername, setCurrentUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [credentialsBusy, setCredentialsBusy] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)
  const [credentialsSaved, setCredentialsSaved] = useState(false)
  const [editingModel, setEditingModel] = useState(false)
  const [tempModel, setTempModel] = useState('')
  const [validatingModel, setValidatingModel] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message?: string } | null>(null)

  const handleValidateModel = async (provider: string, model: string) => {
    if (!model) {
      setValidationResult(null)
      return true
    }
    setValidatingModel(true)
    setValidationResult(null)
    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({ provider, model })
      const res = await fetch(`${backendUrl}/ai/validate_model?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setValidationResult({ valid: data.valid, message: data.message })
        return data.valid
      }
    } catch (e) {
      console.error('Model validation failed', e)
    } finally {
      setValidatingModel(false)
    }
    return true // Assume valid on error to not block user
  }

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

  const aiProviderOptions = [...(config?.ai.providers ?? [])]
    .sort((a, b) => a.label.localeCompare(b.label))

  const selectedProviderOption = aiProviderOptions.find((p) => p.id === settingsAiProvider)
  const selectedProviderAvailable = selectedProviderOption?.available ?? false
  const selectedProviderModel = selectedProviderOption?.model || null
  const selectedProviderBaseUrl = selectedProviderOption?.base_url || null

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

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCredentialsSaved(false)
    setCredentialsError(null)

    const nextCurrentUsername = currentUsername.trim()
    const nextNewUsername = newUsername.trim()
    if (!nextCurrentUsername || !currentPassword || !nextNewUsername || !newPassword) {
      setCredentialsError('All fields are required')
      return
    }
    if (newPassword.length < 8) {
      setCredentialsError('New password must be at least 8 characters')
      return
    }

    setCredentialsBusy(true)
    try {
      await updateCredentials({
        current_username: nextCurrentUsername,
        current_password: currentPassword,
        new_username: nextNewUsername,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setCredentialsSaved(true)
    } catch (err) {
      setCredentialsError(err instanceof Error ? err.message : 'Unable to update credentials')
    } finally {
      setCredentialsBusy(false)
    }
  }

  return (
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8">
      <div>
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

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 mb-3">
                {aiProviderOptions.map((provider) => {
                  const isAvailable = provider.available
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
                      title={`${provider.label}${!isAvailable ? ' (Not configured)' : ''}`}
                      className={`
                        group relative aspect-square rounded-lg p-3
                        flex items-center justify-center transition-all
                        ${isSelected && isAvailable
                          ? 'bg-gradient-to-br from-cyan-600/30 to-purple-600/20 border-2 border-cyan-500/60 shadow-lg shadow-cyan-500/20'
                          : isAvailable
                            ? 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-cyan-500/40 hover:bg-slate-700/40'
                            : 'bg-slate-800/40 border-2 border-slate-700/60 opacity-45 cursor-not-allowed'
                        }
                      `}
                    >
                      {aiProviderIcons[provider.id] ? (
                        <img
                          src={aiProviderIcons[provider.id]}
                          alt={provider.label}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-lg text-slate-500 font-bold">AI</div>
                      )}
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedProviderOption && (
                <div className="text-xs text-slate-400 mt-2 space-y-1">
                  <div className="flex items-center gap-1 min-h-[24px]">
                    <span
                      className="cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        setTempModel(selectedProviderModel ?? '')
                        setValidationResult(null)
                        setEditingModel(true)
                      }}
                    >
                      Model:
                    </span>
                    {editingModel ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={tempModel}
                          onChange={(e) => {
                            setTempModel(e.target.value)
                            setValidationResult(null)
                          }}
                          onBlur={async () => {
                            if (tempModel === (selectedProviderModel ?? '')) {
                              setEditingModel(false)
                              return
                            }
                            const isValid = await handleValidateModel(settingsAiProvider, tempModel)
                            if (isValid || !tempModel) {
                              setEditingModel(false)
                              void saveSettings({ ai_model: tempModel })
                            }
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              if (tempModel === (selectedProviderModel ?? '')) {
                                setEditingModel(false)
                                return
                              }
                              const isValid = await handleValidateModel(settingsAiProvider, tempModel)
                              if (isValid || !tempModel) {
                                setEditingModel(false)
                                void saveSettings({ ai_model: tempModel })
                              }
                            } else if (e.key === 'Escape') {
                              setEditingModel(false)
                              setValidationResult(null)
                            }
                          }}
                          className={`bg-slate-900/60 border rounded px-1.5 py-0.5 text-slate-200 outline-none min-w-[120px] transition-colors ${
                            validationResult?.valid === false ? 'border-rose-500/60' : 'border-slate-700/60 focus:border-cyan-500/60'
                          }`}
                        />
                        {validatingModel && (
                          <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                        )}
                        {!validatingModel && validationResult?.valid === false && (
                          <span className="text-rose-400 font-medium">Model not found</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-slate-200 cursor-pointer hover:text-white transition-colors"
                          onClick={() => {
                            setTempModel(selectedProviderModel ?? '')
                            setValidationResult(null)
                            setEditingModel(true)
                          }}
                        >
                          {selectedProviderModel ?? ''}
                        </span>
                        {selectedProviderModel && (
                          <span className="text-emerald-500/80" title="Verified">✓</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    Base URL: <span className="text-slate-200">{selectedProviderBaseUrl ?? ''}</span>
                  </div>
                </div>
              )}
              {!selectedProviderAvailable && settingsAiProvider && (
                <div className="mt-2 text-xs text-rose-400">
                  Selected provider is not configured in `.env`
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

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                {integrations.map((integration) => (
                  <button
                    key={integration.id}
                    type="button"
                    onClick={() => integration.onChange(!integration.checked)}
                    title={integration.name}
                    className={`
                      group relative aspect-square rounded-lg p-3
                      flex items-center justify-center transition-all
                      ${integration.checked
                        ? 'bg-gradient-to-br from-purple-600/30 to-pink-600/20 border-2 border-purple-500/60 shadow-lg shadow-purple-500/20'
                        : 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-purple-500/40 hover:bg-slate-700/40'
                      }
                    `}
                  >
                    <img
                      src={integration.icon}
                      alt={integration.name}
                      className="w-full h-full object-contain"
                    />

                    <a
                      href={integration.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Open ${integration.name}`}
                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-md bg-slate-700/50 border border-slate-500/50 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/60 flex items-center justify-center transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 4h4M4 8V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2m-8 0H6a2 2 0 01-2-2v-2" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14L20 4m0 0h-6m6 0v6" />
                      </svg>
                    </a>
                    {integration.checked && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-lg">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
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
                        className="w-full h-full object-contain"
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

            {/* Authentication */}
            <section className="glass-panel rounded-xl border border-slate-700/40 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-1">Authentication</h2>
              <p className="text-xs text-slate-400 mb-4">Update your login credentials</p>

              <form onSubmit={(event) => void handleCredentialsSubmit(event)} className="grid md:grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Current Username</span>
                  <input
                    type="text"
                    value={currentUsername}
                    onChange={(event) => setCurrentUsername(event.target.value)}
                    autoComplete="username"
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">New Username</span>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(event) => setNewUsername(event.target.value)}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">Current Password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-slate-400 font-medium">New Password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>

                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={credentialsBusy}
                    className="px-4 py-2 rounded-md bg-cyan-600/80 hover:bg-cyan-500 text-white text-sm disabled:bg-slate-700/80 disabled:cursor-not-allowed"
                  >
                    {credentialsBusy ? 'Updating...' : 'Update Credentials'}
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="px-4 py-2 rounded-md bg-slate-700/80 hover:bg-slate-600 text-slate-100 text-sm"
                  >
                    Log Out
                  </button>
                  {credentialsSaved && <span className="text-xs text-cyan-300">Credentials updated</span>}
                  {credentialsError && <span className="text-xs text-rose-300">{credentialsError}</span>}
                </div>
              </form>
            </section>
          </div>
        )}
        </div>
      </div>
    </main>
  )
}
