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
  if (error) {
    return <div className="text-red-400">Error fetching queue: {error}</div>
  }
  if (!data) {
    return <div className="text-yellow-400">Loading queue...</div>
  }
  if (data.jobs.length === 0) {
    return <div className="text-gray-400">Nothing downloading</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPauseAll}
          disabled={actionBusy}
          className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
          title="Pause all"
          aria-label="Pause all"
        >
          ||
        </button>
        <button
          type="button"
          onClick={onResumeAll}
          disabled={actionBusy}
          className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
          title="Resume all"
          aria-label="Resume all"
        >
          {'>'}
        </button>
      </div>
      {data.jobs.map((job) => {
        const percent = Number(job.percentage) || 0
        const isPaused = job.status?.toLowerCase().includes('pause')
        return (
          <div key={job.name} className="glass-card rounded-lg p-3">
            <p className="text-sm truncate font-semibold" title={job.name}>{job.name}</p>
            <div className="text-xs text-gray-400 mt-1 flex justify-between">
              <span>{job.status}</span>
              <span>{job.eta} remaining</span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-2.5 mt-2">
              <div
                className="bg-cyan-500 h-2.5 rounded-full"
                style={{ width: `${percent}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-400 mt-1 flex justify-between items-center gap-2">
              <span>{percent}%</span>
              <span className="ml-auto">{job.size_remaining} / {job.size_total} MB</span>
            </div>
            {job.id && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isPaused ? onResumeJob(job.id as string) : onPauseJob(job.id as string))}
                  disabled={actionBusy}
                  className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
                  title={isPaused ? 'Resume' : 'Pause'}
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? '>' : '||'}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteJob(job.id as string)}
                  disabled={actionBusy}
                  className="text-xs px-2 py-1 rounded bg-slate-800/60 disabled:opacity-50"
                  title="Delete"
                  aria-label="Delete"
                >
                  X
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
