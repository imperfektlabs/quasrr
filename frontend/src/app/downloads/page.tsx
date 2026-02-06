'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useSabActions, useSabPolling, useClickOutside, useRandomLibraryPoster } from '@/hooks'
import { NavigationMenu, SabQueue, SabRecent } from '@/components'

export default function DownloadsPage() {
  const { config } = useBackendApiSetup()
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

  // Random library poster for background
  const randomPoster = useRandomLibraryPoster(Boolean(config))

  const {
    queue: sabQueue,
    recent: sabRecent,
    loading: sabLoading,
    queueError: sabQueueError,
    recentError: sabRecentError,
    refetch: fetchSabData,
  } = useSabPolling(sabConfigured, 2000, config?.sabnzbd?.recent_group_limit ?? 10)

  const {
    busy: sabActionBusy,
    pauseAll: pauseSabQueue,
    resumeAll: resumeSabQueue,
    pauseJob: pauseSabJob,
    resumeJob: resumeSabJob,
    deleteJob: deleteSabJob,
  } = useSabActions(fetchSabData)

  const queueSummary = (() => {
    if (!sabConfigured) return 'Not configured'
    if (sabQueueError) return `Error: ${sabQueueError}`
    if (!sabQueue) return 'Loading queue...'
    const activeCount = sabQueue.jobs.length
    return activeCount > 0 ? `${activeCount} active` : '0 active'
  })()

  const recentSummary = (() => {
    if (!sabConfigured) return 'Not configured'
    if (sabRecentError) return `Error: ${sabRecentError}`
    if (!sabRecent) return 'Loading recent...'
    const groupCount = sabRecent.groups.length
    return groupCount > 0 ? `${groupCount} group${groupCount === 1 ? '' : 's'}` : 'No recent downloads'
  })()

  const handlePauseAll = () => pauseSabQueue()
  const handleResumeAll = () => resumeSabQueue()
  const handlePauseJob = (jobId: string) => pauseSabJob(jobId)
  const handleResumeJob = (jobId: string) => resumeSabJob(jobId)
  const handleDeleteJob = (jobId: string) => deleteSabJob(jobId)

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
          currentPage="downloads"
          config={config}
        />

        <div className="max-w-5xl mx-auto">
        {!config ? (
          <div className="glass-panel rounded-lg p-6 text-center">
            <div className="text-slate-400 animate-pulse">Loading configuration...</div>
          </div>
        ) : (
          <section id="downloads" className="scroll-mt-24">
            {/* Page header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
                Download Activity
              </h1>
              <p className="text-slate-400 text-sm">Monitor your active downloads and recent completions</p>
            </div>
            {!sabConfigured ? (
              <div className="glass-panel rounded-lg p-8 text-center">
                <div className="max-w-md mx-auto space-y-3">
                  <div className="text-6xl opacity-30">📥</div>
                  <div className="text-lg font-semibold text-slate-300">SABnzbd Not Configured</div>
                  <div className="text-sm text-slate-400">Configure SABnzbd in your environment to track downloads</div>
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Queue Panel */}
                <div className="glass-panel rounded-xl overflow-hidden border border-slate-700/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all">
                  <div className="bg-gradient-to-r from-cyan-600/20 to-cyan-700/10 border-b border-slate-700/40 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                          <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4 4m0 0l4-4m-4 4V4" />
                          </svg>
                          <span>Active Queue</span>
                        </div>
                        <div className="text-sm text-cyan-300/80 mt-1">{queueSummary}</div>
                      </div>
                      <button
                        onClick={sabQueue?.paused ? handleResumeAll : handlePauseAll}
                        disabled={sabActionBusy}
                        className={`px-3 py-1.5 rounded-lg ${
                          sabQueue?.paused
                            ? 'bg-emerald-600/80 hover:bg-emerald-500'
                            : 'bg-amber-600/80 hover:bg-amber-500'
                        } disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5`}
                        title={sabQueue?.paused ? 'Resume queue' : 'Pause queue'}
                      >
                        {sabQueue?.paused ? (
                          <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            <span>Resume Queue</span>
                            <span className="text-2xs opacity-75">(Paused)</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>Pause Queue</span>
                            <span className="text-2xs opacity-75">(Active)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="p-4 overflow-hidden">
                    <SabQueue
                      data={sabQueue}
                      error={sabQueueError}
                      onRefresh={fetchSabData}
                      onPauseAll={handlePauseAll}
                      onResumeAll={handleResumeAll}
                      onPauseJob={handlePauseJob}
                      onResumeJob={handleResumeJob}
                      onDeleteJob={handleDeleteJob}
                      actionBusy={sabActionBusy}
                    />
                  </div>
                </div>

                {/* Recent Panel */}
                <div className="glass-panel rounded-xl overflow-hidden border border-slate-700/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all">
                  <div className="bg-gradient-to-r from-purple-600/20 to-purple-700/10 border-b border-slate-700/40 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Recent Completions</span>
                        </div>
                        <div className="text-sm text-purple-300/80 mt-1">{recentSummary}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 overflow-hidden">
                    <SabRecent data={sabRecent} error={sabRecentError} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
        </div>
      </div>
    </main>
  )
}
