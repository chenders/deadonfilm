import { Link } from "react-router-dom"
import { useRecentDeaths } from "@/hooks/useRecentDeaths"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import { PersonIcon } from "@/components/icons"
import { formatDate } from "@/utils/formatDate"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"

export default function RecentDeaths() {
  // Fetch 8 for 2 rows of 4 on desktop, or 2 rows of 2 on mobile
  const { data, isLoading, error } = useRecentDeaths(8)

  if (isLoading) {
    return (
      <div className="mt-8">
        <div className="animate-pulse">
          <div className="mx-auto mb-4 h-6 w-40 rounded bg-brown-medium/20" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-brown-medium/20" />
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
      <div className="mb-4 flex items-center justify-between">
        <h2 data-testid="recent-deaths-title" className="font-display text-xl text-brown-dark">
          Recent Passings
        </h2>
        <Link
          to="/deaths/all"
          data-testid="view-all-deaths-link"
          className="text-sm text-brown-medium hover:text-brown-dark"
        >
          View all &rarr;
        </Link>
      </div>

      <div data-testid="recent-deaths-list" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.deaths.map((death, index) => (
          <Link
            key={death.tmdb_id}
            to={`/actor/${createActorSlug(death.name, death.tmdb_id)}`}
            className="animate-fade-slide-in flex flex-col items-center rounded-lg bg-beige p-3 text-center transition-colors hover:bg-cream"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {death.profile_path ? (
              <img
                src={getProfileUrl(death.profile_path, "w185")!}
                alt={death.name}
                width={64}
                height={80}
                loading="lazy"
                className="mb-2 h-20 w-16 rounded object-cover"
              />
            ) : (
              <div className="mb-2 flex h-20 w-16 items-center justify-center rounded bg-brown-medium/20">
                <PersonIcon size={28} className="text-text-muted" />
              </div>
            )}

            <h3 className="w-full truncate text-sm font-medium text-brown-dark" title={death.name}>
              {death.name}
            </h3>
            <p className="text-xs text-accent">{formatDate(death.deathday)}</p>
            {death.cause_of_death && (
              <p className="mt-1 w-full truncate text-xs text-text-muted">
                <CauseOfDeathBadge
                  causeOfDeath={death.cause_of_death}
                  causeOfDeathDetails={death.cause_of_death_details}
                  testId={`death-details-tooltip-${death.tmdb_id}`}
                />
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
