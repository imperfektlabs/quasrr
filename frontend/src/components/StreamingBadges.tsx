import type { StreamingService } from '@/types'
import { getStreamingLogo } from '@/utils/streaming'

export function StreamingBadges({ services }: { services: StreamingService[] }) {
  if (!services.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => (
        <span key={service.id} className="glass-chip px-2 py-1 rounded inline-flex items-center">
          {getStreamingLogo(service.id) ? (
            <img
              src={getStreamingLogo(service.id)}
              alt={service.name}
              className="h-5 w-auto max-w-[64px] object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-xs text-slate-200">{service.name}</span>
          )}
        </span>
      ))}
    </div>
  )
}
