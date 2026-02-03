import type { DiscoveryResult } from '@/types'

const statusConfig = {
  'not_in_library': {
    text: 'Not in library',
    icon: '○',
    bg: 'bg-slate-700/60',
    textColor: 'text-slate-200',
  },
  'in_library': {
    text: 'In library (not downloaded)',
    icon: '◉',
    bg: 'bg-violet-900/60',
    textColor: 'text-violet-200',
  },
  'partial': {
    text: 'In library (partial)',
    icon: '◐',
    bg: 'bg-teal-900/60',
    textColor: 'text-teal-200',
  },
  'downloaded': {
    text: 'In library (downloaded)',
    icon: '●',
    bg: 'bg-emerald-900/60',
    textColor: 'text-emerald-200',
  },
} as const

export function StatusBadge({ status }: { status?: DiscoveryResult['status'] | string }) {
  const config = (status && status in statusConfig)
    ? statusConfig[status as keyof typeof statusConfig]
    : statusConfig['not_in_library']

  return (
    <span
      className={`px-2 py-1 rounded text-xs ${config.bg} ${config.textColor}`}
      title={config.text}
      aria-label={config.text}
    >
      {config.icon}
    </span>
  )
}
