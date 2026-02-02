'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { StreamingService, ConfigStatus } from '@/types'
import { getStreamingLogo, getStreamingLink } from '@/utils/streaming'

type MenuItem = {
  key: string
  label: string
  icon: React.ReactNode
  onClick?: () => void
  href?: string
  active?: boolean
  variant?: 'button' | 'link'
}

export type NavigationMenuProps = {
  // Menu state
  menuOpen: boolean
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  menuButtonRef: React.RefObject<HTMLButtonElement>
  menuPanelRef: React.RefObject<HTMLDivElement>

  // Page context
  currentPage: 'home' | 'library' | 'downloads' | 'status' | 'settings'

  // Data for menu items (accepts ConfigStatus from main page or simplified config from library pages)
  config?: (ConfigStatus | {
    streaming_services?: StreamingService[]
    integrations?: {
      sonarr_url?: string
      radarr_url?: string
      sabnzbd_url?: string
    }
  }) | null

  // Home button handler (optional, for custom behavior)
  onHomeClick?: () => void
}

export function NavigationMenu({
  menuOpen,
  setMenuOpen,
  menuButtonRef,
  menuPanelRef,
  currentPage,
  config,
  onHomeClick,
}: NavigationMenuProps) {
  const router = useRouter()

  const enabledStreamingServices = config?.streaming_services?.filter((service) => service.enabled) || []

  const handleHomeClick = () => {
    if (onHomeClick) {
      onHomeClick()
    } else {
      router.push('/')
    }
    setMenuOpen(false)
  }
  const handleNavigate = (path: '/' | '/downloads' | '/status' | '/settings') => {
    router.push(path)
    setMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 pt-1">
      <div className="max-w-5xl mx-auto">
        <div className="glass-panel rounded-2xl border border-slate-700/40 shadow-[0_18px_45px_rgba(3,6,20,0.5)] px-3 md:px-4 py-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            onMouseEnter={() => setMenuOpen(true)}
            className="px-2 py-2 rounded bg-slate-800/60 text-slate-200 inline-flex items-center"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            ref={menuButtonRef}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleHomeClick}
            className="text-lg md:text-xl font-semibold tracking-wide hover:text-cyan-300 transition-colors"
            title="Go home"
          >
            Quasrr
          </button>
        </div>

        {menuOpen && (
          <div
            ref={menuPanelRef}
            onMouseLeave={() => setMenuOpen(false)}
            className="mt-2 glass-panel rounded-2xl border border-slate-700/40 shadow-[0_18px_45px_rgba(3,6,20,0.5)] p-3 grid gap-2 text-sm text-slate-200"
          >
          {/* Home Button */}
          <button
            type="button"
            onClick={handleHomeClick}
            className="px-3 py-2 rounded inline-flex items-center gap-2 text-left bg-slate-800/50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12l9-9 9 9" />
              <path d="M5 10v10h14V10" />
            </svg>
            <span>Home</span>
          </button>

          {/* Main Navigation Sections */}
          <button
            type="button"
            onClick={() => handleNavigate('/')}
            className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
              currentPage === 'home' ? 'bg-slate-700/60' : 'bg-slate-800/50'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <span>Search</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/downloads')}
            className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
              currentPage === 'downloads' ? 'bg-slate-700/60' : 'bg-slate-800/50'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            <span>Download Activity</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/status')}
            className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
              currentPage === 'status' ? 'bg-slate-700/60' : 'bg-slate-800/50'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h4l2-4 4 8 2-4h4" />
            </svg>
            <span>System Status</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigate('/settings')}
            className={`px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
              currentPage === 'settings' ? 'bg-slate-700/60' : 'bg-slate-800/50'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
            <span>Settings</span>
          </button>

          {/* Library Section */}
          <div className="border-t border-slate-700/40 pt-2 mt-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Library</div>
            <Link
              href="/library"
              onClick={() => setMenuOpen(false)}
              className={`mt-2 px-3 py-2 rounded inline-flex items-center gap-2 text-left ${
                currentPage === 'library'
                  ? 'bg-slate-700/60'
                  : 'bg-slate-800/50 hover:bg-slate-700/60'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>Library</span>
            </Link>
          </div>

          {/* Streaming Services Section */}
          <div className="border-t border-slate-700/40 pt-2 mt-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Streaming Services</div>
            {enabledStreamingServices.length === 0 ? (
              <span className="mt-2 px-3 py-2 text-xs text-slate-500">None enabled</span>
            ) : (
              enabledStreamingServices.map((service) => {
                const link = getStreamingLink(service.id)
                  || `https://www.${service.id.replace(/_/g, '')}.com`
                return (
                  <a
                    key={service.id}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="mt-2 px-3 py-2 rounded inline-flex items-center gap-2 text-left bg-slate-800/50 hover:bg-slate-700/60"
                  >
                    {getStreamingLogo(service.id) ? (
                      <img
                        src={getStreamingLogo(service.id)}
                        alt={service.name}
                        className="h-4 w-4 object-contain"
                      />
                    ) : (
                      <span className="text-gray-500 text-xs">?</span>
                    )}
                    <span>{service.name}</span>
                  </a>
                )
              })
            )}
          </div>
          </div>
        )}
      </div>
    </header>
  )
}
