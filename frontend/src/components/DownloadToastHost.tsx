'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useBackendApiSetup, useSabActions, useSabPolling } from '@/hooks'
import type { SabQueueItem } from '@/types'

const TOAST_EVENT = 'quasrr:download-toast'

type DownloadToastEvent = {
  status: 'success' | 'error'
  message: string
  title?: string
  releaseTitle?: string
  mediaType?: 'movie' | 'tv'
  season?: number
  episode?: number
  count?: number
}

type DownloadToast = {
  id: string
  status: 'success' | 'error'
  message: string
  title?: string
  releaseTitle?: string
  mediaType?: 'movie' | 'tv'
  season?: number
  episode?: number
  count?: number
  createdAt: number
  expiresAt: number
  jobId?: string
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const getToastId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const parsePercentage = (value: string | undefined) => {
  if (!value) return null
  const cleaned = value.replace('%', '').trim()
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const matchesJob = (toast: DownloadToast, job: SabQueueItem) => {
  if (toast.mediaType === 'tv' && toast.season && toast.episode) {
    if (job.season === toast.season && job.episode === toast.episode) return true
  }
  const candidates = [toast.title, toast.releaseTitle].filter(Boolean) as string[]
  if (candidates.length === 0) return false
  const jobName = normalize(job.parsedTitle || job.name)
  return candidates.some((value) => jobName.includes(normalize(value)))
}

export function DownloadToastHost() {
  const { config } = useBackendApiSetup()
  const sabConfigured = Boolean(config?.integrations.sabnzbd_url)

  const [toasts, setToasts] = useState<DownloadToast[]>([])
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const sabPollingEnabled = sabConfigured && toasts.some((toast) => toast.status === 'success')

  const {
    queue: sabQueue,
    loading: sabLoading,
    refetch: fetchSabData,
  } = useSabPolling(sabPollingEnabled, 2000, config?.sabnzbd?.recent_group_limit ?? 10)

  const {
    busy: sabActionBusy,
    pauseJob: pauseSabJob,
    resumeJob: resumeSabJob,
    deleteJob: deleteSabJob,
  } = useSabActions(fetchSabData)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DownloadToastEvent>).detail
      if (!detail) return
      const now = Date.now()
      const timeoutMs = detail.status === 'error' ? 10_000 : 30_000
      const toast: DownloadToast = {
        id: getToastId(),
        status: detail.status,
        message: detail.message,
        title: detail.title,
        releaseTitle: detail.releaseTitle,
        mediaType: detail.mediaType,
        season: detail.season,
        episode: detail.episode,
        count: detail.count,
        createdAt: now,
        expiresAt: now + timeoutMs,
      }
      setToasts((prev) => [toast, ...prev].slice(0, 4))
    }

    window.addEventListener(TOAST_EVENT, handler as EventListener)
    return () => window.removeEventListener(TOAST_EVENT, handler as EventListener)
  }, [])

  useEffect(() => {
    if (!sabQueue?.jobs) return

    setToasts((prev) => prev.map((toast) => {
      if (toast.jobId || toast.status !== 'success') return toast
      const match = sabQueue.jobs.find((job) => matchesJob(toast, job))
      if (!match?.id) return toast
      return { ...toast, jobId: match.id }
    }))
  }, [sabQueue])

  useEffect(() => {
    if (toasts.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((toast) => toast.expiresAt > now))
    }, 1000)
    return () => clearInterval(interval)
  }, [toasts.length])

  useEffect(() => {
    if (!sabQueue?.jobs) return
    setToasts((prev) => prev.map((toast) => {
      if (!toast.jobId) return toast
      const stillQueued = sabQueue.jobs.some((job) => job.id === toast.jobId)
      if (stillQueued) return toast
      const nextExpiry = Math.min(toast.expiresAt, Date.now() + 5000)
      return { ...toast, expiresAt: nextExpiry }
    }))
  }, [sabQueue])

  const queueMap = useMemo(() => {
    const map = new Map<string, SabQueueItem>()
    sabQueue?.jobs?.forEach((job) => {
      if (job.id) map.set(job.id, job)
    })
    return map
  }, [sabQueue])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => {
        const job = toast.jobId ? queueMap.get(toast.jobId) : undefined
        const percent = parsePercentage(job?.percentage)
        const titleLine = toast.title || toast.releaseTitle || 'Download queued'
        const showActions = sabConfigured && Boolean(job?.id)
        const isPaused = Boolean(job?.status && job.status.toLowerCase().includes('paused'))

        return (
          <div
            key={toast.id}
            className="glass-panel rounded-lg p-3 w-80 max-w-[calc(100vw-2rem)] shadow-lg border border-slate-700/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">
                  {toast.status === 'error' ? 'Grab failed' : titleLine}
                </div>
                <div className={`text-xs ${toast.status === 'error' ? 'text-amber-300' : 'text-slate-300'}`}>
                  {toast.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="h-6 w-6 inline-flex items-center justify-center text-slate-400 hover:text-slate-200"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>

            {toast.status === 'success' && (
              <div className="mt-2 space-y-2">
                {sabConfigured ? (
                  job ? (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{job.status}</span>
                        <span>{job.eta}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-800/60 overflow-hidden">
                        <div
                          className="h-full bg-cyan-500/80"
                          style={{ width: `${percent ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{job.size_remaining} left</span>
                        <span>{job.speed}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">
                      {sabLoading ? 'Waiting for SABnzbd…' : 'Queued with SABnzbd'}
                    </div>
                  )
                ) : (
                  <div className="text-xs text-slate-400">SABnzbd not configured.</div>
                )}

                {showActions && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={sabActionBusy}
                      onClick={() => {
                        if (!job?.id) return
                        if (isPaused) resumeSabJob(job.id)
                        else pauseSabJob(job.id)
                      }}
                      className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-50"
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      disabled={sabActionBusy}
                      onClick={() => job?.id && deleteSabJob(job.id)}
                      className="px-2 py-1 rounded bg-rose-500/70 hover:bg-rose-500/80 text-white disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      disabled={sabActionBusy}
                      onClick={() => fetchSabData(false)}
                      className="ml-auto px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                )}
                {!showActions && sabConfigured && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Actions available once SAB picks up the job.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
