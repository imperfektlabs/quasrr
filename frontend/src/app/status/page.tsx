'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useClickOutside } from '@/hooks'
import { NavigationMenu } from '@/components'
import { getLocalToolUrl } from '@/utils/backend'

export default function StatusPage() {
  const { health, config, integrationsStatus, error, loading } = useBackendApiSetup()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const [expandedHealth, setExpandedHealth] = useState<Record<string, boolean>>({})

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

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
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8">
      <div>
        <NavigationMenu
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          menuButtonRef={menuButtonRef}
          menuPanelRef={menuPanelRef}
          currentPage="status"
          config={config}
        />

        <div className="max-w-7xl mx-auto">
        <section id="status" className="scroll-mt-24">
          <details className="glass-panel rounded-xl border border-slate-700/40" open>
            <summary className="p-5 cursor-pointer font-semibold text-lg hover:text-cyan-300 transition-colors flex items-center gap-3">
              {health?.status === 'ok' ? (
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              <span>System Status</span>
              {health?.status === 'ok' ? (
                <span className="text-sm text-emerald-300 font-normal ml-auto">All systems operational</span>
              ) : (
                <span className="text-sm text-amber-300 font-normal ml-auto">Checking connections...</span>
              )}
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
