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
      <div className="mt-6 sm:mt-8">
        <div className="animate-pulse">
          <div className="mx-auto mb-4 h-6 w-40 rounded bg-brown-medium/20" />
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:gap-3">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className={`h-[68px] rounded-lg bg-brown-medium/20 sm:h-32 ${i >= 3 ? "hidden sm:block" : ""}`}
              />
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
    <section data-testid="recent-deaths" className="mt-6 sm:mt-8">
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

      <div
        data-testid="recent-deaths-list"
        className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:gap-3"
      >
        {data.deaths.map((death, index) => (
          <Link
            key={death.id}
            to={`/actor/${createActorSlug(death.name, death.id)}`}
            className={`animate-fade-slide-in flex items-center gap-3 rounded-lg bg-beige p-2 text-left transition-colors hover:bg-cream sm:w-auto sm:flex-col sm:items-center sm:p-3 sm:text-center ${index >= 3 ? "hidden sm:flex" : ""}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {death.profile_path ? (
              <img
                src={getProfileUrl(death.profile_path, "w185")!}
                alt={death.name}
                width={64}
                height={80}
                loading="lazy"
                className="h-20 w-16 flex-shrink-0 rounded object-cover sm:mb-2"
              />
            ) : death.fallback_profile_url ? (
              <img
                src={death.fallback_profile_url}
                alt={death.name}
                width={64}
                height={80}
                loading="lazy"
                className="h-20 w-16 flex-shrink-0 rounded object-cover sm:mb-2"
              />
            ) : (
              <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center rounded bg-brown-medium/20 sm:mb-2">
                <PersonIcon size={28} className="text-text-muted" />
              </div>
            )}

            <div className="min-w-0 sm:w-full">
              <h3
                className="text-sm font-medium text-brown-dark sm:w-full sm:truncate"
                title={death.name}
              >
                {death.name}
              </h3>
              <p className="text-xs text-accent">{formatDate(death.deathday)}</p>
              {death.cause_of_death && (
                <p className="mt-0.5 text-xs text-text-muted sm:mt-1 sm:w-full sm:truncate">
                  <CauseOfDeathBadge
                    causeOfDeath={death.cause_of_death}
                    causeOfDeathDetails={death.cause_of_death_details}
                    testId={`death-details-tooltip-${death.tmdb_id}`}
                  />
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
