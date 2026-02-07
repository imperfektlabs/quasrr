'use client'

import type { ReactNode } from 'react'

type SearchPanelToggle = {
  onClick: () => void
  title: string
  ariaLabel: string
  icon: ReactNode
}

type SearchPanelProps = {
  stickyClass: string
  headerTitle: ReactNode
  headerCount?: ReactNode
  headerRight?: ReactNode
  headerRightInline?: ReactNode
  children: ReactNode
  toggle?: SearchPanelToggle
}

export function SearchPanel({
  stickyClass,
  headerTitle,
  headerCount,
  headerRight,
  headerRightInline,
  children,
  toggle,
}: SearchPanelProps) {
  return (
    <div className={`${stickyClass} z-20`}>
      <div className="glass-panel rounded-lg p-3 mb-4 relative">
        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-base font-semibold text-slate-100">{headerTitle}</span>
              {headerCount ? (
                <span className="text-xl font-semibold text-slate-100">{headerCount}</span>
              ) : null}
            </div>
            {headerRightInline ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                {headerRightInline}
              </div>
            ) : null}
          </div>
          {headerRight ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              {headerRight}
            </div>
          ) : null}
        </div>

        <div className="mt-2 space-y-3">
          {children}
        </div>

        {toggle ? (
          <button
            type="button"
            onClick={toggle.onClick}
            className="absolute bottom-2 right-2 text-slate-400 hover:text-cyan-200 transition-colors"
            title={toggle.title}
            aria-label={toggle.ariaLabel}
          >
            {toggle.icon}
          </button>
        ) : null}
      </div>
    </div>
  )
}
