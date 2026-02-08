'use client'

import { SearchIcon, ReelIcon } from './Icons'

type SeasonHeaderRowProps = {
  label: string
  countLabel: string
  onToggle: () => void
  isCollapsed: boolean
  onDelete?: () => void
  deleteDisabled?: boolean
}

export function SeasonHeaderRow({
  label,
  countLabel,
  onToggle,
  isCollapsed,
  onDelete,
  deleteDisabled = false,
}: SeasonHeaderRowProps) {
  return (
    <div className="glass-card rounded-lg px-4 py-3 text-sm hover:shadow-lg hover:shadow-cyan-500/10 transition-all border border-slate-700/40">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between text-left group"
        >
          <span className="font-semibold text-slate-100 group-hover:text-cyan-200 transition-colors flex items-center gap-2">
            <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▸</span>
            {label}
          </span>
          <span className="text-slate-400 text-xs px-2 py-0.5 rounded-full bg-slate-800/60">{countLabel}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            title={isCollapsed ? "Expand season" : "Collapse season"}
            aria-label={isCollapsed ? "Expand season" : "Collapse season"}
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg transition-all bg-cyan-600/80 text-white hover:bg-cyan-500 hover:shadow-md hover:shadow-cyan-500/30 active:scale-95"
          >
            {isCollapsed ? (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!onDelete || deleteDisabled}
            title="Delete all episodes"
            aria-label="Delete all episodes"
            className={`h-7 w-7 inline-flex items-center justify-center rounded-lg text-xs font-medium transition-all ${
              (!onDelete || deleteDisabled)
                ? 'bg-rose-900/40 text-slate-300 cursor-not-allowed'
                : 'bg-rose-500/80 text-white hover:bg-rose-500 hover:shadow-md hover:shadow-rose-500/30 active:scale-95'
            }`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

type EpisodeRowProps = {
  title: string
  dateLabel?: string
  statusIcon?: string
  statusClassName?: string
  statusTitle?: string
  onSearch?: () => void
  searchDisabled?: boolean
  searchLoading?: boolean
  searchActive?: boolean
  onDelete?: () => void
  deleteDisabled?: boolean
  onRowClick?: () => void
}

export function EpisodeRow({
  title,
  dateLabel,
  statusIcon,
  statusClassName = 'text-slate-500',
  statusTitle,
  onSearch,
  searchDisabled = false,
  searchLoading = false,
  searchActive = false,
  onDelete,
  deleteDisabled = false,
  onRowClick,
}: EpisodeRowProps) {
  const rowProps = onRowClick
    ? { role: 'button' as const, tabIndex: 0, onClick: onRowClick }
    : {}

  return (
    <div
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 rounded-md transition-all ${
        onRowClick ? 'hover:bg-slate-800/40 cursor-pointer' : ''
      }`}
      {...rowProps}
    >
      <div className="min-w-0 flex items-center gap-2">
        <span className={`text-base w-5 text-center ${statusClassName}`} title={statusTitle || ''}>
          {statusIcon || ''}
        </span>
        <span className="block truncate text-slate-200 text-sm" title={title}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        {dateLabel && (
          <span className="text-slate-400 text-2xs w-[72px] text-right tabular-nums">
            {dateLabel}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSearch?.()
          }}
          disabled={!onSearch || searchDisabled}
          title={searchActive ? "Hide releases" : "Search for episode"}
          aria-label={searchActive ? "Hide releases" : "Search for episode"}
          className={`h-6 w-6 inline-flex items-center justify-center rounded-md transition-all ${
            searchActive
              ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 shadow-sm'
              : (!onSearch || searchDisabled)
                ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                : 'bg-slate-700/60 text-slate-300 hover:bg-cyan-600/80 hover:text-white hover:shadow-md hover:shadow-cyan-500/20'
          }`}
        >
          {searchActive ? (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : searchLoading ? (
            <ReelIcon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SearchIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!onDelete || deleteDisabled}
          title="Delete episode"
          aria-label="Delete episode"
          className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded-md transition-all ${
            (!onDelete || deleteDisabled)
              ? 'bg-rose-900/40 text-slate-300 cursor-not-allowed'
              : 'bg-rose-500/70 text-white hover:bg-rose-500 hover:shadow-md hover:shadow-rose-500/20'
          }`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
