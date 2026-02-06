'use client'

import { useRef, useState } from 'react'

import { useBackendApiSetup, useSabActions, useSabPolling, useClickOutside } from '@/hooks'
import { NavigationMenu, SabQueue, SabRecent } from '@/components'

export default function DownloadsPage() {
  const { config } = useBackendApiSetup()
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)

  useClickOutside([menuButtonRef, menuPanelRef], () => setMenuOpen(false), menuOpen)

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
    <main className="min-h-screen pt-16 px-4 pb-4 md:px-8 md:pb-8">
      <NavigationMenu
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuButtonRef={menuButtonRef}
        menuPanelRef={menuPanelRef}
        currentPage="downloads"
        config={config}
      />

      <div className="max-w-6xl mx-auto">
        {!config ? (
          <div className="glass-panel rounded-lg p-6 text-center">
            <div className="text-slate-400 animate-pulse">Loading configuration...</div>
          </div>
        ) : (
          <section id="downloads" className="scroll-mt-24">
            {/* Page header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  Download Activity
                </h1>
                <button
                  onClick={() => fetchSabData(false)}
                  disabled={!sabConfigured || sabLoading}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600/80 to-purple-600/70 hover:from-cyan-500/90 hover:to-purple-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
                >
                  {sabLoading ? (
                    <>
                      <span className="inline-block animate-spin">⟳</span>
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </>
                  )}
                </button>
              </div>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span>Active Queue</span>
                        </div>
                        <div className="text-sm text-cyan-300/80 mt-1">{queueSummary}</div>
                      </div>
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
    </main>
  )
}
