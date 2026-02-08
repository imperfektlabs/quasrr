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

export const EyeIcon = ({ className }: IconProps) => (
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
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const DriveStackIcon = ({ className }: IconProps) => (
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
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
)

export const ProjectorIcon = ({ className }: IconProps) => (
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
    <rect x="3" y="9" width="14" height="8" rx="2" />
    <circle cx="6.5" cy="7.5" r="2" />
    <circle cx="12" cy="7.5" r="2" />
    <path d="M18 10.5l3 1.5-3 1.5v-3Z" />
    <path d="M9.25 12.2 11.8 13.6 9.25 15Z" />
  </svg>
)

export const TvIcon = ({ className }: IconProps) => (
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
    <rect x="3" y="7" width="18" height="11" rx="3" />
    <path d="M9 4l3 3 3-3" />
    <circle cx="18" cy="12" r="1" />
    <circle cx="18" cy="15" r="1" />
  </svg>
)

export const ArrowUpLineIcon = ({ className }: IconProps) => (
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
    <path d="M12 17V7" />
    <path d="M8.5 10.5 12 7l3.5 3.5" />
    <path d="M6 19h12" />
  </svg>
)

export const ArrowDownLineIcon = ({ className }: IconProps) => (
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
    <path d="M12 7v10" />
    <path d="M8.5 13.5 12 17l3.5-3.5" />
    <path d="M6 19h12" />
  </svg>
)

export const SearchIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
)

export const ReelIcon = ({ className }: IconProps) => (
  <img
    src="/reel.png"
    alt=""
    aria-hidden="true"
    className={`object-contain brightness-0 invert ${className || ''}`.trim()}
  />
)
