import { Link } from "react-router-dom"
import { useThisWeekDeaths } from "@/hooks/useThisWeekDeaths"
import { getProfileUrl } from "@/services/api"
import { createActorSlug } from "@/utils/slugify"
import { PersonIcon } from "@/components/icons"

export default function ThisWeekDeaths() {
  const { data, isLoading, error } = useThisWeekDeaths()

  if (isLoading) {
    return (
      <section data-testid="this-week-deaths" className="mt-8">
        <div className="animate-pulse rounded-lg bg-beige p-4">
          <div className="mb-3 h-5 w-56 rounded bg-brown-medium/20" />
          <div className="flex gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 w-16 rounded bg-brown-medium/20" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || !data || data.deaths.length === 0) {
    return null
  }

  return (
    <section data-testid="this-week-deaths" className="mt-8">
      <h2
        data-testid="this-week-title"
        className="mb-3 text-center font-display text-xl text-brown-dark"
      >
        This Week in History ({data.weekRange.start} - {data.weekRange.end})
      </h2>

      <div data-testid="this-week-list" className="flex justify-center gap-3 overflow-x-auto pb-2">
        {data.deaths.slice(0, 8).map((death, index) => (
          <Link
            key={death.id}
            to={`/actor/${createActorSlug(death.name, death.id)}`}
            className="animate-fade-slide-in flex w-20 flex-col items-center rounded-lg bg-beige p-2 text-center transition-colors hover:bg-cream"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {death.profilePath ? (
              <img
                src={getProfileUrl(death.profilePath, "w185")!}
                alt={death.name}
                width={56}
                height={70}
                loading="lazy"
                className="mb-1 h-[70px] w-14 rounded object-cover"
              />
            ) : (
              <div className="mb-1 flex h-[70px] w-14 items-center justify-center rounded bg-brown-medium/20">
                <PersonIcon size={24} className="text-text-muted" />
              </div>
            )}

            <h3 className="w-full truncate text-xs font-medium text-brown-dark" title={death.name}>
              {death.name}
            </h3>
            <p className="text-xs text-accent">
              {new Date(death.deathday + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
            <p className="text-xs text-text-muted">{death.yearOfDeath}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
