import { useRecentDeaths } from "@/hooks/useRecentDeaths"
import { getProfileUrl } from "@/services/api"
import { PersonIcon } from "@/components/icons"
import { formatRelativeDate } from "@/utils/formatDate"

export default function RecentDeaths() {
  const { data, isLoading, error } = useRecentDeaths(5)

  if (isLoading) {
    return (
      <div className="mt-8 rounded-lg bg-beige p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-40 rounded bg-brown-medium/20" />
          <div className="flex gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 w-16 rounded bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data || data.deaths.length === 0) {
    return null // Silently fail - this is an enhancement feature
  }

  return (
    <section data-testid="recent-deaths" className="mt-8">
      <h2
        data-testid="recent-deaths-title"
        className="mb-4 text-center font-display text-xl text-brown-dark"
      >
        Recently Added
      </h2>

      <div
        data-testid="recent-deaths-list"
        className="flex justify-center gap-3 overflow-x-auto pb-2"
      >
        {data.deaths.map((death, index) => (
          <div
            key={death.tmdb_id}
            className="animate-fade-slide-in flex flex-col items-center rounded-lg bg-beige p-3 text-center"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {death.profile_path ? (
              <img
                src={getProfileUrl(death.profile_path, "w185")!}
                alt={death.name}
                className="mb-2 h-20 w-16 rounded object-cover"
              />
            ) : (
              <div className="mb-2 flex h-20 w-16 items-center justify-center rounded bg-brown-medium/20">
                <PersonIcon size={28} className="text-text-muted" />
              </div>
            )}

            <h3 className="w-24 truncate text-sm font-medium text-brown-dark" title={death.name}>
              {death.name}
            </h3>
            <p className="text-xs text-accent">{formatRelativeDate(death.deathday)}</p>
            {death.cause_of_death && (
              <p className="mt-1 w-24 truncate text-xs text-text-muted" title={death.cause_of_death}>
                {death.cause_of_death}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
