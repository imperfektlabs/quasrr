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

      <div className="max-w-5xl mx-auto">
        {!config ? (
          <div className="glass-panel rounded-lg p-4 text-gray-400">
            Loading configuration...
          </div>
        ) : (
          <section id="downloads" className="scroll-mt-24 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Download Activity</h2>
              <button
                onClick={() => fetchSabData(false)}
                disabled={!sabConfigured || sabLoading}
                className="px-3 py-1.5 rounded bg-slate-800/60 disabled:opacity-50 text-xs"
              >
                {sabLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {!sabConfigured ? (
              <div className="glass-panel rounded-lg p-4 text-gray-400">
                SABnzbd not configured
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="glass-panel rounded-lg overflow-hidden">
                  <div className="w-full text-left p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-md font-semibold">Queue</div>
                      <div className="text-xs text-gray-400 truncate">{queueSummary}</div>
                    </div>
                  </div>
                  <div className="px-3 pb-3 overflow-hidden">
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
                <div className="glass-panel rounded-lg overflow-hidden">
                  <div className="w-full text-left p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-md font-semibold">Recent</div>
                      <div className="text-xs text-gray-400 truncate">{recentSummary}</div>
                    </div>
                  </div>
                  <div className="px-3 pb-3 overflow-hidden">
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
