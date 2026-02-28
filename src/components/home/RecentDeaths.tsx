import { Link } from "react-router-dom"
import { useRecentDeaths } from "@/hooks/useRecentDeaths"
import { createActorSlug } from "@/utils/slugify"
import ActorCard from "@/components/common/ActorCard"

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

  // Ensure even count so the 2-col desktop grid never has an orphan row,
  // but still display a single item when only one death is available
  const deaths =
    data.deaths.length === 1
      ? data.deaths
      : data.deaths.length % 2 === 0
        ? data.deaths
        : data.deaths.slice(0, -1)

  // Prioritize the first visible card that actually renders an image (LCP candidate).
  // Cards at index >= 3 are hidden on mobile, so limit search to the visible subset.
  const VISIBLE_CARD_COUNT = 3
  const firstImageIndex = deaths
    .slice(0, VISIBLE_CARD_COUNT)
    .findIndex((d) => d.profile_path || d.fallback_profile_url)

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
        {deaths.map((death, index) => (
          <div
            key={death.id}
            className={`animate-fade-slide-in ${index >= 3 ? "hidden md:flex" : ""}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <ActorCard
              name={death.name}
              slug={createActorSlug(death.name, death.id)}
              profilePath={death.profile_path}
              fallbackProfileUrl={death.fallback_profile_url}
              deathday={death.deathday}
              birthday={death.birthday}
              ageAtDeath={death.age_at_death}
              causeOfDeath={death.cause_of_death}
              causeOfDeathDetails={death.cause_of_death_details}
              knownFor={death.known_for}
              showBirthDate
              useCauseOfDeathBadge
              nameColor="accent"
              priority={index === firstImageIndex}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
