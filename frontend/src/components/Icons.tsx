import type { IconProps } from '@/types'

export const DownloadIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v7" />
    <path d="M8.5 11.5 12 15l3.5-3.5" />
    <path d="M7.5 16.5h9" />
  </svg>
)

export const DownloadAllIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v7" />
    <path d="M8.5 11.5 12 15l3.5-3.5" />
    <path d="M7.5 16.5h9" />
    <path d="M16.5 7.5h3" />
    <path d="M18 6v3" />
  </svg>
)
