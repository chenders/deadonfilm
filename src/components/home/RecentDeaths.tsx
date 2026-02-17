import { Link } from "react-router-dom"
import { useRecentDeaths } from "@/hooks/useRecentDeaths"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import { PersonIcon } from "@/components/icons"
import { formatDate } from "@/utils/formatDate"
import CauseOfDeathBadge from "@/components/common/CauseOfDeathBadge"

function formatDateRange(birthday: string | null, deathday: string): string {
  const deathStr = formatDate(deathday)
  if (birthday) {
    return `${formatDate(birthday)} – ${deathStr}`
  }
  return `Died ${deathStr}`
}

export default function RecentDeaths() {
  const { data, isLoading, error } = useRecentDeaths(6)

  if (isLoading) {
    return (
      <div className="mt-6 md:mt-8">
        <div className="animate-pulse">
          <div className="mx-auto mb-4 h-6 w-40 rounded bg-brown-medium/20" />
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`flex gap-4 rounded-lg bg-brown-medium/20 p-3 ${i >= 3 ? "hidden md:flex" : ""}`}
              >
                <div className="h-28 w-20 flex-shrink-0 rounded bg-brown-medium/30" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-5 w-3/4 rounded bg-brown-medium/30" />
                  <div className="h-4 w-full rounded bg-brown-medium/30" />
                  <div className="h-4 w-1/2 rounded bg-brown-medium/30" />
                  <div className="h-3 w-2/3 rounded bg-brown-medium/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data || data.deaths.length === 0) {
    return null // Silently fail - this is an enhancement feature
  }

  // Ensure even count so the 2-col desktop grid never has an orphan row
  const deaths = data.deaths.length % 2 === 0 ? data.deaths : data.deaths.slice(0, -1)

  return (
    <section data-testid="recent-deaths" className="mt-6 md:mt-8">
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
        className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3"
      >
        {deaths.map((death, index) => {
          const knownForTitles =
            death.known_for
              ?.slice(0, 2)
              .map((w) => (w.year ? `${w.name} (${w.year})` : w.name))
              .join(", ") || null

          return (
            <Link
              key={death.id}
              to={`/actor/${createActorSlug(death.name, death.id)}`}
              className={`animate-fade-slide-in flex items-start gap-4 rounded-lg bg-beige p-3 text-left transition-colors hover:bg-cream ${index >= 3 ? "hidden md:flex" : ""}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {death.profile_path ? (
                <img
                  src={getProfileUrl(death.profile_path, "w185")!}
                  alt={death.name}
                  width={80}
                  height={112}
                  loading="lazy"
                  className="h-28 w-20 flex-shrink-0 rounded object-cover"
                />
              ) : death.fallback_profile_url ? (
                <img
                  src={death.fallback_profile_url}
                  alt={death.name}
                  width={80}
                  height={112}
                  loading="lazy"
                  className="h-28 w-20 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-28 w-20 flex-shrink-0 items-center justify-center rounded bg-brown-medium/20">
                  <PersonIcon size={32} className="text-text-muted" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-bold text-accent" title={death.name}>
                  {death.name}
                </h3>
                <p className="text-sm text-text-primary">
                  {formatDateRange(death.birthday, death.deathday)}
                </p>
                {death.age_at_death != null && (
                  <p className="text-sm text-text-primary">Age: {death.age_at_death}</p>
                )}
                {death.cause_of_death && (
                  <p className="mt-0.5 text-sm text-text-muted">
                    <CauseOfDeathBadge
                      causeOfDeath={death.cause_of_death}
                      causeOfDeathDetails={death.cause_of_death_details}
                      testId={`death-details-tooltip-${death.tmdb_id}`}
                    />
                  </p>
                )}
                {knownForTitles && (
                  <p className="mt-0.5 line-clamp-2 text-sm italic text-text-muted">
                    {knownForTitles}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
