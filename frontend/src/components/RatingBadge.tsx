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

  const content = (
    <span className="rating-chip text-xs px-2 py-1 rounded inline-flex items-center gap-2">
      {logo ? (
        <img
          src={logo}
          alt={label}
          className="h-5 w-auto max-w-[64px] object-contain"
          loading="lazy"
        />
      ) : (
        <span className="text-slate-200 font-semibold">{label}</span>
      )}
      <span className="text-slate-200">{value}</span>
    </span>
  )

  if (!href) return content

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  )
}
