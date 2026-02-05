'use client'

import { SearchIcon } from './Icons'

type SeasonHeaderRowProps = {
  label: string
  countLabel: string
  onToggle: () => void
  isCollapsed: boolean
  onSearch?: () => void
  searchDisabled?: boolean
  onDelete?: () => void
  deleteDisabled?: boolean
}

export function SeasonHeaderRow({
  label,
  countLabel,
  onToggle,
  isCollapsed,
  onSearch,
  searchDisabled = false,
  onDelete,
  deleteDisabled = false,
}: SeasonHeaderRowProps) {
  return (
    <div className="glass-card rounded-md px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between text-left"
        >
          <span>{label}</span>
          <span className="text-slate-300">{countLabel}</span>
        </button>
        <div className="grid grid-cols-[auto_auto_auto_auto] items-center justify-end gap-2 text-slate-500">
          <span className="w-[72px]" />
          <span className="w-4" />
          <button
            type="button"
            onClick={onSearch}
            disabled={!onSearch || searchDisabled}
            title={isCollapsed ? 'Show' : 'Hide'}
            aria-label={isCollapsed ? 'Show' : 'Hide'}
            className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded border ${
              isCollapsed
                ? 'bg-slate-800/60 text-slate-200 border-transparent'
                : 'bg-emerald-500/25 text-emerald-100 border-emerald-300/40'
            } ${(!onSearch || searchDisabled)
              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
              : 'hover:bg-slate-700/60'
            }`}
          >
            <SearchIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!onDelete || deleteDisabled}
            title="Delete"
            aria-label="Delete"
            className={`h-6 w-6 inline-flex items-center justify-center rounded bg-rose-500/70 text-white text-xs font-medium transition-colors ${
              (!onDelete || deleteDisabled)
                ? 'bg-rose-900/40 text-slate-300 cursor-not-allowed'
                : 'hover:bg-rose-500/80'
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
  searchActive = false,
  onDelete,
  deleteDisabled = false,
  onRowClick,
}: EpisodeRowProps) {
  const rowProps = onRowClick
    ? { role: 'button' as const, tabIndex: 0, onClick: onRowClick }
    : {}

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3" {...rowProps}>
      <div className="min-w-0">
        <span className="block truncate" title={title}>
          {title}
        </span>
      </div>
      <div className="grid grid-cols-[auto_auto_auto_auto] items-center justify-end gap-2 text-slate-500">
        <span className="text-slate-400 w-[72px] text-right">{dateLabel || ''}</span>
        <span className={`text-xs w-4 text-center ${statusClassName}`} title={statusTitle || ''}>
          {statusIcon || ''}
        </span>
        <button
          type="button"
          onClick={onSearch}
          disabled={!onSearch || searchDisabled}
          title="Search"
          aria-label="Search"
          className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded border transition-colors ${
            searchActive
              ? 'bg-emerald-500/25 text-emerald-100 border-emerald-300/40'
              : 'bg-slate-800/60 text-slate-200 border-transparent'
          } ${(!onSearch || searchDisabled)
            ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
            : 'hover:bg-slate-700/60'
          }`}
        >
          <SearchIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!onDelete || deleteDisabled}
          title="Delete"
          aria-label="Delete"
          className={`h-6 w-6 inline-flex items-center justify-center text-xs rounded bg-rose-500/70 text-white transition-colors ${
            (!onDelete || deleteDisabled)
              ? 'bg-rose-900/40 text-slate-300 cursor-not-allowed'
              : 'hover:bg-rose-500/80'
          }`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
