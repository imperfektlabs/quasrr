import type { DiscoveryResult } from '@/types'

export function StatusBadge({ status }: { status: DiscoveryResult['status'] }) {
  const config = {
    'not_in_library': {
      text: 'Not in library',
      icon: '○',
      bg: 'bg-slate-700/60',
      textColor: 'text-slate-200',
    },
    'in_library': {
      text: 'In library (not downloaded)',
      icon: '◐',
      bg: 'bg-violet-900/60',
      textColor: 'text-violet-200',
    },
    'downloaded': {
      text: 'In library (downloaded)',
      icon: '✓',
      bg: 'bg-cyan-900/60',
      textColor: 'text-cyan-200',
    },
  }[status]

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
