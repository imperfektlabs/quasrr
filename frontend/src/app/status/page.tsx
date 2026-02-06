'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useClickOutside, useRandomLibraryPoster } from '@/hooks'
import { NavigationMenu } from '@/components'
import { getLocalToolUrl } from '@/utils/backend'
import { getStreamingLogo } from '@/utils/streaming'

export default function StatusPage() {
  const { health, config, integrationsStatus, error, loading } = useBackendApiSetup()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const [expandedHealth, setExpandedHealth] = useState<Record<string, boolean>>({})

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  // Random library poster for background
  const randomPoster = useRandomLibraryPoster(Boolean(config))

  const buildAlertUrl = (baseUrl: string | undefined, alertPath: string) => {
    if (!baseUrl) return ''
    const [pathPart, hashPart] = alertPath.split('#')
    try {
      const url = new URL(baseUrl)
      const basePath = url.pathname.replace(/\/$/, '')
      const suffix = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
      url.pathname = `${basePath}${suffix}`
      url.search = ''
      url.hash = hashPart ? `#${hashPart}` : ''
      return url.toString()
    } catch {
      const trimmed = baseUrl.replace(/\/$/, '')
      const suffix = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
      return `${trimmed}${suffix}${hashPart ? `#${hashPart}` : ''}`
    }
  }

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
          currentPage="status"
          config={config}
        />

        <div className="max-w-5xl mx-auto">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
              System Status
            </h1>
            <div className="flex items-center gap-2">
              {health?.status === 'ok' ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm text-emerald-300">All systems operational</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-sm text-amber-300">Checking connections...</span>
                </>
              )}
            </div>
          </div>

        <section id="status" className="scroll-mt-24">
          <details className="glass-panel rounded-xl border border-slate-700/40" open>
            <summary className="p-5 cursor-pointer font-semibold text-lg hover:text-cyan-300 transition-colors flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              System Overview
            </summary>

            <div className="p-4 pt-0 space-y-4">
              {loading && <div className="text-yellow-400">Checking backend...</div>}

              {!loading && error && (
                <div className="text-red-400">Error: {error}</div>
              )}

              {config && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">Configuration</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Country:</span> {config.user.country}</div>
                      <div><span className="text-gray-500">AI:</span> {config.ai.provider}</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 my-4" />

                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">Integrations</h3>
                    <div className="space-y-2 text-sm">
                      {[
                        {
                          key: 'sonarr',
                          label: 'Sonarr',
                          configured: Boolean(config.integrations.sonarr_url),
                          status: integrationsStatus?.sonarr,
                          baseUrl: config.integrations.sonarr_url || getLocalToolUrl(8989),
                          alertPath: '/system/status',
                        },
                        {
                          key: 'radarr',
                          label: 'Radarr',
                          configured: Boolean(config.integrations.radarr_url),
                          status: integrationsStatus?.radarr,
                          baseUrl: config.integrations.radarr_url || getLocalToolUrl(7878),
                          alertPath: '/system/status',
                        },
                        {
                          key: 'sabnzbd',
                          label: 'SABnzbd',
                          configured: Boolean(config.integrations.sabnzbd_url),
                          status: integrationsStatus?.sabnzbd,
                          baseUrl: config.integrations.sabnzbd_url || getLocalToolUrl(8080),
                          alertPath: '/warnings',
                        },
                        {
                          key: 'plex',
                          label: 'Plex',
                          configured: Boolean(config.integrations.plex_url),
                          status: integrationsStatus?.plex,
                          baseUrl: config.integrations.plex_url || getLocalToolUrl(32400, '/web'),
                          alertPath: (config.integrations.plex_url || '').includes('/web')
                            ? '/index.html#!/settings/server/alerts'
                            : '/web/index.html#!/settings/server/alerts',
                        },
                      ].map((item) => {
                        const status = item.status?.status
                        const isConfigured = item.configured
                        const isOk = status === 'ok'
                        const statusLabel = !isConfigured
                          ? 'Not set'
                          : (isOk ? 'Connected' : (status ? 'Error' : 'Checking...'))
                        const statusClass = !isConfigured
                          ? 'text-gray-600'
                          : (isOk ? 'text-green-400' : 'text-red-400')
                        const healthIssues = item.status?.health || []
                        const warnings = item.status?.warnings || []
                        const alerts = healthIssues.length > 0 ? healthIssues : warnings
                        const alertsTitle = healthIssues.length > 0
                          ? 'Health issues'
                          : (item.key === 'plex' ? 'Alerts' : 'Warnings')
                        const alertsTone = healthIssues.length > 0 ? 'text-amber-300' : 'text-amber-300'
                        const alertsKey = `alerts-${item.key}`
                        const alertsExpanded = Boolean(expandedHealth[alertsKey])
                        const visibleAlerts = alertsExpanded ? alerts : alerts.slice(0, 2)
                        const meta = !isConfigured
                          ? 'Not configured'
                          : (isOk
                            ? `Version ${item.status?.version || 'unknown'}`
                            : (item.status?.message || 'Unable to reach service'))
                        const alertUrl = isConfigured ? buildAlertUrl(item.baseUrl, item.alertPath) : ''
                        return (
                          <div
                            key={item.key}
                            className="rounded-md border border-slate-800/60 bg-slate-900/40 px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              {alertUrl ? (
                                <a
                                  href={alertUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-200 hover:text-cyan-200 transition-colors"
                                >
                                  {item.label}
                                </a>
                              ) : (
                                <span>{item.label}</span>
                              )}
                              <span className={statusClass}>{statusLabel}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{meta}</div>
                            {alerts.length > 0 && (
                              <div className="mt-2 grid gap-1 text-xs">
                                <div className={`${alertsTone} font-semibold`}>
                                  {alertsTitle} ({alerts.length})
                                </div>
                                {visibleAlerts.map((issue, index) => {
                                  const level = (issue.level || '').toLowerCase()
                                  const levelClass = level.includes('error') ? 'text-red-300' : 'text-amber-300'
                                  return (
                                    <div
                                      key={`${item.key}-alert-${index}`}
                                      className={`truncate ${levelClass}`}
                                      title={issue.message || ''}
                                    >
                                      {issue.message || 'Unknown issue'}
                                    </div>
                                  )
                                })}
                                {alerts.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedHealth((prev) => ({
                                        ...prev,
                                        [alertsKey]: !alertsExpanded,
                                      }))
                                    }}
                                    className="text-amber-200/80 hover:text-amber-200 underline decoration-dotted text-left"
                                  >
                                    {alertsExpanded
                                      ? 'Show fewer'
                                      : `+${alerts.length - 2} more`}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div className="rounded-md border border-slate-800/60 bg-slate-900/30 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span>TMDB</span>
                          <span className={config.integrations.tmdb_api_key ? 'text-green-400' : 'text-gray-600'}>
                            {config.integrations.tmdb_api_key ? 'Connected' : 'Not set'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {config.integrations.tmdb_api_key ? 'API key configured' : 'API key missing'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 my-4" />

                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">Streaming Services</h3>
                    <div className="flex flex-wrap gap-2">
                      {config.streaming_services.filter((service) => service.enabled).length === 0 && (
                        <span className="text-xs text-gray-500">None enabled</span>
                      )}
                      {config.streaming_services.filter((service) => service.enabled).map((service) => (
                        <span
                          key={service.id}
                          className="inline-flex items-center gap-2 text-xs"
                        >
                          {getStreamingLogo(service.id) ? (
                            <img
                              src={getStreamingLogo(service.id)}
                              alt={service.name}
                              className="h-4 w-4 object-contain"
                            />
                          ) : (
                            <span className="text-gray-500 text-xs">?</span>
                          )}
                          <span>{service.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>
        </section>
        </div>
      </div>
    </main>
  )
}
