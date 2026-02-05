import { useState } from 'react'
import type { SabQueueResponse } from '@/types'

export function SabQueue({
  data,
  error,
  onRefresh,
  onPauseAll,
  onResumeAll,
  onPauseJob,
  onResumeJob,
  onDeleteJob,
  actionBusy,
}: {
  data: SabQueueResponse | null
  error: string | null
  onRefresh: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onPauseJob: (jobId: string) => void
  onResumeJob: (jobId: string) => void
  onDeleteJob: (jobId: string) => void
  actionBusy: boolean
}) {
  const [confirmAction, setConfirmAction] = useState<{
    type: 'pauseAll' | 'pause' | 'delete'
    jobId?: string
    jobName?: string
  } | null>(null)

  const buildLibraryUrl = ({
    mediaType,
    title,
    season,
    episode,
  }: {
    mediaType: 'movie' | 'tv' | 'unknown'
    title: string
    season?: number
    episode?: number
  }) => {
    const params = new URLSearchParams()
    if (mediaType === 'tv') params.set('type', 'tv')
    if (mediaType === 'movie') params.set('type', 'movies')
    if (title) params.set('q', title)
    if (typeof season === 'number') params.set('season', season.toString())
    if (typeof episode === 'number') params.set('episode', episode.toString())
    const query = params.toString()
    return query ? `/library?${query}` : '/library'
  }

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'pauseAll') {
      onPauseAll()
    }
    if (confirmAction.type === 'pause' && confirmAction.jobId) {
      onPauseJob(confirmAction.jobId)
    }
    if (confirmAction.type === 'delete' && confirmAction.jobId) {
      onDeleteJob(confirmAction.jobId)
    }
    setConfirmAction(null)
  }

  const handleCancel = () => {
    setConfirmAction(null)
  }

  if (error) {
    return <div className="text-red-400 text-sm">Error fetching queue: {error}</div>
  }
  if (!data) {
    return <div className="text-yellow-400 text-sm">Loading queue...</div>
  }
  if (data.jobs.length === 0) {
    return <div className="text-gray-400 text-sm">Nothing downloading</div>
  }

  const queuePaused = Boolean(data.paused)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {confirmAction?.type === 'pauseAll' ? (
          <div className="flex items-center gap-2 mr-auto text-xs text-amber-200">
            <span>Pause all downloads?</span>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={actionBusy}
              className="px-2.5 py-1 rounded-lg bg-amber-500/80 text-white hover:bg-amber-500 transition-smooth disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={actionBusy}
              className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-smooth disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : queuePaused ? (
          <div className="mr-auto text-xs text-amber-200 flex items-center gap-2">
            <span>Queue paused</span>
            <span className="glass-chip px-2 py-0.5 rounded text-2xs">Resume to continue</span>
          </div>
        ) : (
          <div className="mr-auto"></div>
        )}
        <button
          type="button"
          onClick={() => setConfirmAction({ type: 'pauseAll' })}
          disabled={actionBusy}
          className={`text-xs px-3 py-1.5 rounded-lg transition-smooth disabled:opacity-50 hover:scale-105 ${
            queuePaused ? 'bg-amber-500/70 text-white hover:bg-amber-500' : 'bg-slate-800/60 hover:bg-slate-700/60'
          }`}
          title="Pause all"
          aria-label="Pause all"
        >
          ||
        </button>
        <button
          type="button"
          onClick={onResumeAll}
          disabled={actionBusy}
          className={`text-xs px-3 py-1.5 rounded-lg transition-smooth disabled:opacity-50 hover:scale-105 ${
            queuePaused ? 'bg-cyan-500/70 text-white hover:bg-cyan-400 hover:shadow-glow-cyan' : 'bg-slate-800/60 hover:bg-slate-700/60'
          }`}
          title="Resume all"
          aria-label="Resume all"
        >
          {'>'}
        </button>
      </div>
      {data.jobs.map((job) => {
        const percent = Number(job.percentage) || 0
        const isPaused = job.status?.toLowerCase().includes('pause')
        const isConfirmingPause = confirmAction?.type === 'pause' && confirmAction.jobId === job.id
        const isConfirmingDelete = confirmAction?.type === 'delete' && confirmAction.jobId === job.id
        return (
          <div key={job.name} className="glass-card rounded-lg p-3 transition-smooth hover:border-slate-300/50">
            <a
              href={buildLibraryUrl({
                mediaType: job.mediaType,
                title: job.parsedTitle || job.name,
                season: job.season,
                episode: job.episode,
              })}
              className="text-sm truncate font-semibold text-slate-100 hover:text-cyan-200 transition-colors block"
              title={job.name}
            >
              {job.name}
            </a>
            <div className="text-2xs text-gray-400 mt-1.5 flex justify-between items-center">
              <span className="capitalize">{job.status}</span>
              <span>{job.eta} remaining</span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-2.5 mt-2.5 overflow-hidden relative">
              <div
                className="bg-gradient-to-r from-cyan-500 to-cyan-400 h-2.5 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                style={{ width: `${percent}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
              </div>
            </div>
            <div className="text-2xs text-gray-400 mt-1.5 flex justify-between items-center">
              <span className="font-medium text-cyan-200">{percent}%</span>
              <span className="ml-auto">{job.size_remaining} / {job.size_total} MB</span>
            </div>
            {job.id && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isPaused) {
                      onResumeJob(job.id as string)
                      return
                    }
                    setConfirmAction({
                      type: 'pause',
                      jobId: job.id as string,
                      jobName: job.name,
                    })
                  }}
                  disabled={actionBusy}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-smooth disabled:opacity-50 hover:scale-105 ${
                    isPaused ? 'bg-amber-500/70 text-white hover:bg-amber-500' : 'bg-slate-800/60 hover:bg-slate-700/60'
                  }`}
                  title={isPaused ? 'Resume' : 'Pause'}
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? '>' : '||'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({
                      type: 'delete',
                      jobId: job.id as string,
                      jobName: job.name,
                    })
                  }
                  disabled={actionBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-smooth disabled:opacity-50 hover:scale-105"
                  title="Delete"
                  aria-label="Delete"
                >
                  X
                </button>
              </div>
            )}
            {(isConfirmingPause || isConfirmingDelete) && (
              <div className="mt-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
                <span>
                  {isConfirmingDelete ? 'Delete' : 'Pause'} "{job.name}"?
                </span>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={actionBusy}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/80 text-white hover:bg-amber-500 transition-smooth disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={actionBusy}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-smooth disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
