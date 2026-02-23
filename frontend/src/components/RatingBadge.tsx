import type { Rating } from '@/types'
import { formatRating, formatRatingSource } from '@/utils/formatting'

export function RatingBadge({ rating, href }: { rating: Rating; href?: string | null }) {
  const source = rating.source.toLowerCase()
  const label = formatRatingSource(source)
  const value = formatRating(rating)

  const logoMap: Record<string, string> = {
    imdb: 'https://cdn.brandfetch.io/idsm3ekCSb/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1667571542374',
    tmdb: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/tmdb.svg',
    tdb: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/tmdb.svg',
    justwatch: 'https://upload.wikimedia.org/wikipedia/commons/a/af/JustWatch_Logo.svg',
    metacritic: 'https://image.pngaaa.com/447/2540447-middle.png',
    rottentomatoes: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg',
    rotten_tomatoes: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg',
    rt: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg',
    tvdb: 'https://titlecardmaker.com/getting_started/connections/assets/tvdb-dark.png',
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
