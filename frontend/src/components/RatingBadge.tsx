import type { Rating } from '@/types'
import { formatRating, formatRatingSource } from '@/utils/formatting'

export function RatingBadge({ rating, href }: { rating: Rating; href?: string | null }) {
  const source = rating.source.toLowerCase()
  const label = formatRatingSource(source)
  const value = formatRating(rating)

  const logoMap: Record<string, string> = {
    imdb: '/logos/ratings/imdb.svg',
    tmdb: '/logos/ratings/tmdb.svg',
    tdb: '/logos/ratings/tmdb.svg',
    justwatch: '/logos/ratings/justwatch.png',
    metacritic: '/logos/ratings/metacritic.svg',
    rottentomatoes: '/logos/ratings/rottentomatoes.svg',
    tvdb: '/logos/ratings/tvdb.svg',
  }

  const logo = logoMap[source]

  // Color coding based on rating value
  const ratingValue = rating.value
  const colorClass = ratingValue >= 7.5
    ? 'from-emerald-600/30 to-emerald-700/30 border-emerald-500/40 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]'
    : ratingValue >= 6.0
    ? 'from-yellow-600/30 to-yellow-700/30 border-yellow-500/40 hover:shadow-[0_0_12px_rgba(234,179,8,0.3)]'
    : 'from-orange-600/30 to-orange-700/30 border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.3)]'

  const content = (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2 py-0.5 rounded-md text-2xs font-medium
        bg-gradient-to-br ${colorClass}
        border backdrop-blur-sm
        text-slate-100
        transition-all duration-200
        shadow-sm
      `}
    >
      {logo ? (
        <img
          src={logo}
          alt={label}
          className="h-3.5 w-auto max-w-[48px] object-contain opacity-90"
          loading="lazy"
        />
      ) : (
        <span className="text-slate-200 font-semibold text-2xs">{label}</span>
      )}
      <span className="font-semibold">{value}</span>
    </span>
  )

  if (!href) return content

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex hover:scale-105 transition-transform"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  )
}
