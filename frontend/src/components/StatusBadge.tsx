import type { DiscoveryResult } from '@/types'

const statusConfig = {
  'not_in_library': {
    text: 'Not in library',
    icon: '○',
    gradient: 'from-slate-600/40 to-slate-700/40',
    border: 'border-slate-500/50',
    glow: 'hover:shadow-[0_0_12px_rgba(148,163,184,0.3)]',
    textColor: 'text-slate-200',
  },
  'in_library': {
    text: 'In library (not downloaded)',
    icon: '◉',
    gradient: 'from-violet-600/40 to-violet-700/40',
    border: 'border-violet-500/50',
    glow: 'hover:shadow-[0_0_12px_rgba(139,92,246,0.4)]',
    textColor: 'text-violet-200',
  },
  'partial': {
    text: 'In library (partial)',
    icon: '◐',
    gradient: 'from-teal-600/40 to-teal-700/40',
    border: 'border-teal-500/50',
    glow: 'hover:shadow-[0_0_12px_rgba(20,184,166,0.4)]',
    textColor: 'text-teal-200',
  },
  'downloaded': {
    text: 'In library (downloaded)',
    icon: '●',
    gradient: 'from-emerald-600/40 to-emerald-700/40',
    border: 'border-emerald-500/50',
    glow: 'hover:shadow-[0_0_12px_rgba(16,185,129,0.4)]',
    textColor: 'text-emerald-200',
  },
} as const

export function StatusBadge({ status }: { status?: DiscoveryResult['status'] | string }) {
  const normalizedStatus = (status && status in statusConfig)
    ? (status as keyof typeof statusConfig)
    : 'not_in_library'

  const config = statusConfig[normalizedStatus]

  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-2 py-0.5 rounded-md text-2xs font-medium
        bg-gradient-to-br ${config.gradient}
        border ${config.border}
        ${config.textColor} ${config.glow}
        backdrop-blur-sm
        transition-all duration-200
        shadow-sm
      `}
      title={config.text}
      aria-label={config.text}
    >
      <span className="text-xs">{config.icon}</span>
      <span className="hidden sm:inline">
        {normalizedStatus === 'not_in_library' ? 'Available' :
         normalizedStatus === 'in_library' ? 'Added' :
         normalizedStatus === 'partial' ? 'Partial' :
         'Downloaded'}
      </span>
    </span>
  )
}
