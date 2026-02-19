'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type Command = {
  id: string
  label: string
  path: string
  aliases: string[]
  shortcutLabel: string
  hotkeyCode: string
}

type ResultItem = {
  kind: 'command' | 'search'
  id: string
  label: string
  path: string
  shortcutLabel?: string
  queryValue?: string
  score: number
}

const PALETTE_AI_QUERY_KEY = 'quasrr.palette.ai_query'
const PALETTE_AI_EVENT = 'quasrr:palette-ai-search'

const COMMANDS: Command[] = [
  {
    id: 'search-home',
    label: 'Search (Home)',
    path: '/',
    aliases: ['search', 'home', 'discover', 'browse'],
    shortcutLabel: 'Ctrl/Cmd+Shift+H',
    hotkeyCode: 'KeyH',
  },
  {
    id: 'library',
    label: 'Library',
    path: '/library',
    aliases: ['library', 'collection', 'lib'],
    shortcutLabel: 'Ctrl/Cmd+Shift+I',
    hotkeyCode: 'KeyI',
  },
  {
    id: 'movies',
    label: 'Movies',
    path: '/library?type=movies',
    aliases: ['movies', 'films', 'movie library'],
    shortcutLabel: 'Ctrl/Cmd+Shift+M',
    hotkeyCode: 'KeyM',
  },
  {
    id: 'series',
    label: 'Series',
    path: '/library?type=tv',
    aliases: ['series', 'shows', 'tv'],
    shortcutLabel: 'Ctrl/Cmd+Shift+V',
    hotkeyCode: 'KeyV',
  },
  {
    id: 'downloads',
    label: 'Downloads',
    path: '/downloads',
    aliases: ['downloads', 'queue', 'activity', 'download', 'dl', 'dls'],
    shortcutLabel: 'Ctrl/Cmd+Shift+D',
    hotkeyCode: 'KeyD',
  },
  {
    id: 'system-status',
    label: 'System Status',
    path: '/status',
    aliases: ['status', 'health', 'system', 'sys'],
    shortcutLabel: 'Ctrl/Cmd+Shift+Y',
    hotkeyCode: 'KeyY',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    aliases: ['settings', 'config', 'preferences'],
    shortcutLabel: 'Ctrl/Cmd+Shift+E',
    hotkeyCode: 'KeyE',
  },
]

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

const scoreCommand = (query: string, command: Command) => {
  const q = query.trim().toLowerCase()
  if (!q) return 60

  const label = command.label.toLowerCase()
  const aliases = command.aliases.map((alias) => alias.toLowerCase())
  const compactQuery = q.replace(/\s+/g, '')
  const compactLabel = label.replace(/\s+/g, '')
  const initials = label.split(/\s+/).map((part) => part[0]).join('')
  const aliasInitials = aliases.map((alias) => alias.split(/\s+/).map((part) => part[0]).join(''))

  if (label === q || aliases.includes(q)) return 100
  if (label.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) return 90
  if (initials.startsWith(compactQuery) || aliasInitials.some((alias) => alias.startsWith(compactQuery))) return 85
  if (compactLabel.includes(compactQuery) || aliases.some((alias) => alias.replace(/\s+/g, '').includes(compactQuery))) return 78
  if (label.split(/\s+/).some((part) => part.startsWith(q)) || aliases.some((alias) => alias.split(/\s+/).some((part) => part.startsWith(q)))) return 82
  if (label.includes(q) || aliases.some((alias) => alias.includes(q))) return 68
  return -1
}

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lockedResultsHeight, setLockedResultsHeight] = useState<number | null>(null)

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim()
    const commandMatches = COMMANDS
      .map((command) => ({
        kind: 'command' as const,
        id: command.id,
        label: command.label,
        path: command.path,
        shortcutLabel: command.shortcutLabel,
        score: scoreCommand(q, command),
      }))
      .filter((result) => result.score >= 0)
      .sort((a, b) => b.score - a.score)

    if (!q) return commandMatches

    const searchItem: ResultItem = {
      kind: 'search',
      id: 'search-query',
      label: `Search "${q}"`,
      path: `/?q=${encodeURIComponent(q)}`,
      queryValue: q,
      score: 75,
    }

    const merged = [...commandMatches, searchItem].sort((a, b) => b.score - a.score)
    return merged
  }, [query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) {
      setLockedResultsHeight(null)
      return
    }
    if (lockedResultsHeight !== null) return

    const frame = window.requestAnimationFrame(() => {
      if (!resultsRef.current) return
      setLockedResultsHeight(resultsRef.current.scrollHeight)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open, lockedResultsHeight, results.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return

      const hotkeyCommand = COMMANDS.find((command) => event.shiftKey && event.code === command.hotkeyCode)
      if (hotkeyCommand) {
        event.preventDefault()
        setOpen(false)
        setQuery('')
        router.push(hotkeyCommand.path)
        return
      }

      if (event.key.toLowerCase() === 'k' || event.code === 'Space') {
        if (isEditableTarget(event.target) && event.key.toLowerCase() !== 'k') return
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open])

  const execute = (item: ResultItem) => {
    setOpen(false)
    setQuery('')
    if (item.kind === 'search') {
      if (typeof window !== 'undefined') {
        const searchQuery = (item.queryValue || '').trim()
        if (searchQuery) {
          window.sessionStorage.setItem(PALETTE_AI_QUERY_KEY, searchQuery)
          window.dispatchEvent(new CustomEvent(PALETTE_AI_EVENT, { detail: { query: searchQuery } }))
        }
      }
      if (pathname !== '/') router.push('/')
      return
    }
    router.push(item.path)
  }

  const handlePaletteKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = results[selectedIndex]
      if (item) execute(item)
    }
  }

  if (!open || pathname === '/login') return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 py-6 md:py-10">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="border-b border-slate-700/40 p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handlePaletteKeyDown}
            placeholder="Search media or type a page name..."
            className="w-full rounded-md border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
          <div className="mt-2 text-[11px] text-slate-500">
            Open: Ctrl/Cmd+K or Ctrl+Space
          </div>
        </div>

        <div
          ref={resultsRef}
          className="max-h-[420px] overflow-y-auto"
          style={lockedResultsHeight ? { height: `${lockedResultsHeight}px` } : undefined}
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No matches</div>
          ) : (
            results.map((item, index) => {
              const active = index === selectedIndex
              const isCurrent = item.kind === 'command' && item.path === pathname
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => execute(item)}
                  className={`w-full px-4 py-3 border-b border-slate-800/70 text-left transition-colors ${
                    active ? 'bg-cyan-600/20 text-cyan-100' : 'bg-transparent text-slate-200 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{item.label}</span>
                    {isCurrent && <span className="text-[10px] uppercase tracking-wide text-emerald-300">Current</span>}
                    {'shortcutLabel' in item && item.shortcutLabel ? (
                      <span className="ml-auto text-[11px] text-slate-400">{item.shortcutLabel}</span>
                    ) : (
                      <span className="ml-auto text-[11px] text-slate-500">Enter</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
